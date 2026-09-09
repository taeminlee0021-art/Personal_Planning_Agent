"""Validated structured input for direct user writes, not Agent actions."""
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator
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
