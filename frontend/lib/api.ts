import type { ActionSelection, AgentResponse, BodySettings, DietReview, FixedSchedule, FoodNutrition, MealDraft, MealEntry, PendingAction, Plan, Preferences, RecurringTask, RecurringTaskDraft, ScheduleDraft, Task, TaskDraft, TodayItem, WeightRecord } from "@/lib/types"

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  })
  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    try {
      const body = await response.json() as { error?: { code?: string; message?: string } }
      if (body.error?.message) message = `${body.error.message}${body.error.code ? ` [${body.error.code}]` : ""}`
    } catch {}
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: (signal?: AbortSignal) => request<{ status: string }>("/health", { signal }),
  tasks: () => request<Task[]>("/tasks"),
  createTask: (value: TaskDraft) => request<Task>("/tasks", { method: "POST", body: JSON.stringify(value) }),
  updateTask: (id: number, value: Partial<TaskDraft> & { status?: Task["status"] }) => request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: "DELETE" }),
  schedules: () => request<FixedSchedule[]>("/schedules"),
  createSchedule: (value: ScheduleDraft) => request<FixedSchedule>("/schedules", { method: "POST", body: JSON.stringify(value) }),
  updateSchedule: (id: number, value: ScheduleDraft) => request<FixedSchedule>(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  updateScheduleStatus: (id: number, completed: boolean) => request<FixedSchedule>(`/schedules/${id}/status`, { method: "PUT", body: JSON.stringify({ completed }) }),
  deleteSchedule: (id: number) => request<void>(`/schedules/${id}`, { method: "DELETE" }),
  recurringTasks: () => request<RecurringTask[]>("/recurring-tasks"),
  createRecurringTask: (value: RecurringTaskDraft) => request<RecurringTask>("/recurring-tasks", { method: "POST", body: JSON.stringify(value) }),
  updateRecurringTask: (id: number, value: RecurringTaskDraft) => request<RecurringTask>(`/recurring-tasks/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteRecurringTask: (id: number) => request<void>(`/recurring-tasks/${id}`, { method: "DELETE" }),
  todayItems: () => request<TodayItem[]>("/today-items"),
  weekTodayItems: () => request<TodayItem[]>("/today-items/week"),
  createTodayItem: (title: string) => request<TodayItem>("/today-items", { method: "POST", body: JSON.stringify({ title }) }),
  createTodayItemFromTask: (id: number) => request<TodayItem>(`/today-items/from-task/${id}`, { method: "POST", body: "{}" }),
  updateTodayItem: (id: number, status: TodayItem["status"]) => request<TodayItem>(`/today-items/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
  reorderTodayItems: (orderedIds: number[]) => request<TodayItem[]>("/today-items/reorder", { method: "POST", body: JSON.stringify({ ordered_ids: orderedIds }) }),
  deleteTodayItem: (id: number) => request<void>(`/today-items/${id}`, { method: "DELETE" }),
  bodySettings: () => request<BodySettings>("/body/settings"),
  updateBodySettings: (height_cm: number) => request<BodySettings>("/body/settings", { method: "PUT", body: JSON.stringify({ height_cm }) }),
  weightRecords: () => request<WeightRecord[]>("/body/weights"),
  mealEntries: () => request<MealEntry[]>("/body/meals"),
  foodNutrition: () => request<FoodNutrition[]>("/body/foods"),
  createMealEntry: (value: MealDraft) => request<MealEntry>("/body/meals", { method: "POST", body: JSON.stringify(value) }),
  updateMealEntry: (id: number, value: MealDraft) => request<MealEntry>(`/body/meals/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteMealEntry: (id: number) => request<void>(`/body/meals/${id}`, { method: "DELETE" }),
  currentDietReview: () => request<DietReview | null>("/body/diet-review/current"),
  analyzeDiet: () => request<DietReview>("/body/diet-review/current/analyze", { method: "POST", body: "{}" }),
  saveWeightRecord: (weight_kg: number, measured_on: string) => request<WeightRecord>("/body/weights", { method: "POST", body: JSON.stringify({ weight_kg, measured_on }) }),
  preferences: () => request<Preferences>("/preferences"),
  updatePreferences: (value: Omit<Preferences, "timezone">) => request<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(value) }),
  plansToday: () => request<Plan[]>("/plans/today"),
  plansWeek: () => request<Plan[]>("/plans/week"),
  updatePlanStatus: (id: number, status: Plan["status"]) => request<Plan>(`/plans/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  sendAgentMessage: (message: string) => request<AgentResponse>("/agent/messages", { method: "POST", body: JSON.stringify({ message }) }),
  pendingActions: () => request<PendingAction[]>("/agent/actions"),
  approveAction: (id: number, selection?: ActionSelection) => request<PendingAction>(`/agent/actions/${id}/approve`, { method: "POST", body: JSON.stringify(selection ?? {}) }),
  rejectAction: (id: number) => request<PendingAction>(`/agent/actions/${id}/reject`, { method: "POST", body: "{}" }),
}
