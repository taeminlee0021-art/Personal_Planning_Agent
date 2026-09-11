from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError
from sqlalchemy.exc import OperationalError

from app.inputs import ManualPlanInput
from app.main import create_app
from app.models import Proposal
from app.planning import KST
from app.tools import NAMES

NOW = datetime(2026, 9, 7, 8, tzinfo=KST)
START = datetime(2026, 9, 7, 19, tzinfo=KST)
SECRET = "sk-test-private-value-never-return"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENAI_MODEL", "")
    app = create_app(tmp_path / "api.db", now=NOW)
    with TestClient(app) as client:
        yield client


def task(client, **changes):
    response = client.post("/api/tasks", json={"title": "Exercise", "estimated_minutes": 60,
                                             "weekly_target_count": 3, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def event(**changes):
    return {"title": "Appointment", "start_datetime": START.isoformat(),
            "end_datetime": (START + timedelta(hours=1)).isoformat(), **changes}


def db_snapshot(client):
    service = client.app.state.service
    return [service.get_tasks(), service.list_schedules(), service.get_preferences(), service.list_plans()]


def test_tasks_crud_full_fields_and_partial_update(client):
    row = task(client, description="Practice", due_date="2026-09-10", category="health", priority="HIGH")
    assert row["status"] == "TODO"
    assert row["category"] == "health" and row["description"] == "Practice"
    assert client.get(f"/api/tasks/{row['id']}").json() == row
    changed = client.put(f"/api/tasks/{row['id']}", json={"title": "Walk", "due_date": None})
    assert changed.status_code == 200
    assert changed.json()["due_date"] is None
    assert changed.json()["estimated_minutes"] == 60
    completed = client.put(f"/api/tasks/{row['id']}", json={"status": "COMPLETED"})
    assert completed.json()["status"] == "COMPLETED"
    deleted = client.delete(f"/api/tasks/{row['id']}")
    assert deleted.status_code == 204 and deleted.content == b""
    assert client.get("/api/tasks").json() == []
    assert client.get(f"/api/tasks/{row['id']}").status_code == 404


@pytest.mark.parametrize("body", [
    {"title": "", "estimated_minutes": 60},
    {"title": "Task", "estimated_minutes": 0},
    {"title": "Task", "estimated_minutes": 121},
    {"title": "Task", "estimated_minutes": 30, "status": "PLANNED"},
    {"title": "Task", "estimated_minutes": 30, "priority": "URGENT"},
    {"title": "Task", "estimated_minutes": 30, "weekly_target_count": 8},
    {"title": "Task", "estimated_minutes": 30, "api_key": SECRET},
    {"title": "Task", "estimated_minutes": 30, "id": 100},
])
def test_invalid_task_request_has_no_write_or_input_echo(client, body):
    response = client.post("/api/tasks", json=body)
    assert response.status_code == 422
    assert SECRET not in response.text
    assert client.get("/api/tasks").json() == []


@pytest.mark.parametrize("body", [{}, {"title": None}, {"estimated_minutes": None}, {"created_at": SECRET}])
def test_invalid_update_preserves_task(client, body):
    row = task(client)
    response = client.put(f"/api/tasks/{row['id']}", json=body)
    assert response.status_code == 422
    assert client.get(f"/api/tasks/{row['id']}").json() == row
    assert SECRET not in response.text


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/tasks/999", None),
    ("put", "/api/tasks/999", {"title": "New"}),
    ("delete", "/api/tasks/999", None),
    ("put", "/api/schedules/999", event()),
    ("delete", "/api/schedules/999", None),
])
def test_missing_resource_returns_404(client, method, path, body):
    response = client.request(method, path, json=body)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("path", ["/api/tasks/0", "/api/tasks/-1", "/api/tasks/abc"])
def test_invalid_identifier(client, path):
    assert client.get(path).status_code == 422


