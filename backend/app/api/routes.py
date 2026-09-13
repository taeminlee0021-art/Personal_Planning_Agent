from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, Body

from app.api.schemas import (
    AgentMessage, AgentResponse, BodySettingsResponse, DietReviewResponse, EmptyDecision, ErrorResponse, FoodNutritionResponse, MealEntryResponse, PlanResponse, PlanStatusUpdate, PreferencesResponse,
    RecurringTaskResponse, ScheduleResponse, ScheduleStatusUpdate, TaskCreate, TaskUpdate, TodayItemResponse,
    TodayItemsReorder, TodayItemUpdate, WeightRecordResponse,
)
from app.actions import ActionResponse, ActionService, ApprovalSelection
from app.inputs import BodySettingsInput, MealEntryInput, RecurringTaskInput, ScheduleInput, TodayItemInput, WeightRecordInput
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


@router.put("/schedules/{identifier}/status", response_model=ScheduleResponse, tags=["Schedules"])
def update_schedule_status(identifier: Identifier, value: ScheduleStatusUpdate, service: Service):
    return service.set_schedule_completed(identifier, value.completed)


@router.delete("/schedules/{identifier}", status_code=204, tags=["Schedules"])
def delete_schedule(identifier: Identifier, service: Service):
    service.delete_schedule(identifier)
    return Response(status_code=204)


@router.get("/recurring-tasks", response_model=list[RecurringTaskResponse], tags=["Settings"])
def recurring_tasks(service: Service):
    return service.list_recurring_tasks()


@router.post("/recurring-tasks", response_model=RecurringTaskResponse, status_code=201, tags=["Settings"])
def create_recurring_task(value: RecurringTaskInput, service: Service):
    return service.save_recurring_task(value)


@router.put("/recurring-tasks/{identifier}", response_model=RecurringTaskResponse, tags=["Settings"])
def update_recurring_task(identifier: Identifier, value: RecurringTaskInput, service: Service):
    return service.save_recurring_task(value, identifier)


@router.delete("/recurring-tasks/{identifier}", status_code=204, tags=["Settings"])
def delete_recurring_task(identifier: Identifier, service: Service):
    service.delete_recurring_task(identifier)
    return Response(status_code=204)


@router.get("/today-items", response_model=list[TodayItemResponse], tags=["Today"])
def today_items(service: Service):
    return service.list_today_items()


@router.get("/today-items/week", response_model=list[TodayItemResponse], tags=["Today"])
def week_today_items(service: Service):
    return service.list_week_today_items()


@router.post("/today-items", response_model=TodayItemResponse, status_code=201, tags=["Today"])
def create_today_item(value: TodayItemInput, service: Service):
    return service.create_today_item(value)


@router.post("/today-items/from-task/{identifier}", response_model=TodayItemResponse, status_code=201, tags=["Today"])
def create_today_item_from_task(identifier: Identifier, service: Service):
    return service.create_today_item_from_task(identifier)


@router.post("/today-items/reorder", response_model=list[TodayItemResponse], tags=["Today"])
def reorder_today_items(value: TodayItemsReorder, service: Service):
    return service.reorder_today_items(value.ordered_ids)


@router.put("/today-items/{identifier}", response_model=TodayItemResponse, tags=["Today"])
def update_today_item(identifier: Identifier, value: TodayItemUpdate, service: Service):
    return service.update_today_item(identifier, value.status)


@router.delete("/today-items/{identifier}", status_code=204, tags=["Today"])
def delete_today_item(identifier: Identifier, service: Service):
    service.delete_today_item(identifier)
    return Response(status_code=204)


@router.get("/body/settings", response_model=BodySettingsResponse, tags=["Body"])
def body_settings(service: Service):
    return service.get_body_settings()


@router.put("/body/settings", response_model=BodySettingsResponse, tags=["Body"])
def update_body_settings(value: BodySettingsInput, service: Service):
    return service.save_body_settings(value)


@router.get("/body/weights", response_model=list[WeightRecordResponse], tags=["Body"])
def weight_records(service: Service):
    return service.list_weight_records()


@router.post("/body/weights", response_model=WeightRecordResponse, status_code=201, tags=["Body"])
def save_weight_record(value: WeightRecordInput, service: Service):
    return service.save_weight_record(value)


@router.delete("/body/weights/{identifier}", status_code=204, tags=["Body"])
def delete_weight_record(identifier: Identifier, service: Service):
    service.delete_weight_record(identifier)
    return Response(status_code=204)


@router.get("/body/meals", response_model=list[MealEntryResponse], tags=["Body"])
def meal_entries(service: Service):
    return service.list_meal_entries()


@router.post("/body/meals", response_model=MealEntryResponse, status_code=201, tags=["Body"])
def create_meal_entry(value: MealEntryInput, service: Service):
    return service.save_meal_entry(value)


@router.put("/body/meals/{identifier}", response_model=MealEntryResponse, tags=["Body"])
def update_meal_entry(identifier: Identifier, value: MealEntryInput, service: Service):
    return service.save_meal_entry(value, identifier)


@router.delete("/body/meals/{identifier}", status_code=204, tags=["Body"])
def delete_meal_entry(identifier: Identifier, service: Service):
    service.delete_meal_entry(identifier)
    return Response(status_code=204)


@router.get("/body/foods", response_model=list[FoodNutritionResponse], tags=["Body"])
def food_nutrition(service: Service):
    return service.list_food_nutrition()


@router.get("/body/diet-review/current", response_model=DietReviewResponse | None, tags=["Body"])
def current_diet_review(service: Service):
    return service.get_diet_review()


@router.post("/body/diet-review/current/analyze", response_model=DietReviewResponse, tags=["Body"])
def analyze_current_diet(request: Request, service: Service):
    payload = service.diet_analysis_payload()
    analysis = request.app.state.diet_runner(payload)
    return service.save_diet_analysis(analysis)

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


@router.put("/plans/{identifier}/status", response_model=PlanResponse, tags=["Plans"])
def update_plan_status(identifier: Identifier, value: PlanStatusUpdate, service: Service):
    return service.set_plan_status(identifier, value.status)


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
                   value: Annotated[ApprovalSelection | None, Body()] = None):
    return ActionService(service).approve(action_id, value)


@router.post("/agent/actions/{action_id}/reject", response_model=ActionResponse, tags=["Agent Actions"])
def reject_action(action_id: Annotated[int, Path(gt=0)], service: Service,
                  value: Annotated[EmptyDecision | None, Body()] = None):
    return ActionService(service).reject(action_id)
