from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app import database as db
from app.actions import ActionService
from app.cli import review_actions
from app.errors import ConflictError
from app.inputs import ManualPlanInput, ScheduleInput
from app.main import create_app
from app.models import Proposal
from app.planning import KST, Preferences
from app.storage_service import DatabasePlanningService
from app.tools import execute

NOW = datetime(2026, 9, 7, 8, tzinfo=KST)
START = datetime(2026, 9, 7, 19, tzinfo=KST)


@pytest.fixture
def service(tmp_path):
    database = db.Database(tmp_path / "actions.db")
    service = DatabasePlanningService(database, now=NOW)
    yield service
    database.close()


def state(service):
    return [service.get_tasks(), service.list_schedules(), service.get_preferences(), service.list_plans()]


def proposal(service, task_id, start=START):
    return service.render_proposal(Proposal(explanation="Plan exercise", assignments=[
        {"task_id": task_id, "slot_id": start.isoformat()}]))


def pending(service):
    task = service.add_task("Exercise", 60, count=3)
    return task, ActionService(service).propose(proposal(service, task.id))


def change_proposal(service, plan_id, operation="MOVE", start=None):
    return service.render_proposal(Proposal(explanation="Adjust the plan", assignments=[], changes=[
        {"operation": operation, "plan_id": plan_id,
         "slot_id": (start or START + timedelta(days=1)).isoformat() if operation == "MOVE" else None}]))


def test_pending_does_not_save_plans_and_reopens(service):
    task = service.add_task("Exercise", 60, count=3)
    before = state(service)
    response = ActionService(service).propose(proposal(service, task.id))
    assert response["status"] == "PENDING"
    assert state(service) == before
    path = service.database.path
    service.database.close()
    database = db.Database(path)
    try:
        actions = ActionService(DatabasePlanningService(database, now=NOW))
        saved = actions.get(response["action_id"])
        assert saved["proposal"]["blocks"] == response["blocks"]
        assert saved["status"] == "PENDING"
        assert len(actions.list_pending()) == 1
    finally:
        database.close()


def test_approve_creates_exact_review_once(service):
    task, response = pending(service)
    actions = ActionService(service)
    first = actions.approve(response["action_id"])
    second = actions.approve(response["action_id"])
    assert first == second
    assert first["status"] == "EXECUTED"
    assert first["approved_at"] and first["executed_at"]
    assert actions.list_pending() == []
    saved = service.list_plans()
    assert len(saved) == 1 and saved[0]["source"] == "AGENT"
    for field, value in response["blocks"][0].items():
        assert saved[0][field] == value
    assert service.get_task(task.id).status == "PLANNED"
    with pytest.raises(ConflictError):
        actions.reject(response["action_id"])


def test_reject_is_idempotent_and_prevents_execution(service):
    _, response = pending(service)
    before = state(service)
    actions = ActionService(service)
    rejected = actions.reject(response["action_id"])
    assert rejected["status"] == "REJECTED"
    assert actions.reject(response["action_id"]) == rejected
    with pytest.raises(ConflictError):
        actions.approve(response["action_id"])
    assert state(service) == before


def test_missed_activity_moves_only_after_approval(service):
    task = service.add_task("Exercise", 60, count=1)
    original = service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START))
    service._now = START + timedelta(hours=2)  # Today's activity was missed.
    before = state(service)
    review = change_proposal(service, original["id"])
    response = ActionService(service).propose(review)
    assert state(service) == before
    assert response["blocks"] == []
    assert response["changes"][0]["before"]["id"] == original["id"]
    ActionService(service).approve(response["action_id"])
    rows = service.list_plans()
    assert len(rows) == 1
    assert rows[0]["id"] == original["id"]
    assert rows[0]["start_datetime"] == (START + timedelta(days=1)).isoformat()


def test_delete_only_requires_approval_and_refreshes_task(service):
    task = service.add_task("Exercise", 60)
    saved = service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START))
    response = ActionService(service).propose(change_proposal(service, saved["id"], "DELETE"))
    assert len(service.list_plans()) == 1
    executed = ActionService(service).approve(response["action_id"])
    assert executed["result"]["deleted_plan_ids"] == [saved["id"]]
    assert service.list_plans() == []
    assert service.get_task(task.id).status == "TODO"


def test_mixed_create_move_delete_is_atomic(service):
    first = service.add_task("Exercise", 60, count=3)
    second = service.add_task("Study", 60, count=3)
    old1 = service.save_manual_plan(ManualPlanInput(task_id=first.id, start_datetime=START))
    old2 = service.save_manual_plan(ManualPlanInput(task_id=second.id, start_datetime=START + timedelta(hours=1)))
    review = service.render_proposal(Proposal(explanation="Adjust all", assignments=[
        {"task_id": second.id, "slot_id": (START + timedelta(days=2)).isoformat()}], changes=[
        {"operation": "MOVE", "plan_id": old1["id"], "slot_id": (START + timedelta(days=1)).isoformat()},
        {"operation": "DELETE", "plan_id": old2["id"], "slot_id": None}]))
    before = state(service)
    response = ActionService(service).propose(review)
    assert state(service) == before
    result = ActionService(service).approve(response["action_id"])["result"]
    assert len(result["created_plan_ids"]) == 1
    assert result["updated_plan_ids"] == [old1["id"]]
    assert result["deleted_plan_ids"] == [old2["id"]]
    assert len(service.list_plans()) == 2


