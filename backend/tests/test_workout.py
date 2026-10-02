from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import database as db
from app.errors import ConflictError
from app.inputs import MealEntryInput, WorkoutSessionInput, WorkoutSettingsInput
from app.main import create_app
from app.storage_service import DatabasePlanningService
from app.workout import WorkoutAssignment, WorkoutPlan

KST = ZoneInfo("Asia/Seoul")
WEDNESDAY = datetime(2026, 9, 9, 8, 0, tzinfo=KST)  # week of Monday 2026-09-07
NEXT_TUESDAY = datetime(2026, 9, 15, 8, 0, tzinfo=KST)


@pytest.fixture
def database(tmp_path):
    database = db.Database(tmp_path / "workout.db")
    yield database
    database.close()


def dates(week):
    return [item["session_date"] for item in week["sessions"]]


def edit(session, **changes):
    fields = ("session_date", "muscle_groups", "note", "completed")
    return WorkoutSessionInput(**{key: session[key] for key in fields} | changes)


def test_week_defaults_to_mon_wed_fri_sun_and_is_generated_once(database):
    service = DatabasePlanningService(database, now=WEDNESDAY)
    week = service.get_workout_week()
    assert week["week_start"] == "2026-09-07"
    assert dates(week) == ["2026-09-07", "2026-09-09", "2026-09-11", "2026-09-13"]
    assert all(item["strength_minutes"] == 30 and item["cardio_minutes"] == 30 for item in week["sessions"])
    assert all(item["focus_source"] == "NONE" and not item["muscle_groups"] for item in week["sessions"])

    service.delete_workout_session(week["sessions"][0]["id"])
    assert dates(service.get_workout_week()) == ["2026-09-09", "2026-09-11", "2026-09-13"]


def test_sessions_move_only_inside_their_week_and_to_free_days(database):
    service = DatabasePlanningService(database, now=WEDNESDAY)
    friday = service.get_workout_week()["sessions"][2]

    moved = service.update_workout_session(friday["id"], edit(friday, session_date=date(2026, 9, 12)))
    assert moved["session_date"] == "2026-09-12"
    with pytest.raises(ConflictError):
        service.update_workout_session(friday["id"], edit(friday, session_date=date(2026, 9, 13)))
    with pytest.raises(ConflictError):
        service.update_workout_session(friday["id"], edit(friday, session_date=date(2026, 9, 14)))
    with pytest.raises(ConflictError):
        service.create_workout_session(WorkoutSessionInput(session_date=date(2026, 9, 7)))
    added = service.create_workout_session(WorkoutSessionInput(session_date=date(2026, 9, 10)))
    assert added["week_start"] == "2026-09-07"


def test_settings_change_applies_to_the_next_generated_week(database):
    service = DatabasePlanningService(database, now=WEDNESDAY)
    service.get_workout_week()
    service.save_workout_settings(WorkoutSettingsInput(weekdays=[1, 3], strength_minutes=40, cardio_minutes=20))
    assert len(service.get_workout_week()["sessions"]) == 4

    later = DatabasePlanningService(database, now=NEXT_TUESDAY)
    week = later.get_workout_week()
    assert dates(week) == ["2026-09-15", "2026-09-17"]
    assert week["sessions"][0]["strength_minutes"] == 40


def test_plan_payload_uses_history_and_keeps_manual_and_completed_sessions(database):
    first = DatabasePlanningService(database, now=WEDNESDAY)
    sessions = first.get_workout_week()["sessions"]
    first.update_workout_session(sessions[0]["id"], edit(sessions[0], muscle_groups=["LEGS"], completed=True))

    service = DatabasePlanningService(database, now=NEXT_TUESDAY)
    current = service.get_workout_week()["sessions"]
    service.update_workout_session(current[0]["id"], edit(current[0], completed=True))
    manual = service.update_workout_session(current[1]["id"], edit(current[1], muscle_groups=["BACK", "ARMS"]))
    assert manual["focus_source"] == "MANUAL"

    payload = service.workout_plan_payload()
    assert [item["session_id"] for item in payload["sessions_to_plan"]] == [current[2]["id"], current[3]["id"]]
    assert {item["date"] for item in payload["fixed_sessions"]} == {"2026-09-14", "2026-09-16"}
    assert payload["history"][0] == {
        "date": "2026-09-07", "weekday": "월", "muscle_groups": ["LEGS"], "completed": True,
    }
    assert len(payload["history"]) == 4