def test_schedule_crud_and_timezone_normalization(client):
    response = client.post("/api/schedules", json=event(
        start_datetime="2026-09-07T10:00:00Z", end_datetime="2026-09-07T11:00:00Z"))
    assert response.status_code == 201
    row = response.json()
    assert row["start_datetime"] == START.isoformat()
    assert len(client.get("/api/schedules").json()) == 1
    changed = client.put(f"/api/schedules/{row['id']}", json=event(title="Changed"))
    assert changed.status_code == 200 and changed.json()["title"] == "Changed"
    assert client.delete(f"/api/schedules/{row['id']}").status_code == 204


@pytest.mark.parametrize("change", [
    {"start_datetime": "2026-09-07T19:00:00"},
    {"end_datetime": START.isoformat()},
    {"fixed": False},
])
def test_invalid_schedule(client, change):
    response = client.post("/api/schedules", json=event(**change))
    assert response.status_code == 422
    assert client.get("/api/schedules").json() == []


def test_preferences_validation_and_replacement(client):
    original = client.get("/api/preferences").json()
    assert original["timezone"] == "Asia/Seoul"
    response = client.put("/api/preferences", json={"max_daily_planning_minutes": 90})
    assert response.status_code == 200
    assert response.json()["max_daily_planning_minutes"] == 90
    assert response.json()["weekday_available_from"] == original["weekday_available_from"]
    invalid = client.put("/api/preferences", json={"weekday_available_from": "23:00"})
    assert invalid.status_code == 422
    assert client.get("/api/preferences").json()["max_daily_planning_minutes"] == 90


def test_linked_task_schedule_and_preferences_conflicts_rollback(client):
    row = task(client)
    service = client.app.state.service
    service.save_manual_plan(ManualPlanInput(task_id=row["id"], start_datetime=START))
    before = db_snapshot(client)
    responses = [
        client.delete(f"/api/tasks/{row['id']}"),
        client.put(f"/api/tasks/{row['id']}", json={"estimated_minutes": 30}),
        client.post("/api/schedules", json=event()),
        client.put("/api/preferences", json={"max_daily_planning_minutes": 30}),
    ]
    assert all(response.status_code == 409 for response in responses)
    assert db_snapshot(client) == before


def test_plan_queries_use_korean_day_and_week(client):
    row = task(client)
    service = client.app.state.service
    for offset in (0, 1, 7):
        service.save_manual_plan(ManualPlanInput(task_id=row["id"], start_datetime=START + timedelta(days=offset)))
    assert len(client.get("/api/plans").json()) == 3
    assert len(client.get("/api/plans/today").json()) == 1
    assert len(client.get("/api/plans/week").json()) == 2
    service._now = NOW + timedelta(days=7)
    assert len(client.get("/api/plans/today").json()) == 1
    assert len(client.get("/api/plans/week").json()) == 1
    assert client.post("/api/plans", json={}).status_code == 405


def test_api_restart_persistence_and_lifecycle(tmp_path):
    path = tmp_path / "restart.db"
    app = create_app(path, now=NOW)
    assert not path.exists()  # No DB access during import/factory creation.
    with TestClient(app) as first:
        row = task(first)
    with TestClient(create_app(path, now=NOW)) as second:
        assert second.get(f"/api/tasks/{row['id']}").json()["title"] == "Exercise"


