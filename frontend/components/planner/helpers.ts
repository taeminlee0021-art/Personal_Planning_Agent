import type { Preferences, Priority, ScheduleDraft, TaskDraft } from "@/lib/types"

export type View = "today" | "tasks" | "week" | "weight" | "agent" | "settings"

export const emptyTask: TaskDraft = {
  title: "", description: "", estimated_minutes: 60, priority: "MEDIUM",
  due_date: null, category: "personal", weekly_target_count: 1,
}

export const emptySchedule: ScheduleDraft = {
  title: "", start_datetime: "", end_datetime: "", description: "", fixed: true,
}

export const defaultPreferences: Preferences = {
  weekday_available_from: "19:00", weekday_available_until: "22:00",
  weekend_available_from: "09:00", weekend_available_until: "22:00",
  max_daily_planning_minutes: 120,
}

export const priorityLabel: Record<Priority, string> = { LOW: "낮음", MEDIUM: "보통", HIGH: "높음" }
export const priorityStyle: Record<Priority, string> = {
  LOW: "bg-[#EEF2EF] text-[#64716B]", MEDIUM: "bg-[#E7EEF5] text-[#476D9B]", HIGH: "bg-[#F7E9E2] text-[#A1583B]",
}

export function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
}

export function weekDays() {
  const noon = new Date(`${dateKey(new Date())}T12:00:00Z`)
  const day = noon.getUTCDay()
  noon.setUTCDate(noon.getUTCDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(noon)
    value.setUTCDate(noon.getUTCDate() + index)
    return value.toISOString().slice(0, 10)
  })
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...options }).format(new Date(value))
}

export function formatTime(value: string) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function duration(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
}

export function toDatetimeLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value)).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function toAware(value: string) { return `${value}:00+09:00` }
