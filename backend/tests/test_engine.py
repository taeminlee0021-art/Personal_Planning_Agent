from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone

import pytest
from pydantic import ValidationError
from app.models import Proposal
from app.planning import (
    KST, PlanBlock, Preferences, TimeRange, available_time,
    candidate_slots, daily_minutes, subtract_busy, validate_plan,
)
from app.services import MockPlanningService

MONDAY = date(2026, 9, 7)


def dt(day=7, hour=19, minute=0):
    return datetime(2026, 9, day, hour, minute, tzinfo=KST)


def span(start=19, end=20, day=7):
    return TimeRange(dt(day, start), dt(day, end))


@pytest.mark.parametrize("start,end", [
    (datetime(2026, 9, 7, 19), dt()), (dt(), dt()), (dt(7, 20), dt()),
])
def test_invalid_range(start, end):
    with pytest.raises(ValueError):
        TimeRange(start, end)


def test_offsets_normalize_and_touching_is_not_overlap():
    utc = TimeRange(datetime(2026, 9, 7, 10, tzinfo=timezone.utc),
                    datetime(2026, 9, 7, 11, tzinfo=timezone.utc))
    assert utc == span()
    assert utc.minutes == 60
    assert not utc.overlaps(span(20, 21))
    assert utc.overlaps(TimeRange(dt(7, 19, 30), dt(7, 20, 30)))


@pytest.mark.parametrize("busy,expected", [
    ([], [(19, 22)]),
    ([span(18, 23)], []),
    ([span(20, 21)], [(19, 20), (21, 22)]),
    ([span(20, 22), span(19, 21), span(20, 21)], []),
    ([span(18, 19), span(22, 23)], [(19, 22)]),
    ([span(19, 20), span(20, 21)], [(21, 22)]),
])
def test_subtraction(busy, expected):
    assert subtract_busy(span(19, 22), busy) == [span(a, b) for a, b in expected]


@pytest.mark.parametrize("values", [
    {"weekday_available_from": "22:00", "weekday_available_until": "19:00"},
    {"weekend_available_from": "09:00", "weekend_available_until": "09:00"},
    {"max_daily_planning_minutes": 0},
    {"weekday_available_from": time(19, tzinfo=timezone.utc)},
    {"weekday_available_from": "19:00:01"},
])
def test_preference_validation(values):
    with pytest.raises(ValidationError):
        Preferences(**values)


def test_today_weekend_and_cross_midnight_busy():
    preferences = Preferences()
    fixed = [TimeRange(dt(7, 20), dt(8, 20))]
    free = available_time(MONDAY, dt(7, 19, 30), preferences, fixed, [])
    assert free[0] == TimeRange(dt(7, 19, 30), dt(7, 20))
    assert free[1] == TimeRange(dt(8, 20), dt(8, 22))
    assert next(item for item in free if item.start.day == 12).start.hour == 9


def test_existing_budget_and_exclusion():
    existing = [PlanBlock(1, span(19, 21))]
    free = available_time(MONDAY, dt(), Preferences(), [], existing)
    assert all(item.start.day != 7 for item in free)
    existing = [PlanBlock(1, span(19, 20))]
    slots = candidate_slots(MONDAY, dt(), Preferences(), [], existing)
    monday = [slot for slot in slots if datetime.fromisoformat(slot["start_datetime"]).day == 7]
    assert monday[0]["start_datetime"] == dt(7, 20).isoformat()
    assert max(slot["capacity_minutes"] for slot in monday) == 60


def test_daily_budget_splits_existing_cross_midnight_block():
    block = PlanBlock(1, TimeRange(dt(7, 23), dt(8, 1)))
    assert daily_minutes(MONDAY, [block]) == 60
    assert daily_minutes(date(2026, 9, 8), [block]) == 60


@pytest.fixture
def service():
    return MockPlanningService(today=MONDAY)


def check(service, proposed):
    validate_plan(proposed, service.tasks, MONDAY, service.current_time(),
                  service.preferences, service.fixed_ranges(), service.current_plan)


