from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app import database as db
from app.diet import DietAnalysis, NutritionEstimate
from app.diet import INSTRUCTIONS
from app.inputs import MealEntryInput, WeightRecordInput
from app.main import create_app
from app.storage_service import DatabasePlanningService

KST = ZoneInfo("Asia/Seoul")
SUNDAY = datetime(2026, 9, 13, 10, 0, tzinfo=KST)


def test_manual_nutrition_is_remembered_and_reused(tmp_path):
    database = db.Database(tmp_path / "diet.db")
    try:
        service = DatabasePlanningService(database, now=SUNDAY)
        first = service.save_meal_entry(MealEntryInput(
            meal_type="LUNCH", food_name="닭가슴살 200g",
            calories_kcal=330, protein_g=62,
        ))
        assert first["nutrition_source"] == "MANUAL"
        second = service.save_meal_entry(MealEntryInput(
            meal_type="DINNER", food_name="  닭가슴살   200G  ",
        ))
        assert second["calories_kcal"] == 330
        assert second["protein_g"] == 62
        assert second["nutrition_source"] == "MEMORY"
        assert len(service.list_food_nutrition()) == 1
    finally:
        database.close()


def test_gpt_estimate_is_validated_saved_and_reused(tmp_path):
    database = db.Database(tmp_path / "diet-gpt.db")
    try:
        service = DatabasePlanningService(database, now=SUNDAY)
        meal = service.save_meal_entry(MealEntryInput(
            meal_type="DINNER", food_name="라면 1봉과 달걀 1개",
        ))
        prompts = {item["title"]: item for item in service.list_today_items()}
        assert prompts["주간 식단 평가"]["status"] == "TODO"
        payload = service.diet_analysis_payload()
        assert payload["meals"][0]["needs_estimate"] is True
        assert payload["recorded_days"] == ["2026-09-13"]
        assert payload["recorded_day_count"] == 1
        assert payload["latest_weight_kg"] is None
        assert payload["recent_weights"] == []

        review = service.save_diet_analysis(DietAnalysis(
            nutrition_estimates=[NutritionEstimate(
                entry_id=meal["id"], calories_kcal=580, protein_g=16,
            )],
            summary="전체 열량과 채소 섭취를 함께 점검하세요. 영양값은 추정치입니다.",
            biggest_issue="9월 13일 저녁 라면 1봉으로 단백질 대비 열량이 높았습니다.",
            next_week_actions=["저녁 라면 대신 두부 반 모와 달걀 2개로 바꾸기"],
            good_points=["식사를 빠짐없이 기록했습니다."],
            avoid_foods=["당이 많은 음료"],
            limit_foods=["라면"],
        ))
        assert review["total_calories_kcal"] == 580
        assert review["next_week_actions"] == ["저녁 라면 대신 두부 반 모와 달걀 2개로 바꾸기"]
        assert review["biggest_issue"].startswith("9월 13일")
        assert service.list_meal_entries()[0]["nutrition_source"] == "GPT"
        prompts = {item["title"]: item for item in service.list_today_items()}
        assert prompts["주간 식단 평가"]["status"] == "COMPLETED"

        reused = service.save_meal_entry(MealEntryInput(
            meal_type="SNACK", food_name="라면 1봉과 달걀 1개",
        ))
        assert (reused["calories_kcal"], reused["protein_g"]) == (580, 16)
        assert service.get_diet_review() is None
        prompts = {item["title"]: item for item in service.list_today_items()}
        assert prompts["주간 식단 평가"]["status"] == "TODO"
    finally:
        database.close()


def test_diet_context_includes_dated_weights_and_portion_guard(tmp_path):
    database = db.Database(tmp_path / "diet-context.db")
    try:
        service = DatabasePlanningService(database, now=SUNDAY)
        service.save_meal_entry(MealEntryInput(
            meal_type="LUNCH", food_name="밥 130g", eaten_on=SUNDAY.date()
        ))
        service.save_weight_record(WeightRecordInput(measured_on=SUNDAY.date(), weight_kg=72.4))
        payload = service.diet_analysis_payload()
        assert payload["latest_weight_kg"] == 72.4
        assert payload["latest_weight_date"] == "2026-09-13"
        assert payload["recent_weights"] == [{"date": "2026-09-13", "weight_kg": 72.4}]
        assert "stated portion and unit literally" in INSTRUCTIONS
        assert "incomplete records, not fasting" in INSTRUCTIONS
        assert "daily_calorie_target_kcal" in INSTRUCTIONS
    finally:
        database.close()


