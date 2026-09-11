from datetime import date
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator
from app.actions import Review
from app.inputs import ScheduleInput
from app.models import Model, TaskFields
from app.planning import Preferences


class TaskCreate(TaskFields):
    status: Literal["TODO"] = "TODO"


class TaskUpdate(Model):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    estimated_minutes: int | None = Field(default=None, gt=0, le=120)
    priority: Literal["LOW", "MEDIUM", "HIGH"] | None = None
    due_date: date | None = None
    status: Literal["TODO", "PLANNED", "COMPLETED"] | None = None
    category: str | None = Field(default=None, max_length=120)
    weekly_target_count: int | None = Field(default=None, ge=1, le=7)

    @model_validator(mode="after")
    def validate_changes(self):
        if not self.model_fields_set:
            raise ValueError("Supply at least one field")
        if any(getattr(self, field) is None for field in self.model_fields_set - {"due_date"}):
            raise ValueError("Only due_date may be null")
        return self


class ScheduleResponse(ScheduleInput):
    id: int


class PreferencesResponse(Preferences):
    timezone: Literal["Asia/Seoul"] = "Asia/Seoul"


class PlanResponse(Model):
    id: int
    task_id: int
    title: str
    start_datetime: AwareDatetime
    end_datetime: AwareDatetime
    status: Literal["PLANNED", "COMPLETED"]
    source: Literal["MANUAL", "AGENT"]
    created_at: AwareDatetime
    updated_at: AwareDatetime


class AgentMessage(Model):
    message: str = Field(min_length=1, max_length=4000)


class AgentResponse(Review):
    status: Literal["PENDING", "PROPOSED_NOT_SAVED"]
    action_id: int | None


class EmptyDecision(Model):
    pass


class ErrorBody(Model):
    code: str
    message: str


class ErrorResponse(Model):
    error: ErrorBody