def test_multiple_tasks_same_day_and_three_exercises(service):
    proposed = [PlanBlock(1, span(19, 20)), PlanBlock(2, span(20, 21)),
                PlanBlock(1, span(19, 20, 8)), PlanBlock(1, span(19, 20, 9))]
    before = deepcopy(service.__dict__)
    check(service, proposed)
    assert service.__dict__ == before


@pytest.mark.parametrize("blocks,message", [
    ([PlanBlock(1, span(19, 20, 10))], "fixed schedule"),
    ([PlanBlock(1, span(18, 19))], "availability"),
    ([PlanBlock(1, span(21, 23))], "availability"),
    ([PlanBlock(1, span(19, 21))], "duration"),
    ([PlanBlock(999, span())], "Unknown"),
    ([PlanBlock(1, span(19, 20, 14))], "outside"),
    ([PlanBlock(1, span()), PlanBlock(2, TimeRange(dt(7, 19, 30), dt(7, 20, 30)))], "another plan"),
    ([PlanBlock(1, span()), PlanBlock(2, span(20, 21)), PlanBlock(1, span(21, 22))], "daily"),
])
def test_plan_rejections(service, blocks, message):
    before = deepcopy(service.__dict__)
    with pytest.raises(ValueError, match=message):
        check(service, blocks)
    assert service.__dict__ == before


def test_existing_plan_conflict_and_budget(service):
    service.current_plan = [PlanBlock(1, span())]
    with pytest.raises(ValueError, match="another plan"):
        check(service, [PlanBlock(2, span())])
    with pytest.raises(ValueError, match="daily"):
        check(service, [PlanBlock(3, span(20, 22))])


def test_existing_counts_toward_weekly_target(service):
    service.tasks[0].weekly_target_count = 1
    service.current_plan = [PlanBlock(1, span())]
    with pytest.raises(ValueError, match="weekly"):
        check(service, [PlanBlock(1, span(19, 20, 8))])


def test_current_time_cutoff_and_minute_rounding():
    now = dt(7, 19, 12).replace(second=40)
    slots = candidate_slots(MONDAY, now, Preferences(), [], [])
    assert slots[0]["start_datetime"] == dt(7, 19, 13).isoformat()
    assert slots[1]["start_datetime"] == dt(7, 19, 30).isoformat()


def test_stale_proposal_rejected_after_new_fixed_schedule(service):
    slot_id = dt(7, 19).isoformat()
    assert any(slot["id"] == slot_id for slot in service.slots)
    service.schedules.append(service._event("new", "New appointment", MONDAY, 19, 20))
    before = deepcopy(service.__dict__)
    with pytest.raises(ValueError, match="stale"):
        service.render_proposal(Proposal(explanation="Example", assignments=[{"task_id": 1, "slot_id": slot_id}]))
    assert service.__dict__ == before


def test_service_rejects_overlapping_alternative_candidates(service):
    with pytest.raises(ValueError, match="another plan"):
        service.render_proposal(Proposal(explanation="Example", assignments=[
            {"task_id": 1, "slot_id": dt(7, 19).isoformat()},
            {"task_id": 2, "slot_id": dt(7, 19, 30).isoformat()}]))


def test_sunday_today_is_usable_and_week_ends():
    slots = MockPlanningService(now=dt(13, 20)).slots
    assert slots and all(datetime.fromisoformat(slot["start_datetime"]).day == 13 for slot in slots)
    assert MockPlanningService(now=dt(13, 23)).slots == []


def test_elapsed_slot_rejected(service):
    service._now = dt(7, 20)
    with pytest.raises(ValueError, match="past"):
        check(service, [PlanBlock(1, span())])


def test_unallocated_includes_existing_week_progress(service):
    service.current_plan = [PlanBlock(1, span())]
    result = service.render_proposal(Proposal(explanation="No new proposal", assignments=[]))
    assert next(item for item in result["unallocated"] if item["task_id"] == 1)["remaining_count"] == 2
