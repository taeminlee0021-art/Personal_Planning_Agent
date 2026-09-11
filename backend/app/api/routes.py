from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, Body

from app.api.schemas import (
    AgentMessage, AgentResponse, EmptyDecision, ErrorResponse, PlanResponse, PreferencesResponse,
    ScheduleResponse, TaskCreate, TaskUpdate,
)
from app.actions import ActionResponse, ActionService
from app.inputs import ScheduleInput
from app.models import Task
from app.planning import Preferences
from app.storage_service import DatabasePlanningService

router = APIRouter(prefix="/api", responses={
    code: {"model": ErrorResponse} for code in (404, 409, 422, 500, 502, 503)
})
Identifier = Annotated[int, Path(gt=0)]


def service(request: Request) -> DatabasePlanningService:
    return request.app.state.service


Service = Annotated[DatabasePlanningService, Depends(service)]


@router.post("/tasks", response_model=Task, status_code=201, tags=["Tasks"])
def create_task(value: TaskCreate, service: Service):
    return service.add_task(
        value.title, value.estimated_minutes, value.priority, value.weekly_target_count,
        description=value.description, due_date=value.due_date, category=value.category,
    )


@router.get("/tasks", response_model=list[Task], tags=["Tasks"])
def tasks(service: Service):
    return service.get_tasks()


@router.get("/tasks/{identifier}", response_model=Task, tags=["Tasks"])
def task(identifier: Identifier, service: Service):
    return service.get_task(identifier)


@router.put("/tasks/{identifier}", response_model=Task, tags=["Tasks"])
def update_task(identifier: Identifier, value: TaskUpdate, service: Service):
    """Update supplied fields only; explicit due_date=null clears the deadline."""
    return service.update_task(identifier, **value.model_dump(exclude_unset=True))


@router.delete("/tasks/{identifier}", status_code=204, tags=["Tasks"])
def delete_task(identifier: Identifier, service: Service):
    service.delete_task(identifier)
    return Response(status_code=204)


@router.post("/schedules", response_model=ScheduleResponse, status_code=201, tags=["Schedules"])
def create_schedule(value: ScheduleInput, service: Service):
    return service.save_schedule(value)


@router.get("/schedules", response_model=list[ScheduleResponse], tags=["Schedules"])
def schedules(service: Service):
    return service.list_schedules()


@router.put("/schedules/{identifier}", response_model=ScheduleResponse, tags=["Schedules"])
def update_schedule(identifier: Identifier, value: ScheduleInput, service: Service):
    return service.save_schedule(value, identifier)


@router.delete("/schedules/{identifier}", status_code=204, tags=["Schedules"])
def delete_schedule(identifier: Identifier, service: Service):
    service.delete_schedule(identifier)
    return Response(status_code=204)


@router.get("/preferences", response_model=PreferencesResponse, tags=["Preferences"])
def preferences(service: Service):
    return service.get_preferences()


@router.put("/preferences", response_model=PreferencesResponse, tags=["Preferences"])
def update_preferences(value: Preferences, service: Service):
    """Replace preferences; omitted fields use the documented default values."""
    return service.save_preferences(value)


@router.get("/plans", response_model=list[PlanResponse], tags=["Plans"])
def plans(service: Service):
    return service.list_plans()


@router.get("/plans/today", response_model=list[PlanResponse], tags=["Plans"])
def today(service: Service):
    return service.get_today_plan()


@router.get("/plans/week", response_model=list[PlanResponse], tags=["Plans"])
def week(service: Service):
    return service.get_current_plan()


@router.post("/agent/messages", response_model=AgentResponse, tags=["Agent"])
def agent_message(value: AgentMessage, request: Request, service: Service):
    # Synchronous route runs outside the event loop; no database write transaction
    # remains open while waiting for the external API.
    proposal = request.app.state.agent_runner(service, value.message)
    return ActionService(service).propose(proposal)


@router.get("/agent/actions", response_model=list[ActionResponse], tags=["Agent Actions"])
def pending_actions(service: Service):
    return ActionService(service).list_pending()


@router.get("/agent/actions/{action_id}", response_model=ActionResponse, tags=["Agent Actions"])
def action(action_id: Annotated[int, Path(gt=0)], service: Service):
    return ActionService(service).get(action_id)


@router.post("/agent/actions/{action_id}/approve", response_model=ActionResponse, tags=["Agent Actions"])
def approve_action(action_id: Annotated[int, Path(gt=0)], service: Service,
                   value: Annotated[EmptyDecision | None, Body()] = None):
    return ActionService(service).approve(action_id)


@router.post("/agent/actions/{action_id}/reject", response_model=ActionResponse, tags=["Agent Actions"])
def reject_action(action_id: Annotated[int, Path(gt=0)], service: Service,
                  value: Annotated[EmptyDecision | None, Body()] = None):
    return ActionService(service).reject(action_id)