@pytest.mark.parametrize("mutation", ["task", "schedule", "preferences", "time", "week", "delete_task"])
def test_stale_action_stays_pending_without_partial_writes(service, mutation):
    task, response = pending(service)
    if mutation == "task":
        service.update_task(task.id, title="Changed")
    elif mutation == "schedule":
        service.save_schedule(ScheduleInput(title="New appointment", start_datetime=START,
                                            end_datetime=START + timedelta(hours=1)))
    elif mutation == "preferences":
        service.save_preferences(Preferences(max_daily_planning_minutes=30))
    elif mutation == "time":
        service._now = START + timedelta(minutes=1)
    elif mutation == "week":
        service._now = NOW + timedelta(days=7)
    else:
        service.delete_task(task.id)
    before = state(service)
    actions = ActionService(service)
    with pytest.raises(ConflictError):
        actions.approve(response["action_id"])
    assert actions.get(response["action_id"])["status"] == "PENDING"
    assert state(service) == before


@pytest.mark.parametrize("mutation", ["move", "complete", "delete"])
def test_changed_target_plan_rejects_approval(service, mutation):
    task = service.add_task("Exercise", 60, count=3)
    saved = service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START))
    response = ActionService(service).propose(change_proposal(service, saved["id"]))
    if mutation == "move":
        service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START + timedelta(hours=1)), saved["id"])
    elif mutation == "complete":
        service.complete_plan(saved["id"])
    else:
        service.delete_plan(saved["id"])
    before = state(service)
    with pytest.raises(ConflictError):
        ActionService(service).approve(response["action_id"])
    assert state(service) == before


def test_failed_execution_rolls_back_approval_and_insert(service, monkeypatch):
    _, response = pending(service)
    before = state(service)
    original = db.Repository.update

    def fail_status(self, table, identifier, values):
        if table is db.tasks:
            raise RuntimeError("Injected status update failure")
        return original(self, table, identifier, values)

    monkeypatch.setattr(db.Repository, "update", fail_status)
    with pytest.raises(RuntimeError):
        ActionService(service).approve(response["action_id"])
    row = ActionService(service).get(response["action_id"])
    assert row["status"] == "PENDING" and row["approved_at"] is None
    assert state(service) == before


def test_concurrent_duplicate_approvals_execute_once(service):
    _, response = pending(service)
    gate = Barrier(2)

    def approve(_):
        gate.wait(timeout=5)
        return ActionService(service).approve(response["action_id"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(approve, range(2)))
    assert results[0] == results[1]
    assert len(service.list_plans()) == 1


def test_competing_actions_conflict_without_partial_save(service):
    first, action1 = pending(service)
    second = service.add_task("Study", 60, count=3)
    action2 = ActionService(service).propose(proposal(service, second.id))
    ActionService(service).approve(action1["action_id"])
    before = state(service)
    with pytest.raises(ConflictError):
        ActionService(service).approve(action2["action_id"])
    assert state(service) == before


def test_noop_proposal_has_no_action(service):
    review = service.render_proposal(Proposal(explanation="Nothing to plan", assignments=[]))
    response = ActionService(service).propose(review)
    assert response["action_id"] is None
    assert response["status"] == "PROPOSED_NOT_SAVED"
    assert ActionService(service).list_pending() == []


def test_completed_or_duplicate_plan_changes_rejected(service):
    task = service.add_task("Exercise", 60)
    saved = service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START))
    changes = [{"operation": "DELETE", "plan_id": saved["id"], "slot_id": None}] * 2
    with pytest.raises(ConflictError):
        service.render_proposal(Proposal(explanation="Invalid", assignments=[], changes=changes))
    service.complete_plan(saved["id"])
    with pytest.raises(ConflictError):
        change_proposal(service, saved["id"], "DELETE")


def test_pending_payload_is_revalidated(service):
    task = service.add_task("Exercise", 60)
    review = proposal(service, task.id)
    review["blocks"][0]["end_datetime"] = (START + timedelta(hours=2)).isoformat()
    with pytest.raises(ConflictError):
        ActionService(service).propose(review)
    assert ActionService(service).list_pending() == []