def test_agent_endpoint_uses_real_tool_loop_without_writes(client, monkeypatch):
    row = task(client)
    calls = [SimpleNamespace(type="function_call", name=name, arguments="{}", call_id=str(i))
             for i, name in enumerate(NAMES)]
    sdk = Mock()
    sdk.responses.create.side_effect = [
        SimpleNamespace(status="completed", output=calls, output_text="", usage=None),
        SimpleNamespace(status="completed", output=[], usage=None,
                        output_text=Proposal(explanation="Example", assignments=[
                            {"task_id": row["id"], "slot_id": START.isoformat()}]).model_dump_json()),
    ]
    manager = Mock()
    manager.__enter__ = Mock(return_value=sdk)
    manager.__exit__ = Mock(return_value=False)
    factory = Mock(return_value=manager)
    monkeypatch.setattr("app.main.OpenAI", factory)
    monkeypatch.setenv("OPENAI_API_KEY", SECRET)
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    before = db_snapshot(client)
    response = client.post("/api/agent/messages", json={"message": "Plan my week"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "PENDING"
    assert len(response.json()["blocks"]) == 1
    assert SECRET not in response.text
    assert db_snapshot(client) == before
    assert factory.call_args.kwargs["api_key"] == SECRET
    assert SECRET not in str(sdk.responses.create.call_args_list)
    assert client.get("/api/agent/actions").json()[0]["id"] == response.json()["action_id"]


@pytest.mark.parametrize("body", [{"message": ""}, {"message": "   "}, {"message": "x" * 4001},
                                   {"message": "Plan", "api_key": SECRET}])
def test_invalid_agent_message_no_invocation(client, body):
    runner = Mock()
    client.app.state.agent_runner = runner
    response = client.post("/api/agent/messages", json=body)
    assert response.status_code == 422
    assert SECRET not in response.text
    runner.assert_not_called()


def test_agent_not_configured_is_503(client):
    response = client.post("/api/agent/messages", json={"message": "Plan"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "agent_not_configured"


def test_upstream_error_is_sanitized(client, monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", SECRET)
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    monkeypatch.setattr("app.main.OpenAI", Mock(side_effect=APIConnectionError(
        message=SECRET, request=httpx.Request("POST", "https://api.openai.com/v1/responses"))))
    response = client.post("/api/agent/messages", json={"message": "Plan"})
    assert response.status_code == 502
    assert SECRET not in response.text + caplog.text


def test_malformed_agent_result_cannot_leak(client, monkeypatch, caplog):
    monkeypatch.setenv("OPENAI_API_KEY", SECRET)
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    manager = Mock()
    manager.__enter__ = Mock(return_value=Mock())
    manager.__exit__ = Mock(return_value=False)
    monkeypatch.setattr("app.main.OpenAI", Mock(return_value=manager))
    monkeypatch.setattr("app.main.PlanningAgent", Mock(return_value=Mock(run=Mock(side_effect=ValueError(SECRET)))))
    response = client.post("/api/agent/messages", json={"message": "Plan"})
    assert response.status_code == 502
    assert SECRET not in response.text + caplog.text


@pytest.mark.parametrize("exception,expected", [
    (RuntimeError(SECRET), 500),
    (OperationalError("private sql", {"api_key": SECRET}, Exception(SECRET)), 503),
])
def test_internal_errors_do_not_leak(client, monkeypatch, caplog, exception, expected):
    monkeypatch.setattr(client.app.state.service, "get_tasks", Mock(side_effect=exception))
    response = client.get("/api/tasks")
    assert response.status_code == expected
    assert SECRET not in response.text + caplog.text
    assert "private sql" not in response.text + caplog.text
    assert response.headers["cache-control"] == "no-store"


def test_openapi_and_docs_have_no_credentials(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", SECRET)
    schema = client.get("/openapi.json")
    assert schema.status_code == 200
    assert SECRET not in schema.text
    assert "/api/agent/actions/{action_id}/approve" in schema.json()["paths"]
    assert client.get("/docs").status_code == 200
    assert client.get("/api/preferences").headers["cache-control"] == "no-store"


def test_response_validation_and_unknown_routes_are_sanitized(client, monkeypatch, caplog):
    monkeypatch.setattr(client.app.state.service, "get_tasks", Mock(return_value=[{"api_key": SECRET}]))
    response = client.get("/api/tasks")
    assert response.status_code == 500
    assert SECRET not in response.text + caplog.text
    assert client.get("/not-a-route").json()["error"]["code"] == "http_error"
    assert client.post("/api/plans", json={}).status_code == 405


def test_error_schema_matches_api_envelope(client):
    schema = client.get("/openapi.json").json()
    error_schema = schema["paths"]["/api/tasks"]["post"]["responses"]["422"]["content"]["application/json"]["schema"]
    assert error_schema["$ref"].endswith("/ErrorResponse")
