"""Transactional application services. Agent reads never perform plan writes."""
from datetime import datetime, time, timedelta

from app import database as db
from app.inputs import ManualPlanInput, ScheduleInput
from app.models import Proposal, Task
from app.planning import KST, PlanBlock, Preferences, TimeRange, aware, daily_minutes, validate_plan
from app.services import PlanningSnapshot


def json_row(row):
    return {key: aware(value).isoformat() if isinstance(value, datetime) else
            value.isoformat() if hasattr(value, "isoformat") else value for key, value in row.items()}


def block(row):
    return PlanBlock(row["task_id"], TimeRange(row["start_datetime"], row["end_datetime"]))


class DatabasePlanningService:
    persistent = True

    def __init__(self, database: db.Database, *, now=None):
        self.database = database
        self._now = aware(now) if now is not None else None
        with database.transaction(write=True) as repository:
            if not repository.list(db.preferences):
                repository.insert(db.preferences, {"id": 1, **Preferences().model_dump()})

    def current_time(self):
        return self._now if self._now is not None else datetime.now(KST)

    def _snapshot(self, repository):
        now = self.current_time()
        monday = now.date() - timedelta(days=now.weekday())
        start = datetime.combine(monday, time(), KST)
        end = start + timedelta(days=7)
        pref = repository.get(db.preferences, 1)
        pref.pop("id")
        return PlanningSnapshot(
            tasks=[Task.model_validate(row) for row in repository.list(db.tasks)],
            schedules=[json_row(row) for row in repository.list(
                db.schedules, db.schedules.c.start_datetime < end, db.schedules.c.end_datetime > start)],
            preferences=Preferences.model_validate(pref),
            current_plan=[block(row) for row in repository.list(
                db.plans, db.plans.c.start_datetime < end, db.plans.c.end_datetime > start)],
            now=now, mock_data=False,
        )

    def get_tasks(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.tasks)]

    def get_task(self, identifier):
        with self.database.transaction() as repository:
            return Task.model_validate(repository.get(db.tasks, identifier))

    def add_task(self, title, minutes, priority="MEDIUM", count=1):
        now = self.current_time()
        task = Task(id=1, title=title, estimated_minutes=minutes, priority=priority,
                    weekly_target_count=count, created_at=now, updated_at=now)
        with self.database.transaction(write=True) as repository:
            return Task.model_validate(repository.insert(db.tasks, task.model_dump(exclude={"id"})))

    def update_task(self, identifier, **changes):
        allowed = {"title", "description", "estimated_minutes", "priority", "due_date",
                   "status", "category", "weekly_target_count"}
        if changes.keys() - allowed:
            raise ValueError("Unsupported task field")
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.tasks, identifier)
            task = Task.model_validate({**old, **changes, "updated_at": self.current_time()})
            linked = repository.list(db.plans, db.plans.c.task_id == identifier)
            if "status" in changes and task.status != "COMPLETED":
                expected = "PLANNED" if any(row["status"] == "PLANNED" for row in linked) else "TODO"
                if task.status != expected:
                    raise ValueError("Task status must agree with saved plans")
            # Keep already saved blocks stable; user can explicitly edit/delete them first.
            if linked and any(task.model_dump()[key] != old[key] for key in
                              ("estimated_minutes", "due_date", "weekly_target_count")):
                raise ValueError("Edit linked plans before changing duration, deadline or target")
            return Task.model_validate(repository.update(
                db.tasks, identifier, task.model_dump(exclude={"id"})))

    def delete_task(self, identifier):
        with self.database.transaction(write=True) as repository:
            if repository.list(db.plans, db.plans.c.task_id == identifier):
                raise ValueError("Delete linked plans before deleting this task")
            repository.delete(db.tasks, identifier)

    def get_fixed_schedules(self):
        with self.database.transaction() as repository:
            return self._snapshot(repository).get_fixed_schedules()

    def list_schedules(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.schedules)]

    def save_schedule(self, value: ScheduleInput, identifier=None):
        value = ScheduleInput.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            span = TimeRange(value.start_datetime, value.end_datetime)
            if any(span.overlaps(block(row).time) for row in repository.list(db.plans)):
                raise ValueError("Fixed schedule conflicts with a saved plan")
            row = (repository.insert(db.schedules, value.model_dump()) if identifier is None else
                   repository.update(db.schedules, identifier, value.model_dump()))
            return json_row(row)

    def delete_schedule(self, identifier):
        with self.database.transaction(write=True) as repository:
            repository.delete(db.schedules, identifier)

    def get_preferences(self):
        with self.database.transaction() as repository:
            pref = repository.get(db.preferences, 1)
            pref.pop("id")
            return {**Preferences.model_validate(pref).model_dump(mode="json"), "timezone": "Asia/Seoul"}

    def save_preferences(self, value: Preferences):
        value = Preferences.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            existing = [block(row) for row in repository.list(db.plans)]
            future = [item for item in existing if item.time.end > self.current_time()]
            for item in future:
                window = value.window(item.time.start.date())
                if item.time.start < window.start or item.time.end > window.end:
                    raise ValueError("Preferences would invalidate a saved plan")
            for day in {item.time.start.date() for item in future}:
                if daily_minutes(day, existing) > value.max_daily_planning_minutes:
                    raise ValueError("Preferences would exceed the daily planning limit")
            repository.update(db.preferences, 1, value.model_dump())
        return {**value.model_dump(mode="json"), "timezone": "Asia/Seoul"}

    def get_current_plan(self):
        with self.database.transaction() as repository:
            snapshot = self._snapshot(repository)
            start = datetime.combine(snapshot.monday, time(), KST)
            return [json_row(row) for row in repository.list(
                db.plans, db.plans.c.start_datetime < start + timedelta(days=7),
                db.plans.c.end_datetime > start)]

    def list_plans(self):
        with self.database.transaction() as repository:
            return [json_row(row) for row in repository.list(db.plans)]

    def get_available_time_slots(self):
        with self.database.transaction() as repository:
            return self._snapshot(repository).get_available_time_slots()

    def render_proposal(self, proposal: Proposal):
        with self.database.transaction() as repository:
            return self._snapshot(repository).render_proposal(proposal)

    def save_manual_plan(self, value: ManualPlanInput, identifier=None):
        value = ManualPlanInput.model_validate(value.model_dump())
        with self.database.transaction(write=True) as repository:
            task = Task.model_validate(repository.get(db.tasks, value.task_id))
            span = TimeRange(value.start_datetime,
                             value.start_datetime + timedelta(minutes=task.estimated_minutes))
            start = span.start.date() - timedelta(days=span.start.weekday())
            week_start = datetime.combine(start, time(), KST)
            week_end = week_start + timedelta(days=7)
            old = repository.get(db.plans, identifier) if identifier is not None else None
            if old and old["status"] == "COMPLETED":
                raise ValueError("Completed plan cannot be moved")
            existing_rows = repository.list(
                db.plans, db.plans.c.start_datetime < week_end, db.plans.c.end_datetime > week_start)
            existing = [block(row) for row in existing_rows if row["id"] != identifier]
            schedules = [TimeRange(row["start_datetime"], row["end_datetime"])
                         for row in repository.list(db.schedules)]
            pref = repository.get(db.preferences, 1)
            pref.pop("id")
            validate_plan([PlanBlock(task.id, span)], [task], start, self.current_time(),
                          Preferences.model_validate(pref), schedules, existing)
            now = self.current_time()
            values = {"task_id": task.id, "title": task.title, "start_datetime": span.start,
                      "end_datetime": span.end, "status": "PLANNED", "source": "MANUAL",
                      "created_at": old["created_at"] if old else now, "updated_at": now}
            row = (repository.insert(db.plans, values) if identifier is None else
                   repository.update(db.plans, identifier, values))
            repository.update(db.tasks, task.id, {"status": "PLANNED", "updated_at": now})
            if old and old["task_id"] != task.id:
                self._refresh_task_status(repository, old["task_id"])
            return json_row(row)

    def _refresh_task_status(self, repository, task_id):
        task = repository.get(db.tasks, task_id)
        if task["status"] != "COMPLETED":
            remaining = repository.list(db.plans, db.plans.c.task_id == task_id,
                                        db.plans.c.status == "PLANNED")
            repository.update(db.tasks, task_id, {
                "status": "PLANNED" if remaining else "TODO", "updated_at": self.current_time()})

    def delete_plan(self, identifier):
        with self.database.transaction(write=True) as repository:
            old = repository.get(db.plans, identifier)
            repository.delete(db.plans, identifier)
            self._refresh_task_status(repository, old["task_id"])

    def complete_plan(self, identifier):
        with self.database.transaction(write=True) as repository:
            row = repository.update(db.plans, identifier, {
                "status": "COMPLETED", "updated_at": self.current_time()})
            self._refresh_task_status(repository, row["task_id"])
            return json_row(row)
