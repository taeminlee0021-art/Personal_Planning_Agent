import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app import database as db
from app.agent import PlanningAgent
from app.cli import menu
from app.inputs import ManualPlanInput, ScheduleInput
from app.models import Proposal
from app.planning import KST, Preferences
from app.storage_service import DatabasePlanningService
from app.tools import NAMES, execute


NOW = datetime(2026, 9, 7, 8, tzinfo=KST)
START = datetime(2026, 9, 7, 19, tzinfo=KST)


@pytest.fixture
def service(tmp_path):
    database = db.Database(tmp_path / "planning.db")
    yield DatabasePlanningService(database, now=NOW)
    database.close()


def plan(task_id, start=START):
    return ManualPlanInput(task_id=task_id, start_datetime=start)


def schedule(start=START, end=None, title="Appointment"):
    return ScheduleInput(title=title, start_datetime=start, end_datetime=end or start + timedelta(hours=1))


def snapshot(service):
    return {"tasks": service.get_tasks(), "schedules": service.list_schedules(),
            "preferences": service.get_preferences(), "plans": service.list_plans()}


def test_restart_preserves_all_entities_and_no_seed(service):
    assert service.get_tasks() == []
    assert service.get_fixed_schedules() == []
    task = service.add_task("Exercise", 60, "HIGH", 3)
    service.save_schedule(schedule(START + timedelta(days=1)))
    service.save_preferences(Preferences(max_daily_planning_minutes=180))
    saved = service.save_manual_plan(plan(task.id))
    expected = snapshot(service)
    path = service.database.path
    service.database.close()
    reopened = db.Database(path)
    try:
        second = DatabasePlanningService(reopened, now=NOW)
        assert snapshot(second) == expected
        assert saved["source"] == "MANUAL"
        assert second.get_task(task.id).status == "PLANNED"
    finally:
        reopened.close()


def test_task_crud_and_id_not_reused(service):
    task = service.add_task("Exercise", 60)
    updated = service.update_task(task.id, title="Piano", priority="HIGH", due_date="2026-09-10")
    assert updated.title == "Piano"
    assert updated.due_date.isoformat() == "2026-09-10"
    assert service.update_task(task.id, status="COMPLETED").status == "COMPLETED"
    service.delete_task(task.id)
    assert service.get_tasks() == []
    with pytest.raises(ValueError, match="not found"):
        service.get_task(task.id)
    assert service.add_task("New", 30).id > task.id


@pytest.mark.parametrize("change", [{"title": ""}, {"estimated_minutes": 0}, {"priority": "URGENT"},
                                    {"weekly_target_count": 0}, {"id": 99}])
def test_invalid_task_edit_rolls_back(service, change):
    task = service.add_task("Exercise", 60)
    before = snapshot(service)
    with pytest.raises(ValueError):
        service.update_task(task.id, **change)
    assert snapshot(service) == before


def test_schedule_crud(service):
    row = service.save_schedule(schedule())
    updated = service.save_schedule(schedule(START + timedelta(hours=1), title="Changed"), row["id"])
    assert updated["title"] == "Changed"
    service.delete_schedule(row["id"])
    assert service.list_schedules() == []


@pytest.mark.parametrize("values", [
    {"title": "", "start_datetime": START, "end_datetime": START + timedelta(hours=1)},
    {"title": "Bad", "start_datetime": START, "end_datetime": START},
    {"title": "Bad", "start_datetime": START.replace(tzinfo=None), "end_datetime": START + timedelta(hours=1)},
    {"title": "Bad", "start_datetime": START, "end_datetime": START + timedelta(hours=1), "fixed": False},
])
def test_schedule_input_validation(values):
    with pytest.raises(ValidationError):
        ScheduleInput(**values)


def test_manual_plan_create_move_complete_delete(service):
    task = service.add_task("Exercise", 60, count=3)
    row = service.save_manual_plan(plan(task.id))
    moved = service.save_manual_plan(plan(task.id, START + timedelta(days=1)), row["id"])
    assert datetime.fromisoformat(moved["start_datetime"]).astimezone(KST) == START + timedelta(days=1)
    assert len(service.get_current_plan()) == 1
    assert service.complete_plan(row["id"])["status"] == "COMPLETED"
    assert service.get_task(task.id).status == "TODO"  # recurring task remains available
    with pytest.raises(ValueError, match="Completed"):
        service.save_manual_plan(plan(task.id, START + timedelta(days=2)), row["id"])
    service.delete_plan(row["id"])
    assert service.list_plans() == []


