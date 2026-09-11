import pytest


@pytest.fixture(autouse=True)
def isolate_deployment_environment(monkeypatch):
    """Local deployment secrets must not change deterministic test behavior."""
    monkeypatch.setenv("APP_INTERNAL_TOKEN", "")
    monkeypatch.setenv("PLANNING_DATABASE_PATH", "")
