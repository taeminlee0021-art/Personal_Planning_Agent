import json
import sqlite3
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
from app.inputs import BodySettingsInput, ManualPlanInput, RecurringTaskInput, ScheduleInput, TodayItemInput, WeightRecordInput
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


def test_postgresql_url_selects_psycopg(monkeypatch):
    captured = {}

    class FakeEngine:
        def dispose(self):
            pass

    def fake_create_engine(url, **options):
        captured["url"] = url
        captured["options"] = options
        return FakeEngine()

    monkeypatch.setattr(db, "create_engine", fake_create_engine)
    monkeypatch.setattr(db.metadata, "create_all", lambda engine: None)
    monkeypatch.setattr(db, "inspect", lambda engine: SimpleNamespace(get_table_names=lambda: []))

    database = db.Database(
        "postgresql://planner:p%40ss@example.neon.tech/planning?sslmode=require"
    )

    assert captured["url"] == (
        "postgresql+psycopg://planner:p%40ss@example.neon.tech/"
        "planning?sslmode=require"
    )
    assert captured["options"]["pool_pre_ping"] is True
    assert captured["options"]["hide_parameters"] is True
    assert database.path is None


def test_existing_recurring_table_gains_start_date_without_losing_rows(tmp_path):
    path = tmp_path / "prior-recurring.db"
    connection = sqlite3.connect(path)
    connection.execute("""
        CREATE TABLE recurring_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title VARCHAR(120) NOT NULL,
            cadence VARCHAR(10) NOT NULL,
            weekdays JSON NOT NULL,
            active BOOLEAN NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    """)
    connection.execute(
        "INSERT INTO recurring_tasks (title, cadence, weekdays, active, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("기존 반복", "DAILY", "[]", 1, "2026-09-01 00:00:00", "2026-09-01 00:00:00"),
    )
    connection.commit()
    connection.close()

    database = db.Database(path)
    try:
        rows = DatabasePlanningService(database, now=NOW).list_recurring_tasks()
        assert len(rows) == 1
        assert rows[0]["title"] == "기존 반복"
        assert rows[0]["start_date"] == "2026-09-01"
    finally:
        database.close()


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
    assert row["completed"] is False
    assert service.set_schedule_completed(row["id"], True)["completed"] is True
    updated = service.save_schedule(schedule(START + timedelta(hours=1), title="Changed"), row["id"])
    assert updated["title"] == "Changed"
    assert updated["completed"] is True
    service.delete_schedule(row["id"])
    assert service.list_schedules() == []


def test_existing_schedule_table_gains_completion_column(tmp_path):
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        connection.execute(
            "CREATE TABLE schedules ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(120) NOT NULL, "
            "start_datetime DATETIME NOT NULL, end_datetime DATETIME NOT NULL, "
            "description VARCHAR(2000) NOT NULL, fixed BOOLEAN NOT NULL)"
        )

    database = db.Database(path)
    try:
        service = DatabasePlanningService(database, now=NOW)
        row = service.save_schedule(schedule())
        assert row["completed"] is False
        with sqlite3.connect(path) as connection:
            assert "completed" in {column[1] for column in connection.execute("PRAGMA table_info(schedules)")}
    finally:
        database.close()


def test_sunday_weight_prompt_record_and_height(tmp_path):
    database = db.Database(tmp_path / "body.db")
    sunday = NOW + timedelta(days=6)
    try:
        service = DatabasePlanningService(database, now=sunday)
        assert service.get_body_settings() == {"height_cm": 176.0}
        assert service.save_body_settings(BodySettingsInput(height_cm=175.5)) == {"height_cm": 175.5}

        prompts = [item for item in service.list_today_items() if item["title"] == "몸무게 기록"]
        assert len(prompts) == 1 and prompts[0]["status"] == "TODO"

        first = service.save_weight_record(WeightRecordInput(weight_kg=72.4))
        assert first["measured_on"] == sunday.date().isoformat()
        assert service.list_today_items()[-1]["status"] == "COMPLETED"

        updated = service.save_weight_record(WeightRecordInput(
            measured_on=sunday.date(), weight_kg=71.9
        ))
        assert updated["id"] == first["id"]
        assert [item["weight_kg"] for item in service.list_weight_records()] == [71.9]

        service.delete_weight_record(first["id"])
        assert service.list_weight_records() == []
        assert service.list_today_items()[-1]["status"] == "TODO"
    finally:
        database.close()


def test_daily_and_weekly_rules_materialize_once_for_today(service):
    daily = service.save_recurring_task(RecurringTaskInput(
        title="물 마시기", cadence="DAILY"
    ))
    monday = service.save_recurring_task(RecurringTaskInput(
        title="주간 정리", cadence="WEEKLY", weekdays=[0, 3]
    ))
    service.save_recurring_task(RecurringTaskInput(
        title="화요일 운동", cadence="WEEKLY", weekdays=[1]
    ))

    first = service.list_today_items()
    second = service.list_today_items()

    assert [(item["title"], item["source"]) for item in first] == [
        ("물 마시기", "RECURRING"), ("주간 정리", "RECURRING")
    ]
    assert second == first
    assert {item["recurrence_id"] for item in first} == {daily["id"], monday["id"]}


def test_recurring_rule_starts_on_selected_date(service):
    tomorrow = NOW.date() + timedelta(days=1)
    saved = service.save_recurring_task(RecurringTaskInput(
        title="내일부터 스트레칭", cadence="DAILY", start_date=tomorrow
    ))
    assert saved["start_date"] == tomorrow.isoformat()
    assert service.list_today_items() == []

    service._now = NOW + timedelta(days=1)
    items = service.list_today_items()
    assert [item["title"] for item in items] == ["내일부터 스트레칭"]


