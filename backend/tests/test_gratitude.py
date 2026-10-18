from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app import database as db
from app.inputs import GratitudeEntryInput
from app.main import create_app
from app.storage_service import DatabasePlanningService

KST = ZoneInfo("Asia/Seoul")
NOW = datetime(2026, 10, 18, 21, 30, tzinfo=KST)


def test_entries_default_to_today_and_list_newest_first(tmp_path):
    database = db.Database(tmp_path / "gratitude.db")
    try:
        service = DatabasePlanningService(database, now=NOW)
        older = service.save_gratitude_entry(GratitudeEntryInput(
            entry_date=date(2026, 10, 17), content="아침에 날씨가 좋아서 산책했다."))
        today = service.save_gratitude_entry(GratitudeEntryInput(content="  친구가 저녁을 사 줬다.  "))
        assert today["entry_date"] == "2026-10-18"
        assert today["content"] == "친구가 저녁을 사 줬다."
        assert [item["id"] for item in service.list_gratitude_entries()] == [today["id"], older["id"]]

        edited = service.save_gratitude_entry(GratitudeEntryInput(content="산책 30분"), older["id"])
        assert (edited["entry_date"], edited["content"]) == ("2026-10-17", "산책 30분")
        assert edited["created_at"] == older["created_at"]

        service.delete_gratitude_entry(today["id"])
        assert [item["id"] for item in service.list_gratitude_entries()] == [older["id"]]
    finally:
        database.close()


def test_daily_prompt_tracks_entries_for_its_date(tmp_path, monkeypatch):
    monkeypatch.setattr("app.storage_service.DAILY_GRATITUDE_PROMPT", True)
    database = db.Database(tmp_path / "gratitude-prompt.db")
    try:
        service = DatabasePlanningService(database, now=NOW)
        prompt = next(item for item in service.list_today_items() if item["title"] == "감사일기 쓰기")
        assert prompt["status"] == "TODO" and prompt["recurrence_id"] is None

        entry = service.save_gratitude_entry(GratitudeEntryInput(content="오늘도 무사히."))
        prompt = next(item for item in service.list_today_items() if item["title"] == "감사일기 쓰기")
        assert prompt["status"] == "COMPLETED"

        # Moving the entry to yesterday reopens today's prompt.
        service.save_gratitude_entry(GratitudeEntryInput(entry_date=date(2026, 10, 17), content="어제 일"), entry["id"])
        prompt = next(item for item in service.list_today_items() if item["title"] == "감사일기 쓰기")
        assert prompt["status"] == "TODO"

        again = service.save_gratitude_entry(GratitudeEntryInput(content="다시 오늘"))
        service.delete_gratitude_entry(again["id"])
        prompt = next(item for item in service.list_today_items() if item["title"] == "감사일기 쓰기")
        assert prompt["status"] == "TODO"
        assert len([item for item in service.list_today_items() if item["title"] == "감사일기 쓰기"]) == 1
    finally:
        database.close()


def test_gratitude_api_validates_and_persists(tmp_path):
    app = create_app(tmp_path / "gratitude-api.db", now=NOW)
    with TestClient(app) as client:
        assert client.get("/api/gratitude").json() == []
        assert client.post("/api/gratitude", json={"content": "   "}).status_code == 422
        assert client.post("/api/gratitude", json={"content": "x" * 2001}).status_code == 422
        created = client.post("/api/gratitude", json={"content": "건강하게 하루를 보냈다."})
        assert created.status_code == 201
        entry = created.json()
        assert entry["entry_date"] == "2026-10-18"
        updated = client.put(f"/api/gratitude/{entry['id']}", json={
            "entry_date": "2026-10-16", "content": "수정한 내용"})
        assert updated.status_code == 200 and updated.json()["entry_date"] == "2026-10-16"
        assert client.get("/api/gratitude").json()[0]["content"] == "수정한 내용"
        assert client.delete(f"/api/gratitude/{entry['id']}").status_code == 204
        assert client.delete(f"/api/gratitude/{entry['id']}").status_code == 404
