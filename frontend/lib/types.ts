export type Priority = "LOW" | "MEDIUM" | "HIGH"
export type TaskStatus = "TODO" | "PLANNED" | "COMPLETED"

export interface Task {
  id: number
  title: string
  description: string
  estimated_minutes: number
  priority: Priority
  due_date: string | null
  status: TaskStatus
  category: string
  weekly_target_count: number
  created_at: string
  updated_at: string
}

export interface FixedSchedule {
  id: number
  title: string
  start_datetime: string
  end_datetime: string
  description: string
  fixed: true
}

export interface Plan {
  id: number
  task_id: number
  title: string
  start_datetime: string
  end_datetime: string
  status: "PLANNED" | "COMPLETED"
  source: "MANUAL" | "AGENT"
  created_at: string
  updated_at: string
}

export interface Preferences {
  weekday_available_from: string
  weekday_available_until: string
  weekend_available_from: string
  weekend_available_until: string
  max_daily_planning_minutes: number
  timezone?: "Asia/Seoul"
}

export interface ReviewBlock {
  task_id: number
  title: string
  start_datetime: string
  end_datetime: string
}

export interface ReviewChange {
  operation: "MOVE" | "DELETE"
  plan_id: number
  before: ReviewBlock & { id: number; status: string; source: string }
  after: ReviewBlock | null
}

export interface Review {
  week_start: string
  explanation: string
  blocks: ReviewBlock[]
  changes: ReviewChange[]
  unallocated: { task_id: number; remaining_count: number }[]
}

export interface AgentResponse extends Review {
  status: "PENDING" | "PROPOSED_NOT_SAVED"
  action_id: number | null
}

export interface PendingAction {
  id: number
  action_type: "PLAN_CHANGES"
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED"
  proposal: Review
  result: {
    created_plan_ids: number[]
    updated_plan_ids: number[]
    deleted_plan_ids: number[]
  } | null
  created_at: string
  updated_at: string
  approved_at: string | null
  executed_at: string | null
}

export interface TaskDraft {
  title: string
  description: string
  estimated_minutes: number
  priority: Priority
  due_date: string | null
  category: string
  weekly_target_count: number
}

export interface ScheduleDraft {
  title: string
  start_datetime: string
  end_datetime: string
  description: string
  fixed: true
}