def test_task_delete_restricted_and_foreign_keys_enforced(service):
    task = service.add_task("Exercise", 60)
    service.save_manual_plan(plan(task.id))
    with pytest.raises(ValueError, match="linked plans"):
        service.delete_task(task.id)
    with pytest.raises(IntegrityError):
        with service.database.transaction(write=True) as repository:
            repository.delete(db.tasks, task.id)
    assert len(service.get_tasks()) == 1


def test_existing_plan_fields_protected(service):
    task = service.add_task("Exercise", 60)
    service.save_manual_plan(plan(task.id))
    for changes in [{"estimated_minutes": 30}, {"weekly_target_count": 2}, {"due_date": "2026-09-06"}]:
        before = snapshot(service)
        with pytest.raises(ValueError, match="linked plans"):
            service.update_task(task.id, **changes)
        assert snapshot(service) == before


def test_schedule_cannot_invalidate_plan(service):
    task = service.add_task("Exercise", 60)
    service.save_manual_plan(plan(task.id))
    other = service.save_schedule(schedule(START + timedelta(days=1)))
    before = snapshot(service)
    with pytest.raises(ValueError, match="conflicts"):
        service.save_schedule(schedule())
    with pytest.raises(ValueError, match="conflicts"):
        service.save_schedule(schedule(), other["id"])
    assert snapshot(service) == before


def test_preferences_cannot_invalidate_plan(service):
    task = service.add_task("Exercise", 60)
    service.save_manual_plan(plan(task.id))
    before = snapshot(service)
    for pref in [Preferences(weekday_available_from="20:00"), Preferences(max_daily_planning_minutes=30)]:
        with pytest.raises(ValueError):
            service.save_preferences(pref)
        assert snapshot(service) == before


def test_plan_validated_against_schedule_overlap_budget_deadline(service):
    first = service.add_task("Exercise", 60, count=3)
    second = service.add_task("Study", 120, count=3)
    service.save_schedule(schedule(START + timedelta(days=1)))
    service.save_manual_plan(plan(first.id))
    before = snapshot(service)
    for value in [plan(second.id), plan(second.id, START + timedelta(hours=1)),
                  plan(first.id, START + timedelta(days=1)), plan(first.id, START - timedelta(hours=1))]:
        with pytest.raises(ValueError):
            service.save_manual_plan(value)
        assert snapshot(service) == before
    third = service.add_task("Due today", 60)
    service.update_task(third.id, due_date=START.date())
    with pytest.raises(ValueError, match="deadline"):
        service.save_manual_plan(plan(third.id, START + timedelta(days=2)))


def test_failed_second_write_rolls_back_plan_insert(service, monkeypatch):
    task = service.add_task("Exercise", 60)
    before = snapshot(service)
    monkeypatch.setattr(db.Repository, "update", Mock(side_effect=RuntimeError("Injected failure")))
    with pytest.raises(RuntimeError):
        service.save_manual_plan(plan(task.id))
    assert snapshot(service) == before


def test_plan_edit_failure_preserves_original(service):
    task = service.add_task("Exercise", 60, count=3)
    row = service.save_manual_plan(plan(task.id))
    service.save_schedule(schedule(START + timedelta(days=1)))
    before = snapshot(service)
    with pytest.raises(ValueError):
        service.save_manual_plan(plan(task.id, START + timedelta(days=1)), row["id"])
    assert snapshot(service) == before


