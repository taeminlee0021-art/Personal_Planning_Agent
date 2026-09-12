from datetime import date, datetime
from typing import Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TaskFields(Model):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    estimated_minutes: int = Field(gt=0, le=120)
    priority: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    due_date: date | None = None
    status: Literal["TODO", "PLANNED", "COMPLETED"] = "TODO"
    category: str = Field(default="personal", max_length=120)
    weekly_target_count: int = Field(default=1, ge=1, le=7)


class Task(TaskFields):
    id: int = Field(gt=0)
    created_at: datetime
    updated_at: datetime


class Assignment(Model):
    task_id: int
    slot_id: str


class PlanChange(Model):
    operation: Literal["MOVE", "DELETE"]
    plan_id: int = Field(gt=0)
    slot_id: str | None

    @model_validator(mode="after")
    def valid_operation(self):
        if (self.operation == "DELETE") != (self.slot_id is None):
            raise ValueError("MOVE needs a slot; DELETE must use null")
        return self


class ScheduleProposal(Model):
    title: str = Field(min_length=1, max_length=120)
    start_datetime: AwareDatetime
    end_datetime: AwareDatetime
    description: str = Field(max_length=2000)
    fixed: Literal[True]

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_datetime <= self.start_datetime:
            raise ValueError("Schedule end must be after start")
        return self


class Proposal(Model):
    explanation: str = Field(min_length=1, max_length=4000)
    assignments: list[Assignment] = Field(max_length=49)

    changes: list[PlanChange] = Field(default_factory=list, max_length=49)
    schedules: list[ScheduleProposal] = Field(default_factory=list, max_length=49)
