"""Persisted proposals and atomic human approval; never exposed as Agent tools."""
from datetime import date, datetime, time, timedelta
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from app import database as db
from app.errors import ConflictError, NotFoundError
from app.models import Model, Proposal
from app.planning import KST, PlanBlock, TimeRange, validate_plan
from app.storage_service import block, json_row


class ReviewBlock(Model):
    task_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=120)
    start_datetime: AwareDatetime
    end_datetime: AwareDatetime


class PlanBefore(ReviewBlock):
    id: int = Field(gt=0)
    status: Literal["PLANNED", "COMPLETED"]
    source: Literal["MANUAL", "AGENT"]
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ReviewChange(Model):
    operation: Literal["MOVE", "DELETE"]
    plan_id: int = Field(gt=0)
    before: PlanBefore
    after: ReviewBlock | None

    @model_validator(mode="after")
    def valid_operation(self):
        if self.plan_id != self.before.id:
            raise ValueError("Plan identifier mismatch")
        if (self.operation == "DELETE") != (self.after is None):
            raise ValueError("MOVE needs a replacement; DELETE must not have one")
        return self


class Remaining(Model):
    task_id: int
    remaining_count: int = Field(gt=0)


class Review(Model):
    status: Literal["PROPOSED_NOT_SAVED"] = "PROPOSED_NOT_SAVED"
    fixture_only: Literal[False] = False
    mock_data: Literal[False] = False
    week_start: date
    explanation: str = Field(min_length=1, max_length=4000)
    blocks: list[ReviewBlock] = Field(max_length=49)
    changes: list[ReviewChange] = Field(default_factory=list, max_length=49)
    unallocated: list[Remaining]

    @model_validator(mode="after")
    def bounded(self):
        if len(self.blocks) + len(self.changes) > 49:
            raise ValueError("Too many operations")
        return self


class ExecutionResult(Model):
    created_plan_ids: list[int] = Field(default_factory=list)
    updated_plan_ids: list[int] = Field(default_factory=list)
    deleted_plan_ids: list[int] = Field(default_factory=list)


class ActionResponse(Model):
    id: int
    action_type: Literal["PLAN_CHANGES"]
    status: Literal["PENDING", "APPROVED", "REJECTED", "EXECUTED"]
    proposal: Review
    result: ExecutionResult | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    approved_at: AwareDatetime | None
    executed_at: AwareDatetime | None


def remaining_plans(rows, week_start, excluded):
    start = datetime.combine(week_start, time(), KST)
    end = start + timedelta(days=7)
    return [block(row) for row in rows if row["id"] not in excluded
            and block(row).time.start < end and block(row).time.end > start]


def render_review(service, repository, proposal: Proposal):
    """Resolve Agent identifiers into an exact, reviewable before/after proposal."""
    snapshot = service._snapshot(repository)
    rows = repository.list(db.plans)
    targets = {}
    for change in proposal.changes:
        if change.plan_id in targets:
            raise ConflictError("A plan may only be changed once in a proposal")
        row = repository.get(db.plans, change.plan_id)
        if row["status"] != "PLANNED" or not (
            snapshot.monday <= block(row).time.start.date() < snapshot.monday + timedelta(days=7)
        ):
            raise ConflictError("Only unfinished plans in the current week can be changed")
        targets[change.plan_id] = row
    snapshot.current_plan = remaining_plans(rows, snapshot.monday, targets)
    assignments = list(proposal.assignments)
    for change in proposal.changes:
        if change.operation == "MOVE":
            assignments.append({"task_id": targets[change.plan_id]["task_id"], "slot_id": change.slot_id})
    combined = snapshot.render_proposal(Proposal(explanation=proposal.explanation, assignments=assignments))
    # The engine returns sorted blocks. Resolve by task and start rather than list order.
    available = {(item["task_id"], item["start_datetime"]): item for item in combined["blocks"]}
    moves = []
    moved_keys = set()
    for change in proposal.changes:
        after = None
        if change.operation == "MOVE":
            key = (targets[change.plan_id]["task_id"], change.slot_id)
            after = available[key]
            moved_keys.add(key)
            if block(targets[change.plan_id]).time.start.isoformat() == after["start_datetime"]:
                raise ConflictError("A move must change the start time")
        moves.append({"operation": change.operation, "plan_id": change.plan_id,
                      "before": json_row(targets[change.plan_id]), "after": after})
    combined["blocks"] = [item for key, item in available.items() if key not in moved_keys]
    combined.update(changes=moves, week_start=snapshot.monday.isoformat())
    return Review.model_validate(combined).model_dump(mode="json")


