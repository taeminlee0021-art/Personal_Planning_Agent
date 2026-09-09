from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


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


class Proposal(Model):
    explanation: str = Field(min_length=1, max_length=4000)
    assignments: list[Assignment] = Field(max_length=49)
