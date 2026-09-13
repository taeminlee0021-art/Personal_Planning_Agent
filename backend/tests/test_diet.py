from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app import database as db
from app.diet import DietAnalysis, NutritionEstimate
from app.inputs import MealEntryInput
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

        review = service.save_diet_analysis(DietAnalysis(
            nutrition_estimates=[NutritionEstimate(
                entry_id=meal["id"], calories_kcal=580, protein_g=16,
            )],
            summary="전체 열량과 채소 섭취를 함께 점검하세요. 영양값은 추정치입니다.",
            good_points=["식사를 빠짐없이 기록했습니다."],
            avoid_foods=["당이 많은 음료"],
            limit_foods=["라면"],
        ))
        assert review["total_calories_kcal"] == 580
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