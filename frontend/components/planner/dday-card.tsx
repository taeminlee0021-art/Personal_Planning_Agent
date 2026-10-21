"use client"

import type { FixedSchedule, Task } from "@/lib/types"
import { dateKey, formatDate } from "@/components/planner/helpers"

const DAY_MS = 86_400_000
const LIMIT = 5

export function DdayCard({ tasks, schedules }: { tasks: Task[]; schedules: FixedSchedule[] }) {
  const today = dateKey(new Date())
  const items = [
    ...tasks.filter((task) => task.status !== "COMPLETED" && task.due_date).map((task) => ({ key: `task-${task.id}`, title: task.title, date: task.due_date as string, kind: "마감" })),
    ...schedules.filter((item) => dateKey(item.start_datetime) >= today).map((item) => ({ key: `schedule-${item.id}`, title: item.title, date: dateKey(item.start_datetime), kind: "일정" })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title)).slice(0, LIMIT)

  return <div className="card-soft rounded-[1.75rem] bg-[#F4F1FF] p-5">
    <p className="font-display text-lg text-[#2B3561]">D-day</p>
    {items.length ? <ul className="mt-3 divide-y divide-[#E3DCEA]">{items.map((item) => {
      const diff = Math.round((Date.parse(`${item.date}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / DAY_MS)
      const label = diff === 0 ? "D-day" : diff > 0 ? `D-${diff}` : `D+${-diff}`
      return <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2F3660]" title={item.title}>{item.title}</p><p className="mt-0.5 text-xs text-[#8A8FA8]">{formatDate(`${item.date}T12:00:00+09:00`, { month: "numeric", day: "numeric", weekday: "short" })} · {item.kind}</p></div>
        <p className={`shrink-0 font-display text-xl ${diff < 0 ? "text-[#D9456B]" : diff === 0 ? "text-[#E85D8E]" : "text-[#2B3561]"}`}>{label}</p>
      </li>
    })}</ul> : <p className="mt-2 text-sm text-[#8A8FA8]">마감일이 있는 할 일이나 다가오는 고정 일정이 여기에 표시됩니다.</p>}
  </div>
}