def test_agent_tools_and_proposal_do_not_write(service):
    task = service.add_task("Exercise", 60, count=3)
    before = snapshot(service)
    for name in NAMES:
        json.dumps(execute(service, name, "{}"))
    calls = [SimpleNamespace(type="function_call", name=name, arguments="{}", call_id=str(i))
             for i, name in enumerate(NAMES)]
    client = Mock()
    client.responses.create.side_effect = [
        SimpleNamespace(status="completed", output=calls, output_text="", usage=None),
        SimpleNamespace(status="completed", output=[], usage=None, output_text=json.dumps({
            "explanation": "Example", "assignments": [{"task_id": task.id, "slot_id": START.isoformat()}]})),
    ]
    result = PlanningAgent(client, "test", service).run("Plan my week")
    assert result["mock_data"] is False
    assert result["status"] == "PROPOSED_NOT_SAVED"
    assert snapshot(service) == before
    with pytest.raises(ValueError):
        execute(service, "save_manual_plan", "{}")


def test_stale_proposal_rechecks_database(service):
    task = service.add_task("Exercise", 60)
    assert any(item["id"] == START.isoformat() for item in service.get_available_time_slots()["slots"])
    service.save_schedule(schedule())
    before = snapshot(service)
    with pytest.raises(ValueError, match="stale"):
        service.render_proposal(Proposal(explanation="Old proposal", assignments=[
            {"task_id": task.id, "slot_id": START.isoformat()}]))
    assert snapshot(service) == before


def test_timezone_roundtrip_and_week_filter(service):
    task = service.add_task("Exercise", 60, count=3)
    service.save_manual_plan(plan(task.id, START.astimezone(timezone.utc)))
    service.save_manual_plan(plan(task.id, START + timedelta(days=7)))
    assert len(service.get_current_plan()) == 1
    service._now = NOW + timedelta(days=7)
    assert len(service.get_current_plan()) == 1
    assert service.get_available_time_slots()["week_start"] == "2026-09-14"
    assert datetime.fromisoformat(service.list_plans()[0]["start_datetime"]).astimezone(KST) == START


def test_concurrent_conflicting_writes_are_serialized(service):
    task = service.add_task("Exercise", 60, count=3)
    gate = Barrier(2)

    def attempt():
        gate.wait(timeout=5)
        try:
            service.save_manual_plan(plan(task.id))
            return "saved"
        except ValueError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == ["conflict", "saved"]
    assert len(service.list_plans()) == 1


def test_cli_direct_input_persists_without_api(service, monkeypatch):
    answers = iter(["3", "Piano", "30", "3", "2", "0"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    agent = Mock(side_effect=AssertionError("No API allowed"))
    monkeypatch.setattr("app.cli.ask_agent", agent)
    menu(service)
    assert service.get_tasks()[0]["title"] == "Piano"
    agent.assert_not_called()


def test_cli_process_restart_and_demo_isolation(tmp_path):
    path = tmp_path / "cli.db"
    command = [sys.executable, "-X", "utf8", "-m", "app.cli", "--database", str(path)]
    result = subprocess.run(command, input="3\nPiano\n30\n2\n2\n0\n",
                            capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert result.returncode == 0, result.stderr
    read = subprocess.run(command + ["--show-data"], capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert read.returncode == 0, read.stderr
    assert json.loads(read.stdout)["tasks"][0]["title"] == "Piano"
    before = path.read_bytes()
    demo = subprocess.run([sys.executable, "-m", "app.cli", "--demo", "--show-data"],
                          capture_output=True, text=True, encoding="utf-8", timeout=20)
    assert demo.returncode == 0
    assert json.loads(demo.stdout)["slots"]["mock_data"] is True
    assert path.read_bytes() == before


def test_task_status_tracks_saved_plans(service):
    task = service.add_task("Exercise", 60)
    with pytest.raises(ValueError, match="saved plans"):
        service.update_task(task.id, status="PLANNED")
    row = service.save_manual_plan(plan(task.id))
    with pytest.raises(ValueError, match="saved plans"):
        service.update_task(task.id, status="TODO")
    service.delete_plan(row["id"])
    assert service.get_task(task.id).status == "TODO"


def test_plan_task_change_refreshes_both_task_statuses(service):
    first = service.add_task("Exercise", 60)
    second = service.add_task("Study", 60)
    row = service.save_manual_plan(plan(first.id))
    service.save_manual_plan(plan(second.id), row["id"])
    assert service.get_task(first.id).status == "TODO"
    assert service.get_task(second.id).status == "PLANNED"
