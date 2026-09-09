"""Deterministic planning rules. All ranges are half-open [start, end)."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from pydantic import Field, model_validator
from app.models import Model, Task

KST = timezone(timedelta(hours=9))


def aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Timezone-aware datetime required")
    return value.astimezone(KST)


@dataclass(frozen=True)
class TimeRange:
    start: datetime
    end: datetime

    def __post_init__(self):
        object.__setattr__(self, "start", aware(self.start))
        object.__setattr__(self, "end", aware(self.end))
        if self.end <= self.start:
            raise ValueError("End must be after start")

    @property
    def minutes(self) -> float:
        return (self.end - self.start).total_seconds() / 60

    def overlaps(self, other: "TimeRange") -> bool:
        return self.start < other.end and other.start < self.end


class Preferences(Model):
    weekday_available_from: time = time(19)
    weekday_available_until: time = time(22)
    weekend_available_from: time = time(9)
    weekend_available_until: time = time(22)
    max_daily_planning_minutes: int = Field(default=120, ge=1, le=1440)

    @model_validator(mode="after")
    def valid_windows(self):
        for start, end in [(self.weekday_available_from, self.weekday_available_until),
                           (self.weekend_available_from, self.weekend_available_until)]:
            if start.tzinfo is not None or end.tzinfo is not None:
                raise ValueError("Preference times use local Asia/Seoul time without offsets")
            if start.second or start.microsecond or end.second or end.microsecond:
                raise ValueError("Preference times must use whole minutes")
            if start >= end:
                raise ValueError("Availability must start before end on the same day")
        return self

    def window(self, day: date) -> TimeRange:
        start, end = (self.weekday_available_from, self.weekday_available_until) if day.weekday() < 5 else (
            self.weekend_available_from, self.weekend_available_until)
        return TimeRange(datetime.combine(day, start, KST), datetime.combine(day, end, KST))


@dataclass(frozen=True)
class PlanBlock:
    task_id: int
    time: TimeRange


def subtract_busy(window: TimeRange, busy: list[TimeRange]) -> list[TimeRange]:
    """Sorted subtraction also handles nested, adjacent, and overlapping events."""
    cursor = window.start
    result = []
    for event in sorted(busy, key=lambda item: item.start):
        if event.end <= cursor or event.start >= window.end:
            continue
        if event.start > cursor:
            result.append(TimeRange(cursor, event.start))
        cursor = max(cursor, min(event.end, window.end))
        if cursor == window.end:
            break
    if cursor < window.end:
        result.append(TimeRange(cursor, window.end))
    return result


def daily_minutes(day: date, blocks: list[PlanBlock]) -> float:
    start = datetime.combine(day, time(), KST)
    end = start + timedelta(days=1)
    return sum(max(0, (min(block.time.end, end) - max(block.time.start, start)).total_seconds()) / 60
               for block in blocks)


def available_time(
    week_start: date, now: datetime, preferences: Preferences,
    fixed: list[TimeRange], existing: list[PlanBlock],
) -> list[TimeRange]:
    """Return free intervals; daily budget is checked independently of wall-clock space."""
    now = aware(now)
    result = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        window = preferences.window(day)
        start = max(window.start, now)
        if start >= window.end or daily_minutes(day, existing) >= preferences.max_daily_planning_minutes:
            continue
        result.extend(subtract_busy(TimeRange(start, window.end), fixed + [block.time for block in existing]))
    return result


def candidate_slots(week_start, now, preferences, fixed, existing):
    """Offer alternate starts every 30 minutes plus each free interval's first whole minute."""
    result = []
    for free in available_time(week_start, now, preferences, fixed, existing):
        start = free.start.replace(second=0, microsecond=0)
        if start < free.start:
            start += timedelta(minutes=1)
        remaining = preferences.max_daily_planning_minutes - daily_minutes(start.date(), existing)
        while start < free.end:
            capacity = min(int((free.end - start).total_seconds() // 60), int(remaining))
            if capacity > 0:
                result.append({"id": start.isoformat(), "start_datetime": start.isoformat(),
                               "end_datetime": (start + timedelta(minutes=capacity)).isoformat(),
                               "capacity_minutes": capacity})
            # First candidate may be off-grid due to now or an event ending.
            start += timedelta(minutes=30 - start.minute % 30)
    return result


def validate_plan(
    proposed: list[PlanBlock], tasks: list[Task], week_start: date, now: datetime,
    preferences: Preferences, fixed: list[TimeRange], existing: list[PlanBlock],
) -> None:
    """Validate a whole additive proposal without modifying any inputs."""
    now = aware(now)
    week_end = week_start + timedelta(days=7)
    task_map = {task.id: task for task in tasks}
    counts = {}
    for block in existing:
        if week_start <= block.time.start.date() < week_end:
            counts[block.task_id] = counts.get(block.task_id, 0) + 1
    checked = []
    for block in proposed:
        task = task_map.get(block.task_id)
        if task is None or task.status == "COMPLETED":
            raise ValueError("Unknown or completed task")
        span = block.time
        if span.start < now or not week_start <= span.start.date() < week_end:
            raise ValueError("Plan is in the past or outside the requested week")
        window = preferences.window(span.start.date())
        if span.start < window.start or span.end > window.end:
            raise ValueError("Plan is outside availability hours")
        if span.minutes != task.estimated_minutes:
            raise ValueError("Plan duration does not match task")
        if task.due_date and (span.end - timedelta(microseconds=1)).date() > task.due_date:
            raise ValueError("Plan exceeds task deadline")
        if any(span.overlaps(event) for event in fixed):
            raise ValueError("Plan conflicts with a fixed schedule")
        if any(span.overlaps(item.time) for item in existing + checked):
            raise ValueError("Plan conflicts with another plan")
        counts[task.id] = counts.get(task.id, 0) + 1
        if counts[task.id] > task.weekly_target_count:
            raise ValueError("Plan exceeds weekly target")
        checked.append(block)
    for day in {block.time.start.date() for block in proposed}:
        if daily_minutes(day, existing + proposed) > preferences.max_daily_planning_minutes:
            raise ValueError("Plan exceeds daily planning limit")
