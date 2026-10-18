import pytest


@pytest.fixture(autouse=True)
def isolate_deployment_environment(monkeypatch):
    """Local deployment secrets must not change deterministic test behavior."""
    monkeypatch.setenv("APP_INTERNAL_TOKEN", "")
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("PLANNING_DATABASE_PATH", "")
    # Keep Today-list expectations in older tests stable; test_gratitude re-enables it.
    monkeypatch.setattr("app.storage_service.DAILY_GRATITUDE_PROMPT", False)