class ActionService:
    def __init__(self, service):
        self.service = service
        self.database = service.database

    @staticmethod
    def _response(row):
        return ActionResponse(
            **{key: value for key, value in row.items() if key not in {"payload", "baseline"}},
            proposal=Review.model_validate(row["payload"]),
        ).model_dump(mode="json")

    def _validate(self, repository, review):
        snapshot = self.service._snapshot(repository)
        if review.week_start != snapshot.monday:
            raise ConflictError("This proposal belongs to an earlier week; request a new proposal")
        targets, task_ids = set(), set()
        for change in review.changes:
            if change.plan_id in targets:
                raise ConflictError("Duplicate plan change")
            targets.add(change.plan_id)
            try:
                row = repository.get(db.plans, change.plan_id)
            except NotFoundError:
                raise ConflictError("A referenced plan was removed; request a new proposal") from None
            current = PlanBefore.model_validate(json_row(row))
            if current != change.before or current.status != "PLANNED":
                raise ConflictError("A referenced plan changed; request a new proposal")
            if not snapshot.monday <= block(row).time.start.date() < snapshot.monday + timedelta(days=7):
                raise ConflictError("The referenced plan is outside the proposal week")
            task_ids.add(current.task_id)
            if change.after and change.after.start_datetime == current.start_datetime:
                raise ConflictError("A move must change the start time")
            if change.after and change.after.task_id != current.task_id:
                raise ConflictError("Moving a plan cannot change its task")
        rows = repository.list(db.plans)
        existing = remaining_plans(rows, snapshot.monday, targets)
        proposed = []
        for item in review.blocks + [change.after for change in review.changes if change.after]:
            task_ids.add(item.task_id)
            task = next((task for task in snapshot.tasks if task.id == item.task_id), None)
            if task is None or task.title != item.title:
                raise ConflictError("A referenced task changed; request a new proposal")
            proposed.append(PlanBlock(item.task_id, TimeRange(item.start_datetime, item.end_datetime)))
        try:
            validate_plan(proposed, snapshot.tasks, snapshot.monday, snapshot.current_time(),
                          snapshot.preferences, snapshot.fixed_ranges(), existing)
        except ValueError:
            raise ConflictError("The proposal no longer fits current constraints; request a new proposal") from None
        return task_ids

    def propose(self, value):
        review = Review.model_validate(value)
        if not review.blocks and not review.changes:
            return {**review.model_dump(mode="json"), "action_id": None}
        with self.database.transaction(write=True) as repository:
            task_ids = self._validate(repository, review)
            baseline = {str(identifier): json_row(repository.get(db.tasks, identifier)) for identifier in task_ids}
            now = self.service.current_time()
            row = repository.insert(db.pending_actions, {
                "action_type": "PLAN_CHANGES", "status": "PENDING",
                "payload": review.model_dump(mode="json"), "baseline": baseline, "result": None,
                "created_at": now, "updated_at": now, "approved_at": None, "executed_at": None,
            })
            return {**review.model_dump(mode="json"), "status": "PENDING", "action_id": row["id"]}

    def get(self, identifier):
        with self.database.transaction() as repository:
            return self._response(repository.get(db.pending_actions, identifier))

    def list_pending(self):
        with self.database.transaction() as repository:
            return [self._response(row) for row in repository.list(
                db.pending_actions, db.pending_actions.c.status == "PENDING")]

    def reject(self, identifier):
        with self.database.transaction(write=True) as repository:
            row = repository.get(db.pending_actions, identifier)
            if row["status"] == "REJECTED":
                return self._response(row)
            if row["status"] != "PENDING":
                raise ConflictError("An executed action cannot be rejected")
            row = repository.update(db.pending_actions, identifier, {
                "status": "REJECTED", "updated_at": self.service.current_time()})
            return self._response(row)

    def approve(self, identifier):
        with self.database.transaction(write=True) as repository:
            row = repository.get(db.pending_actions, identifier)
            if row["status"] == "EXECUTED":
                return self._response(row)
            if row["status"] != "PENDING":
                raise ConflictError("Only pending actions can be approved")
            review = Review.model_validate(row["payload"])
            for task_id, expected in row["baseline"].items():
                try:
                    current = json_row(repository.get(db.tasks, int(task_id)))
                except NotFoundError:
                    raise ConflictError("A referenced task was removed; request a new proposal") from None
                if current != expected:
                    raise ConflictError("A referenced task changed; request a new proposal")
            task_ids = self._validate(repository, review)
            now = self.service.current_time()
            repository.update(db.pending_actions, identifier, {"status": "APPROVED", "approved_at": now})
            result = ExecutionResult()
            for item in review.blocks:
                values = item.model_dump()
                values.update(status="PLANNED", source="AGENT", created_at=now, updated_at=now)
                saved = repository.insert(db.plans, values)
                result.created_plan_ids.append(saved["id"])
            for change in review.changes:
                if change.operation == "DELETE":
                    repository.delete(db.plans, change.plan_id)
                    result.deleted_plan_ids.append(change.plan_id)
                else:
                    values = change.after.model_dump()
                    values.update(status="PLANNED", source="AGENT", updated_at=now)
                    repository.update(db.plans, change.plan_id, values)
                    result.updated_plan_ids.append(change.plan_id)
            for task_id in task_ids:
                self.service._refresh_task_status(repository, task_id)
            row = repository.update(db.pending_actions, identifier, {
                "status": "EXECUTED", "updated_at": now, "executed_at": now,
                "result": result.model_dump(),
            })
            return self._response(row)
