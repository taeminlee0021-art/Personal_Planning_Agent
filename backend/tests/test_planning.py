import json
from copy import deepcopy
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from app.agent import PlanningAgent
from app.cli import menu
from app.models import Proposal
from app.services import MockPlanningService
from app.tools import NAMES, execute


@pytest.fixture
def service():
    return MockPlanningService(date(2026, 9, 7))


@pytest.mark.parametrize("title,minutes,priority,count", [
    ("", 60, "LOW", 1), ("   ", 60, "LOW", 1), ("Task", 0, "LOW", 1),
    ("Task", 121, "LOW", 1), ("Task", 30, "URGENT", 1), ("Task", 30, "HIGH", 0),
])
def test_invalid_task_does_not_mutate(service, title, minutes, priority, count):
    before = service.get_tasks()
    with pytest.raises(ValidationError):
        service.add_task(title, minutes, priority, count)
    assert service.get_tasks() == before


def test_read_tools_and_allowlist(service):
    for name in NAMES:
        json.dumps(execute(service, name, "{}"))
    with pytest.raises(ValueError):
        execute(service, "create_plan", "{}")
    with pytest.raises(ValueError):
        execute(service, "get_tasks", '{"id":1}')


def test_authored_slots_respect_fixture_schedules(service):
    for slot in service.slots:
        start, end = map(datetime.fromisoformat, [slot["start_datetime"], slot["end_datetime"]])
        assert start.date() > service.today
        assert (end - start).total_seconds() == 7200
        for event in service.schedules:
            assert not (start < datetime.fromisoformat(event["end_datetime"])
                        and datetime.fromisoformat(event["start_datetime"]) < end)


def test_proposal_is_not_saved(service):
    before = deepcopy(service.__dict__)
    result = service.render_proposal(Proposal(explanation="Example", assignments=[{"task_id": 1, "slot_id": "slot-1"}]))
    assert result["status"] == "PROPOSED_NOT_SAVED"
    assert result["blocks"][0]["end_datetime"] == "2026-09-08T21:00:00+09:00"
    assert service.__dict__ == before


@pytest.mark.parametrize("assignments", [
    [{"task_id": 999, "slot_id": "slot-1"}],
    [{"task_id": 1, "slot_id": "invented"}],
    [{"task_id": 1, "slot_id": "slot-1"}, {"task_id": 2, "slot_id": "slot-1"}],
])
def test_invalid_assignments_rejected(service, assignments):
    with pytest.raises(ValueError):
        service.render_proposal(Proposal(explanation="Example", assignments=assignments))


def test_deadline_and_completed_protection(service):
    service.tasks[0].due_date = date(2026, 9, 7)
    proposal = Proposal(explanation="Example", assignments=[{"task_id": 1, "slot_id": "slot-1"}])
    with pytest.raises(ValueError):
        service.render_proposal(proposal)
    service.tasks[0].due_date = None
    service.tasks[0].status = "COMPLETED"
    with pytest.raises(ValueError):
        service.render_proposal(proposal)


def test_weekly_target_protection(service):
    service.tasks[0].weekly_target_count = 1
    with pytest.raises(ValueError):
        service.render_proposal(Proposal(explanation="Example", assignments=[
            {"task_id": 1, "slot_id": "slot-1"}, {"task_id": 1, "slot_id": "slot-2"}]))


def response(output=(), text=""):
    return SimpleNamespace(status="completed", output=list(output), output_text=text, usage=None)


def test_agent_calls_tools_then_returns_validated_proposal(service):
    calls = [SimpleNamespace(type="function_call", name=name, arguments="{}", call_id=str(i))
             for i, name in enumerate(NAMES)]
    client = Mock()
    client.responses.create.side_effect = [
        response(calls),
        response(text='{"explanation":"Example","assignments":[{"task_id":1,"slot_id":"slot-1"}]}'),
    ]
    before = deepcopy(service.__dict__)
    result = PlanningAgent(client, "test-model", service).run("Plan my week")
    assert len(result["blocks"]) == 1
    assert service.__dict__ == before
    args = client.responses.create.call_args.kwargs
    assert sum(isinstance(item, dict) and item.get("type") == "function_call_output" for item in args["input"]) == 5
    assert args["store"] is False


def test_agent_cannot_skip_required_reads(service):
    client = Mock()
    client.responses.create.return_value = response(text='{"explanation":"Example","assignments":[]}')
    with pytest.raises(ValueError, match="required data"):
        PlanningAgent(client, "test", service).run("Plan")


def test_agent_round_limit(service):
    client = Mock()
    client.responses.create.return_value = response([
        SimpleNamespace(type="function_call", name="get_tasks", arguments="{}", call_id="1")])
    with pytest.raises(ValueError, match="round limit"):
        PlanningAgent(client, "test", service, max_rounds=2).run("Plan")
    assert client.responses.create.call_count == 2


def test_sunday_has_no_remaining_fixture_slots():
    service = MockPlanningService(date(2026, 9, 13))
    assert service.slots == []


def test_direct_entry_does_not_call_api(service, monkeypatch, capsys):
    answers = iter(["3", "Piano", "30", "3", "2", "0"])
    monkeypatch.setattr("builtins.input", lambda _: next(answers))
    api = Mock(side_effect=AssertionError("Unexpected API call"))
    monkeypatch.setattr("app.cli.ask_agent", api)
    menu(service)
    assert service.tasks[-1].title == "Piano"
    assert service.tasks[-1].priority == "HIGH"
    api.assert_not_called()