def test_diet_analysis_rejects_stale_or_missing_estimates(tmp_path):
    database = db.Database(tmp_path / "diet-stale.db")
    try:
        service = DatabasePlanningService(database, now=SUNDAY)
        service.save_meal_entry(MealEntryInput(meal_type="BREAKFAST", food_name="사과 1개"))
        analysis = DietAnalysis(
            nutrition_estimates=[], summary="기록 검토", good_points=["기록"],
            avoid_foods=[], limit_foods=[],
        )
        try:
            service.save_diet_analysis(analysis)
        except Exception as exc:
            assert "변경" in str(exc)
        else:
            raise AssertionError("missing estimate should be rejected")
    finally:
        database.close()


def test_diet_api_uses_injected_runner_and_never_requires_browser_key(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_INTERNAL_TOKEN", "")
    captured = []

    def runner(payload):
        captured.append(payload)
        unresolved = [meal for meal in payload["meals"] if meal["needs_estimate"]]
        return DietAnalysis(
            nutrition_estimates=[NutritionEstimate(
                entry_id=item["entry_id"], calories_kcal=120, protein_g=3,
            ) for item in unresolved],
            summary="과일 섭취는 좋지만 단백질을 보완하세요. 수치는 추정치입니다.",
            good_points=["과일을 기록했습니다."], avoid_foods=[], limit_foods=["단 음료"],
        )

    app = create_app(tmp_path / "diet-api.db", now=SUNDAY, diet_runner=runner)
    with TestClient(app) as client:
        created = client.post("/api/body/meals", json={
            "eaten_on": "2026-09-13", "meal_type": "SNACK", "food_name": "사과 1개",
            "calories_kcal": None, "protein_g": None,
        })
        assert created.status_code == 201
        assert client.get("/api/body/diet-review/current").json() is None
        response = client.post("/api/body/diet-review/current/analyze", json={})
        assert response.status_code == 200
        assert response.json()["average_daily_calories_kcal"] == 120 / 7
        assert len(captured) == 1
        assert client.get("/api/body/meals").json()[0]["calories_kcal"] == 120
        assert client.get("/api/body/foods").json()[0]["display_name"] == "사과 1개"


def test_existing_body_settings_gain_protein_target_and_payload_includes_it(tmp_path):
    from sqlalchemy import create_engine, text
    path = tmp_path / "legacy-body.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE body_settings (id INTEGER PRIMARY KEY, height_cm FLOAT NOT NULL)"))
        connection.execute(text("INSERT INTO body_settings (id, height_cm) VALUES (1, 171.0)"))
    engine.dispose()

    database = db.Database(path)
    try:
        service = DatabasePlanningService(database, now=SUNDAY)
        assert service.get_body_settings() == {
            "height_cm": 171.0, "daily_protein_target_g": 160.0, "daily_calorie_target_kcal": 1800.0}
        service.save_meal_entry(MealEntryInput(meal_type="LUNCH", food_name="두부", calories_kcal=120, protein_g=12))
        service.save_meal_entry(MealEntryInput(meal_type="DINNER", food_name="김밥 한 줄"))
        payload = service.diet_analysis_payload()
        assert payload["daily_protein_target_g"] == 160.0
        assert payload["daily_calorie_target_kcal"] == 1800.0
        assert payload["daily_totals"] == [{
            "date": "2026-09-13", "meals_logged": 2, "calories_kcal": 120.0,
            "protein_g": 12.0, "unresolved_entries": 1,
        }]
    finally:
        database.close()


def test_strict_schema_has_no_default_keyword_and_requires_every_field():
    from app.diet import strict_schema

    def walk(node, found):
        if isinstance(node, dict):
            found |= {key for key in node if key == "default"}
            for value in node.values():
                walk(value, found)
        elif isinstance(node, list):
            for value in node:
                walk(value, found)
        return found

    schema = strict_schema(DietAnalysis)
    assert walk(schema, set()) == set()
    assert set(schema["required"]) == set(schema["properties"])
    assert "biggest_issue" in schema["required"]