def test_cli_back_and_reject_never_apply(service, monkeypatch):
    _, response = pending(service)
    before = state(service)
    answers = iter([str(response["action_id"]), "0"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    review_actions(service)
    assert state(service) == before
    answers = iter([str(response["action_id"]), "2"])
    review_actions(service)
    assert ActionService(service).get(response["action_id"])["status"] == "REJECTED"
    assert state(service) == before


def test_cli_apply_explicitly_executes(service, monkeypatch):
    _, response = pending(service)
    answers = iter([str(response["action_id"]), "1"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    review_actions(service)
    assert len(service.list_plans()) == 1


def test_old_schema_upgrade_preserves_existing_data(tmp_path):
    path = tmp_path / "previous.db"
    engine = create_engine("sqlite:///" + str(path))
    db.metadata.create_all(engine, tables=[db.tasks, db.schedules, db.preferences, db.plans])
    with engine.begin() as connection:
        connection.execute(db.tasks.insert().values(
            title="Existing", description="", estimated_minutes=60, priority="MEDIUM",
            due_date=None, status="TODO", category="personal", weekly_target_count=1,
            created_at=NOW, updated_at=NOW))
    engine.dispose()
    database = db.Database(path)
    try:
        service = DatabasePlanningService(database, now=NOW)
        assert service.get_tasks()[0]["title"] == "Existing"
        assert ActionService(service).list_pending() == []
    finally:
        database.close()


def test_approval_tools_are_not_available_to_agent(service):
    for name in ("approve", "reject", "approve_action", "create_plan", "delete_plan"):
        with pytest.raises(ValueError):
            execute(service, name, "{}")


def test_api_propose_review_approve_and_idempotency(tmp_path):
    app = create_app(tmp_path / "api-actions.db", now=NOW)
    with TestClient(app) as client:
        service = app.state.service
        task = service.add_task("Exercise", 60)
        app.state.agent_runner = lambda service, message: proposal(service, task.id)
        response = client.post("/api/agent/messages", json={"message": "Plan"})
        assert response.status_code == 200, response.text
        identifier = response.json()["action_id"]
        assert response.json()["status"] == "PENDING"
        assert client.get("/api/plans").json() == []
        read = client.get(f"/api/agent/actions/{identifier}").json()
        assert read["proposal"]["blocks"] == response.json()["blocks"]
        before = state(service)
        tamper = client.post(f"/api/agent/actions/{identifier}/approve", json={"payload": {"blocks": []}})
        assert tamper.status_code == 422 and state(service) == before
        applied = client.post(f"/api/agent/actions/{identifier}/approve")
        assert applied.status_code == 200 and applied.json()["status"] == "EXECUTED"
        assert client.post(f"/api/agent/actions/{identifier}/approve", json={}).json() == applied.json()
        assert len(client.get("/api/plans").json()) == 1
        assert client.post(f"/api/agent/actions/{identifier}/reject").status_code == 409
        assert client.get("/api/agent/actions").json() == []
        assert client.get("/api/agent/actions/999").status_code == 404


def test_api_reject_and_stale_approval(tmp_path):
    app = create_app(tmp_path / "api-stale.db", now=NOW)
    with TestClient(app) as client:
        service = app.state.service
        task = service.add_task("Exercise", 60, count=3)
        app.state.agent_runner = lambda service, message: proposal(service, task.id)
        first = client.post("/api/agent/messages", json={"message": "Plan"}).json()["action_id"]
        assert client.post(f"/api/agent/actions/{first}/reject").json()["status"] == "REJECTED"
        assert client.post(f"/api/agent/actions/{first}/approve").status_code == 409
        second = client.post("/api/agent/messages", json={"message": "Plan"}).json()["action_id"]
        client.put(f"/api/tasks/{task.id}", json={"title": "Changed"})
        assert client.post(f"/api/agent/actions/{second}/approve").status_code == 409
        assert client.get("/api/plans").json() == []


def test_prior_week_cross_midnight_plan_still_consumes_daily_budget(service):
    previous = service.add_task("Previous activity", 120)
    first = service.add_task("Exercise", 60)
    second = service.add_task("Study", 60)
    with service.database.transaction(write=True) as repository:
        repository.insert(db.plans, {
            "task_id": previous.id, "title": previous.title,
            "start_datetime": NOW.replace(hour=0) - timedelta(hours=1),
            "end_datetime": NOW.replace(hour=1), "status": "COMPLETED", "source": "MANUAL",
            "created_at": NOW, "updated_at": NOW,
        })
    before = state(service)
    with pytest.raises(ValueError, match="daily"):
        service.render_proposal(Proposal(explanation="Too much", assignments=[
            {"task_id": first.id, "slot_id": START.isoformat()},
            {"task_id": second.id, "slot_id": (START + timedelta(hours=1)).isoformat()},
        ]))
    assert state(service) == before


def test_unchanged_move_cannot_be_persisted(service):
    task = service.add_task("Exercise", 60)
    saved = service.save_manual_plan(ManualPlanInput(task_id=task.id, start_datetime=START))
    review = change_proposal(service, saved["id"])
    review["changes"][0]["after"]["start_datetime"] = START.isoformat()
    review["changes"][0]["after"]["end_datetime"] = (START + timedelta(hours=1)).isoformat()
    with pytest.raises(ConflictError, match="change the start"):
        ActionService(service).propose(review)
    assert ActionService(service).list_pending() == []
