"use client"

import { CheckCircle2, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react"
import type { FixedSchedule, Plan, RecurringTask, TodayItem } from "@/lib/types"
import { dateKey, duration, formatDate, formatTime, weekDays } from "@/components/planner/helpers"
import { ScheduleDialog } from "@/components/planner/schedule-dialog"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const featuredActivities = ["헬스", "부동산 공부", "이직 준비"]

export function WeekView({ loading, plans, schedules, recurringTasks, weekTodayItems, refresh, removeSchedule }: { loading: boolean; plans: Plan[]; schedules: FixedSchedule[]; recurringTasks: RecurringTask[]; weekTodayItems: TodayItem[]; refresh: () => Promise<void>; removeSchedule: (id: number) => Promise<void> }) {
  const days = weekDays()
  const today = dateKey(new Date())
  return <section aria-labelledby="week-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm font-semibold text-[#356859]">THIS WEEK</p><h2 id="week-heading" className="text-2xl font-bold tracking-tight md:text-3xl">한눈에 보는 주간 계획</h2></div><ScheduleDialog trigger={<Button variant="outline" className="h-11 rounded-xl bg-white"><Plus />고정 일정</Button>} onSaved={refresh} /></div>
    {loading ? <LoadingCards /> : <>
      <section aria-labelledby="weekly-goals-heading" className="mb-6 rounded-[1.35rem] border bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><ClipboardList className="size-5 text-[#356859]" /><h3 id="weekly-goals-heading" className="font-bold text-[#263A33]">주간 목표 현황</h3></div>
        <div className="grid gap-3 md:grid-cols-3">{featuredActivities.map((title) => {
          const activityPlans = plans.filter((plan) => plan.title === title)
          const activityItems = weekTodayItems.filter((item) => item.title === title)
          const recurringPlanned = recurringTasks.filter((item) => item.active && item.title === title).reduce((count, item) =>
            count + days.filter((day, index) => day >= item.start_date && (item.cadence === "DAILY" || item.weekdays.includes(index))).length, 0)
          const unmatchedManual = activityItems.filter((item) => item.source !== "RECURRING" && !activityPlans.some((plan) => dateKey(plan.start_datetime) === item.item_date))
          const recurringExecuted = activityItems.filter((item) => item.source === "RECURRING" && item.status === "COMPLETED").length
          const planned = activityPlans.length + recurringPlanned + unmatchedManual.length
          const executed = activityPlans.filter((plan) => plan.status === "COMPLETED").length + recurringExecuted + unmatchedManual.filter((item) => item.status === "COMPLETED").length
          return <article key={title} className="rounded-xl border border-[#DDE5E0] bg-[#FAFCFA] p-4"><p className="truncate font-semibold text-[#2D423A]">{title}</p><div className="mt-3 grid grid-cols-2 gap-2 text-center"><div><p className="text-xl font-bold text-[#345F52]">{planned}</p><p className="text-sm text-[#77827D]">이번 주 계획</p></div><div><p className="text-xl font-bold text-[#345F52]">{executed}</p><p className="text-sm text-[#77827D]">실행 완료</p></div></div></article>
        })}</div>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">{days.map((day, dayIndex) => {
      const dayPlans = plans.filter((plan) => dateKey(plan.start_datetime) === day)
      const fixed = schedules.filter((item) => dateKey(item.start_datetime) === day)
      const pendingFixed = fixed.filter((item) => !item.completed)
      const completedFixed = fixed.filter((item) => item.completed)
      const recurring = recurringTasks.filter((item) => item.active && day >= item.start_date && (item.cadence === "DAILY" || item.weekdays.includes(dayIndex)))
      const isToday = day === today
      const untimedItems = weekTodayItems.filter((item) => item.item_date === day && item.source !== "RECURRING" && !dayPlans.some((plan) => item.task_id !== null && plan.task_id === item.task_id))
      const pendingPlans = dayPlans.filter((plan) => plan.status !== "COMPLETED")
      const completedPlans = dayPlans.filter((plan) => plan.status === "COMPLETED")
      const pendingUntimed = untimedItems.filter((item) => item.status !== "COMPLETED")
      const completedUntimed = untimedItems.filter((item) => item.status === "COMPLETED")
      const recurringRows = recurring.map((item) => ({
        item,
        completed: weekTodayItems.some((row) => row.item_date === day && row.recurrence_id === item.id && row.status === "COMPLETED"),
      }))
      return <section key={day} className={`min-w-0 overflow-hidden rounded-[1.2rem] border p-4 ${isToday ? "border-[#7DA394] bg-[#F0F7F3]" : "bg-white"}`}>
        <div className="mb-4"><p className={`text-sm font-bold ${isToday ? "text-[#285A4D]" : "text-[#68746E]"}`}>{formatDate(`${day}T12:00:00+09:00`, { weekday: "short" })}</p><div className="mt-1 flex items-center gap-2"><p className="text-2xl font-bold text-[#263A33]">{Number(day.slice(-2))}</p>{isToday && <Badge className="bg-[#356859]">오늘</Badge>}</div></div>
        <div className="grid gap-2">
          {pendingPlans.map((plan) => <div key={`p-${plan.id}`} className="min-w-0 rounded-xl border-l-4 border-[#356859] bg-white p-3 shadow-sm"><p className="whitespace-nowrap text-xs font-semibold text-[#66736D]">{formatTime(plan.start_datetime)} · {duration(plan.start_datetime, plan.end_datetime)}분</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#263A33]" title={plan.title}>{plan.title}</p></div>)}
          {pendingFixed.map((item) => <div key={`s-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#D17B52] bg-[#FFF7F1] p-3"><p className="whitespace-nowrap text-xs font-semibold text-[#9A6046]">{formatTime(item.start_datetime)}–{formatTime(item.end_datetime)}</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#5D4034]" title={item.title}>{item.title}</p><div className="mt-2 flex justify-end gap-1 border-t border-[#ECD9CF] pt-2"><ScheduleDialog schedule={item} trigger={<button aria-label={`${item.title} 수정`} className="grid size-8 place-items-center rounded-lg text-[#98634C] hover:bg-white"><Pencil className="size-4" /></button>} onSaved={refresh} /><AlertDialog><AlertDialogTrigger asChild><button aria-label={`${item.title} 삭제`} className="grid size-8 place-items-center rounded-lg text-[#98634C] hover:bg-white"><Trash2 className="size-4" /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{item.title}’ 일정을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>기존 계획이 이 일정과 충돌하게 되면 삭제가 거절됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeSchedule(item.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></div>)}
          {pendingUntimed.map((item) => <div key={`t-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#5E7798] bg-[#F3F7FC] p-3"><p className="flex items-center gap-1 text-xs font-semibold text-[#5E7190]"><CheckCircle2 className="size-3.5" />체크리스트</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#32465F]" title={item.title}>{item.title}</p></div>)}
          {recurringRows.filter((row) => !row.completed).map(({ item }) => <div key={`r-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#7B9C8E] bg-[#F1F6F3] p-3"><p className="text-xs font-semibold text-[#607B70]">반복</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#314A40]" title={item.title}>{item.title}</p></div>)}
          {completedPlans.map((plan) => <div key={`p-${plan.id}`} className="min-w-0 rounded-xl border-l-4 border-[#9AA8A2] bg-[#F2F4F2] p-3 opacity-60"><p className="whitespace-nowrap text-xs font-semibold text-[#738079]">{formatTime(plan.start_datetime)} · {duration(plan.start_datetime, plan.end_datetime)}분 · 완료</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#56645E] line-through" title={plan.title}>{plan.title}</p></div>)}
          {completedFixed.map((item) => <div key={`s-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#9AA8A2] bg-[#F2F4F2] p-3 opacity-60"><p className="whitespace-nowrap text-xs font-semibold text-[#738079]">{formatTime(item.start_datetime)}–{formatTime(item.end_datetime)} · 완료</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#56645E] line-through" title={item.title}>{item.title}</p></div>)}
          {completedUntimed.map((item) => <div key={`t-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#9AA8A2] bg-[#F2F4F2] p-3 opacity-60"><p className="flex items-center gap-1 text-xs font-semibold text-[#738079]"><CheckCircle2 className="size-3.5" />완료</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#56645E] line-through" title={item.title}>{item.title}</p></div>)}
          {recurringRows.filter((row) => row.completed).map(({ item }) => <div key={`r-${item.id}`} className="min-w-0 rounded-xl border-l-4 border-[#9AA8A2] bg-[#F2F4F2] p-3 opacity-60"><p className="text-xs font-semibold text-[#738079]">반복 · 완료</p><p className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-[#56645E] line-through" title={item.title}>{item.title}</p></div>)}
          {dayPlans.length === 0 && fixed.length === 0 && recurring.length === 0 && untimedItems.length === 0 && <p className="rounded-xl border border-dashed py-5 text-center text-sm text-[#929A96]">비어 있음</p>}
        </div>
      </section>
    })}</div></>}
  </section>
}