def test_ai_plan_must_cover_exactly_the_open_sessions(database):
    service = DatabasePlanningService(database, now=WEDNESDAY)
    sessions = service.get_workout_week()["sessions"]
    ids = [item["id"] for item in sessions]

    with pytest.raises(ConflictError):
        service.save_workout_plan(WorkoutPlan(summary="부분 계획", assignments=[
            WorkoutAssignment(session_id=ids[0], muscle_groups=["LEGS"], note="스쿼트"),
        ]))
    assert all(item["focus_source"] == "NONE" for item in service.get_workout_week()["sessions"])

    groups = [["LEGS"], ["BACK", "ARMS"], ["CHEST", "SHOULDERS"], ["FULL_BODY"]]
    week = service.save_workout_plan(WorkoutPlan(summary="하체-등-가슴-전신 순환", assignments=[
        WorkoutAssignment(session_id=identifier, muscle_groups=group, note="예시")
        for identifier, group in zip(ids, groups)
    ]))
    assert week["summary"] == "하체-등-가슴-전신 순환"
    assert week["planned_at"] is not None
    assert [item["muscle_groups"] for item in week["sessions"]] == groups
    assert all(item["focus_source"] == "AI" for item in week["sessions"])


def test_workout_api_and_diet_payload_include_training(tmp_path):
    captured = {}

    def workout_runner(payload):
        captured["workout"] = payload
        return WorkoutPlan(summary="이번 주 분할", assignments=[
            WorkoutAssignment(session_id=item["session_id"], muscle_groups=["LEGS"], note="레그프레스")
            for item in payload["sessions_to_plan"]
        ])

    app = create_app(tmp_path / "workout-api.db", now=WEDNESDAY, workout_runner=workout_runner)
    with TestClient(app) as client:
        assert client.get("/api/body/workout-settings").json() == {
            "weekdays": [0, 2, 4, 6], "strength_minutes": 30, "cardio_minutes": 30,
        }
        assert client.put("/api/body/workout-settings", json={"weekdays": [9]}).status_code == 422
        week = client.get("/api/body/workouts/week").json()
        assert len(week["sessions"]) == 4
        assert week["summary"] is None

        planned = client.post("/api/body/workouts/week/plan", json={})
        assert planned.status_code == 200
        assert len(captured["workout"]["sessions_to_plan"]) == 4
        assert planned.json()["sessions"][0]["muscle_groups"] == ["LEGS"]

        session = planned.json()["sessions"][0]
        bad_group = client.put(f"/api/body/workouts/{session['id']}", json={
            "session_date": session["session_date"], "muscle_groups": ["NECK"],
        })
        assert bad_group.status_code == 422
        done = client.put(f"/api/body/workouts/{session['id']}", json={
            "session_date": session["session_date"], "muscle_groups": ["LEGS"],
            "note": session["note"], "completed": True,
        })
        assert done.json()["completed"] is True
        assert done.json()["focus_source"] == "AI"

    service = DatabasePlanningService(db.Database(tmp_path / "workout-api.db"), now=WEDNESDAY)
    service.save_meal_entry(MealEntryInput(meal_type="LUNCH", food_name="현미밥", calories_kcal=300, protein_g=6))
    workouts = service.diet_analysis_payload()["workouts"]
    assert workouts[0] == {
        "date": "2026-09-07", "strength_focus": ["하체"],
        "strength_minutes": 30, "cardio_minutes": 30, "completed": True,
    }
    assert len(workouts) == 4
    service.database.close()
