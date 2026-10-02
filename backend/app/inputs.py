"""Validated structured input for direct user writes, not Agent actions."""
from datetime import date, datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator
from app.models import Model
from app.planning import TimeRange


class ScheduleInput(Model):
    title: str = Field(min_length=1, max_length=120)
    start_datetime: datetime
    end_datetime: datetime
    description: str = Field(default="", max_length=2000)
    fixed: Literal[True] = True

    @model_validator(mode="after")
    def valid_range(self):
        span = TimeRange(self.start_datetime, self.end_datetime)
        self.start_datetime, self.end_datetime = span.start, span.end
        return self


class ManualPlanInput(Model):
    task_id: int = Field(gt=0)
    start_datetime: datetime

    @model_validator(mode="after")
    def valid_start(self):
        from app.planning import aware
        self.start_datetime = aware(self.start_datetime)
        return self


class RecurringTaskInput(Model):
    title: str = Field(min_length=1, max_length=120)
    cadence: Literal["DAILY", "WEEKLY", "MONTHLY"]
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    start_date: date | None = None
    active: bool = True

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value):
        if any(day < 0 or day > 6 for day in value) or len(value) != len(set(value)):
            raise ValueError("Weekdays must be unique values from 0 to 6")
        return sorted(value)

    @model_validator(mode="after")
    def valid_cadence(self):
        if self.cadence == "DAILY" and self.weekdays:
            raise ValueError("Daily recurrence does not use weekdays")
        if self.cadence == "WEEKLY" and not self.weekdays:
            raise ValueError("Weekly recurrence needs at least one weekday")
        if self.cadence == "MONTHLY" and (self.weekdays or self.start_date is None):
            raise ValueError("Monthly recurrence needs a start date and no weekdays")
        return self


class TodayItemInput(Model):
    title: str = Field(min_length=1, max_length=120)


class BodySettingsInput(Model):
    height_cm: float = Field(gt=50, le=250, allow_inf_nan=False)


class WeightRecordInput(Model):
    measured_on: date | None = None
    weight_kg: float = Field(ge=20, le=400, allow_inf_nan=False)


MuscleGroup = Literal["LEGS", "BACK", "CHEST", "SHOULDERS", "ARMS", "CORE", "FULL_BODY"]


def unique_muscle_groups(value):
    if len(value) != len(set(value)):
        raise ValueError("Muscle groups must be unique")
    return value


class WorkoutSettingsInput(Model):
    weekdays: list[int] = Field(default_factory=lambda: [0, 2, 4, 6], min_length=1, max_length=7)
    strength_minutes: int = Field(default=30, ge=0, le=180)
    cardio_minutes: int = Field(default=30, ge=0, le=180)

    @field_validator("weekdays")
    @classmethod
    def valid_weekdays(cls, value):
        if any(day < 0 or day > 6 for day in value) or len(value) != len(set(value)):
            raise ValueError("Weekdays must be unique values from 0 to 6")
        return sorted(value)

    @model_validator(mode="after")
    def has_duration(self):
        if self.strength_minutes + self.cardio_minutes == 0:
            raise ValueError("Workout needs a positive duration")
        return self


class WorkoutSessionInput(Model):
    session_date: date
    muscle_groups: list[MuscleGroup] = Field(default_factory=list, max_length=2)
    note: str = Field(default="", max_length=500)
    completed: bool = False

    @field_validator("muscle_groups")
    @classmethod
    def valid_groups(cls, value):
        return unique_muscle_groups(value)


class MealEntryInput(Model):
    eaten_on: date | None = None
    meal_type: Literal["BREAKFAST", "LUNCH", "DINNER", "SNACK"]
    food_name: str = Field(min_length=1, max_length=200)
    calories_kcal: float | None = Field(default=None, ge=0, le=5000, allow_inf_nan=False)
    protein_g: float | None = Field(default=None, ge=0, le=500, allow_inf_nan=False)