def test_recurring_rule_without_start_date_defaults_to_korean_today(service):
    saved = service.save_recurring_task(RecurringTaskInput(
        title="오늘 시작", cadence="WEEKLY", weekdays=[0]
    ))
    assert saved["start_date"] == NOW.date().isoformat()


def test_today_item_crud_and_rule_history_are_independent(service):
    manual = service.create_today_item(TodayItemInput(title="우유 사기"))
    completed = service.update_today_item(manual["id"], "COMPLETED")
    assert completed["status"] == "COMPLETED"

    rule = service.save_recurring_task(RecurringTaskInput(
        title="스트레칭", cadence="DAILY"
    ))
    recurring = next(item for item in service.list_today_items() if item["recurrence_id"] == rule["id"])
    service.delete_recurring_task(rule["id"])

    kept = next(item for item in service.list_today_items() if item["id"] == recurring["id"])
    assert kept["recurrence_id"] is None
    assert kept["title"] == "스트레칭"
    service.delete_today_item(manual["id"])
    assert all(item["id"] != manual["id"] for item in service.list_today_items())


def test_today_item_order_is_persisted_and_requires_complete_current_list(service):
    first = service.create_today_item(TodayItemInput(title="첫째"))
    second = service.create_today_item(TodayItemInput(title="둘째"))
    third = service.create_today_item(TodayItemInput(title="셋째"))

    reordered = service.reorder_today_items([third["id"], first["id"], second["id"]])
    assert [item["title"] for item in reordered] == ["셋째", "첫째", "둘째"]
    assert [item["order_index"] for item in reordered] == [1, 2, 3]
    assert [item["id"] for item in service.list_today_items()] == [
        third["id"], first["id"], second["id"]
    ]

    with pytest.raises(ValueError, match="every current Today item"):
        service.reorder_today_items([first["id"], second["id"]])
    assert [item["id"] for item in service.list_today_items()] == [
        third["id"], first["id"], second["id"]
    ]


def test_week_today_items_keeps_prior_day_history(service):
    prior = service.create_today_item(TodayItemInput(title="월요일 할 일"))
    service._now = NOW + timedelta(days=1)
    current = service.create_today_item(TodayItemInput(title="화요일 할 일"))

    week = service.list_week_today_items()
    assert [item["id"] for item in week] == [prior["id"], current["id"]]
    assert [item["item_date"] for item in week] == ["2026-09-07", "2026-09-08"]
    assert [item["title"] for item in service.list_today_items()] == ["화요일 할 일"]

def test_water_drinking_needs_four_500ml_steps(service):
    rule = service.save_recurring_task(RecurringTaskInput(
        title="물 2L 마시기", cadence="DAILY"
    ))
    item = next(value for value in service.list_today_items()
                if value["recurrence_id"] == rule["id"])
    assert item["completion_target"] == 4
    assert item["completion_count"] == 0

    for expected in range(1, 4):
        item = service.update_today_item(item["id"], "COMPLETED")
        assert item["completion_count"] == expected
        assert item["status"] == "TODO"
    item = service.update_today_item(item["id"], "COMPLETED")
    assert item["completion_count"] == 4
    assert item["status"] == "COMPLETED"

    reset = service.update_today_item(item["id"], "TODO")
    assert reset["completion_count"] == 0
    assert reset["status"] == "TODO"

    with service.database.transaction(write=True) as repository:
        repository.update(db.today_items, item["id"], {
            "completion_target": 1, "completion_count": 0, "status": "COMPLETED"
        })
    converted = next(value for value in service.list_today_items()
                     if value["id"] == item["id"])
    assert converted["completion_target"] == 4
    assert converted["completion_count"] == 1
    assert converted["status"] == "TODO"


def test_saved_task_can_be_added_to_today_and_completion_stays_in_sync(service):
    task = service.add_task("냉장고 청소하기", 45)
    item = service.create_today_item_from_task(task.id)
    assert item["source"] == "TASK"
    assert item["task_id"] == task.id
    assert service.get_task(task.id).status == "TODO"

    with pytest.raises(ValueError, match="already in Today"):
        service.create_today_item_from_task(task.id)

    completed = service.update_today_item(item["id"], "COMPLETED")
    assert completed["status"] == "COMPLETED"
    assert service.get_task(task.id).status == "COMPLETED"
    service.update_today_item(item["id"], "TODO")
    assert service.get_task(task.id).status == "TODO"
    service.update_task(task.id, status="COMPLETED")
    synced = next(value for value in service.list_today_items()
                  if value["id"] == item["id"])
    assert synced["status"] == "COMPLETED"

    service.delete_today_item(item["id"])
    assert service.get_task(task.id).title == "냉장고 청소하기"


def test_inactive_and_nonmatching_rules_do_not_materialize(service):
    service.save_recurring_task(RecurringTaskInput(
        title="비활성", cadence="DAILY", active=False
    ))
    service.save_recurring_task(RecurringTaskInput(
        title="금요일", cadence="WEEKLY", weekdays=[4]
    ))
    assert service.list_today_items() == []


@pytest.mark.parametrize("values", [
    {"title": "Bad", "cadence": "WEEKLY", "weekdays": []},
    {"title": "Bad", "cadence": "DAILY", "weekdays": [0]},
    {"title": "Bad", "cadence": "WEEKLY", "weekdays": [7]},
    {"title": "Bad", "cadence": "WEEKLY", "weekdays": [1, 1]},
])
def test_recurring_input_validation(values):
    with pytest.raises(ValidationError):
        RecurringTaskInput(**values)


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
    assert service.set_plan_status(row["id"], "PLANNED")["status"] == "PLANNED"
    assert service.get_task(task.id).status == "PLANNED"
    assert service.complete_plan(row["id"])["status"] == "COMPLETED"
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
