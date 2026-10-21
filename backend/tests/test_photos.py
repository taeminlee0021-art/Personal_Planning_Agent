from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app import database as db
from app.errors import ConflictError
from app.inputs import PhotoCaptionInput, PhotoInput
from app.main import create_app
from app.storage_service import DatabasePlanningService

KST = ZoneInfo("Asia/Seoul")
NOW = datetime(2026, 10, 21, 9, 0, tzinfo=KST)
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


def test_photos_keep_order_and_cap_at_ten(tmp_path):
    database = db.Database(tmp_path / "photos.db")
    try:
        service = DatabasePlanningService(database, now=NOW)
        saved = [service.add_photo(PhotoInput(caption=f"사진 {index}", image_data=PNG)) for index in range(10)]
        assert [item["order_index"] for item in saved] == list(range(10))
        with pytest.raises(ConflictError):
            service.add_photo(PhotoInput(image_data=PNG))

        ids = [item["id"] for item in saved]
        reordered = service.reorder_photos(list(reversed(ids)))
        assert [item["id"] for item in reordered] == list(reversed(ids))
        assert [item["order_index"] for item in reordered] == list(range(10))
        with pytest.raises(ConflictError):
            service.reorder_photos(ids[:-1])

        edited = service.update_photo_caption(ids[0], PhotoCaptionInput(caption="  콘서트  "))
        assert edited["caption"] == "콘서트"
        assert edited["image_data"] == PNG

        service.delete_photo(ids[0])
        assert len(service.list_photos()) == 9
        service.add_photo(PhotoInput(image_data=PNG))
        assert len(service.list_photos()) == 10
    finally:
        database.close()


def test_photo_api_validates_data_urls(tmp_path):
    app = create_app(tmp_path / "photos-api.db", now=NOW)
    with TestClient(app) as client:
        assert client.get("/api/photos").json() == []
        assert client.post("/api/photos", json={"image_data": "https://example.com/a.png"}).status_code == 422
        assert client.post("/api/photos", json={"image_data": "data:text/plain;base64,QUJD"}).status_code == 422
        assert client.post("/api/photos", json={"image_data": PNG, "caption": "x" * 121}).status_code == 422
        created = client.post("/api/photos", json={"image_data": PNG, "caption": "첫 사진"})
        assert created.status_code == 201
        photo = created.json()
        assert photo["order_index"] == 0 and photo["image_data"] == PNG
        assert client.put(f"/api/photos/{photo['id']}", json={"caption": "바꾼 캡션"}).json()["caption"] == "바꾼 캡션"
        assert client.post("/api/photos/reorder", json={"ordered_ids": [photo["id"], photo["id"]]}).status_code == 422
        assert client.post("/api/photos/reorder", json={"ordered_ids": [photo["id"] + 1]}).status_code == 409
        assert client.post("/api/photos/reorder", json={"ordered_ids": [photo["id"]]}).status_code == 200
        assert client.delete(f"/api/photos/{photo['id']}").status_code == 204
        assert client.delete(f"/api/photos/{photo['id']}").status_code == 404
