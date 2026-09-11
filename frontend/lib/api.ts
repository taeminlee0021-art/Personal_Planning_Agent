import type { AgentResponse, FixedSchedule, PendingAction, Plan, Preferences, ScheduleDraft, Task, TaskDraft } from "@/lib/types"

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
      const body = await response.json() as { error?: { message?: string } }
      if (body.error?.message) message = body.error.message
    } catch {}
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  tasks: () => request<Task[]>("/tasks"),
  createTask: (value: TaskDraft) => request<Task>("/tasks", { method: "POST", body: JSON.stringify(value) }),
  updateTask: (id: number, value: Partial<TaskDraft> & { status?: Task["status"] }) => request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: "DELETE" }),
  schedules: () => request<FixedSchedule[]>("/schedules"),
  createSchedule: (value: ScheduleDraft) => request<FixedSchedule>("/schedules", { method: "POST", body: JSON.stringify(value) }),
  updateSchedule: (id: number, value: ScheduleDraft) => request<FixedSchedule>(`/schedules/${id}`, { method: "PUT", body: JSON.stringify(value) }),
  deleteSchedule: (id: number) => request<void>(`/schedules/${id}`, { method: "DELETE" }),
  preferences: () => request<Preferences>("/preferences"),
  updatePreferences: (value: Omit<Preferences, "timezone">) => request<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(value) }),
  plansToday: () => request<Plan[]>("/plans/today"),
  plansWeek: () => request<Plan[]>("/plans/week"),
  sendAgentMessage: (message: string) => request<AgentResponse>("/agent/messages", { method: "POST", body: JSON.stringify({ message }) }),
  pendingActions: () => request<PendingAction[]>("/agent/actions"),
  approveAction: (id: number) => request<PendingAction>(`/agent/actions/${id}/approve`, { method: "POST", body: "{}" }),
  rejectAction: (id: number) => request<PendingAction>(`/agent/actions/${id}/reject`, { method: "POST", body: "{}" }),
}
