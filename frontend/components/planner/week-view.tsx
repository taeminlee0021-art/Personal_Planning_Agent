"use client"

import { CheckCircle2, ClipboardList, Dumbbell, Pencil, Plus, Trash2 } from "lucide-react"
import type { FixedSchedule, Plan, RecurringTask, TodayItem, WorkoutSession } from "@/lib/types"
import { dateKey, duration, formatDate, formatTime, recurringOnDate, weekDays, workoutMinutes, workoutTitle } from "@/components/planner/helpers"
import { ScheduleDialog } from "@/components/planner/schedule-dialog"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

const featuredActivities = ["헬스", "부동산 공부", "이직 준비"]

export function WeekView({ loading, plans, schedules, recurringTasks, weekTodayItems, workouts, onScheduleSaved, removeSchedule, togglePlan, toggleSchedule, toggleTodayItem, toggleWorkout }: { loading: boolean; plans: Plan[]; schedules: FixedSchedule[]; recurringTasks: RecurringTask[]; weekTodayItems: TodayItem[]; workouts: WorkoutSession[]; onScheduleSaved: (saved: FixedSchedule) => void; removeSchedule: (id: number) => Promise<void>; togglePlan: (plan: Plan) => Promise<void>; toggleSchedule: (schedule: FixedSchedule) => Promise<void>; toggleTodayItem: (item: TodayItem) => Promise<void>; toggleWorkout: (session: WorkoutSession) => Promise<void> }) {
  const days = weekDays()
  const today = dateKey(new Date())
  return <section aria-labelledby="week-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm font-semibold text-[#E85D8E]">THIS WEEK</p><h2 id="week-heading" className="font-display text-xl text-[#2B3561] md:text-2xl">한눈에 보는 주간 계획</h2></div><ScheduleDialog trigger={<Button variant="outline" className="h-11 rounded-xl bg-white"><Plus />고정 일정</Button>} onSaved={onScheduleSaved} /></div>
    {loading ? <LoadingCards /> : <>
      <section aria-labelledby="weekly-goals-heading" className="mb-6 rounded-[1.35rem] border bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><ClipboardList className="size-5 text-[#E85D8E]" /><h3 id="weekly-goals-heading" className="font-display text-xl text-[#2B3561]">주간 목표 현황</h3></div>
        <div className="grid gap-3 md:grid-cols-3">{featuredActivities.map((title) => {
          const activityPlans = plans.filter((plan) => plan.title === title)
          const activityItems = weekTodayItems.filter((item) => item.title === title)
          const recurringPlanned = recurringTasks.filter((item) => item.active && item.title === title).reduce((count, item) =>
            count + days.filter((day) => recurringOnDate(item, day)).length, 0)
          const unmatchedManual = activityItems.filter((item) => item.source !== "RECURRING" && !activityPlans.some((plan) => dateKey(plan.start_datetime) === item.item_date))
          const recurringExecuted = activityItems.filter((item) => item.source === "RECURRING" && item.status === "COMPLETED").length
          const activityWorkouts = title === "헬스" ? workouts : []
          const planned = activityPlans.length + recurringPlanned + unmatchedManual.length + activityWorkouts.length
          const executed = activityPlans.filter((plan) => plan.status === "COMPLETED").length + recurringExecuted + unmatchedManual.filter((item) => item.status === "COMPLETED").length + activityWorkouts.filter((item) => item.completed).length
          const tone = ["bg-[#DCEBFF]", "bg-[#FCE4EE]", "bg-[#FFF3B0]"][featuredActivities.indexOf(title) % 3]
          return <article key={title} className={`rounded-[1.25rem] p-4 ${tone}`}><p className="truncate text-sm font-semibold text-[#5A6185]">{title}</p><div className="mt-2 grid grid-cols-2 gap-2"><div><p className="font-display text-3xl leading-none text-[#2B3561]">{planned}</p><p className="mt-1 text-xs text-[#8A8FA8]">이번 주 계획</p></div><div><p className="font-display text-3xl leading-none text-[#2B3561]">{executed}</p><p className="mt-1 text-xs text-[#8A8FA8]">실행 완료</p></div></div></article>
        })}</div>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">{days.map((day) => {
      const dayPlans = plans.filter((plan) => dateKey(plan.start_datetime) === day)
      const fixed = schedules.filter((item) => dateKey(item.start_datetime) === day)
      const pendingFixed = fixed.filter((item) => !item.completed)
      const completedFixed = fixed.filter((item) => item.completed)
      const recurring = recurringTasks.filter((item) => item.active && recurringOnDate(item, day))
      const isToday = day === today
      const dayWorkouts = workouts.filter((item) => item.session_date === day)
      const untimedItems = weekTodayItems.filter((item) => item.item_date === day && item.source !== "RECURRING" && !dayPlans.some((plan) => item.task_id !== null && plan.task_id === item.task_id))
      const pendingPlans = dayPlans.filter((plan) => plan.status !== "COMPLETED")
      const completedPlans = dayPlans.filter((plan) => plan.status === "COMPLETED")
      const pendingUntimed = untimedItems.filter((item) => item.status !== "COMPLETED")
      const completedUntimed = untimedItems.filter((item) => item.status === "COMPLETED")
      const recurringRows = recurring.map((item) => {
        const row = weekTodayItems.find((candidate) => candidate.item_date === day && candidate.recurrence_id === item.id)
        return { item, row, completed: row?.status === "COMPLETED" }
      })
      return <section key={day} className={`min-w-0 overflow-hidden rounded-[1.2rem] border p-4 ${isToday ? "border-[#D7C8F0] bg-[#FCE4EE]" : "bg-white"}`}>
        <div className="mb-4"><p className={`text-sm font-bold ${isToday ? "text-[#4A5590]" : "text-[#5A6185]"}`}>{formatDate(`${day}T12:00:00+09:00`, { weekday: "short" })}</p><div className="mt-1 flex items-center gap-2"><p className="text-2xl font-bold text-[#2F3660]">{Number(day.slice(-2))}</p>{isToday && <Badge className="bg-[#E85D8E]">오늘</Badge>}</div></div>
        <div className="grid gap-2">
          {pendingPlans.map((plan) => <Row key={`p-${plan.id}`} accent="border-[#E85D8E] bg-white shadow-sm" meta={`${formatTime(plan.start_datetime)} · ${duration(plan.start_datetime, plan.end_datetime)}분`} metaClass="text-[#5A6185]" title={plan.title} titleClass="text-[#2F3660]" onToggle={() => void togglePlan(plan)} />)}
          {dayWorkouts.filter((item) => !item.completed).map((item) => <Row key={`w-${item.id}`} accent="border-[#E85D8E] bg-[#FCE4EE]" icon={<Dumbbell className="size-3.5" />} meta={workoutMinutes(item)} metaClass="text-[#5A6185]" title={workoutTitle(item)} titleClass="text-[#2F3660]" onToggle={() => void toggleWorkout(item)} />)}
          {pendingFixed.map((item) => <Row key={`s-${item.id}`} accent="border-[#E9A23B] bg-[#FFF8E1]" meta={`${formatTime(item.start_datetime)}–${formatTime(item.end_datetime)}`} metaClass="text-[#A66A1E]" title={item.title} titleClass="text-[#6B4A12]" onToggle={() => void toggleSchedule(item)} footer={<div className="mt-2 flex justify-end gap-1 border-t border-[#F6E7C4] pt-2"><ScheduleDialog schedule={item} trigger={<button aria-label={`${item.title} 수정`} className="grid size-8 place-items-center rounded-lg text-[#A66A1E] hover:bg-white"><Pencil className="size-4" /></button>} onSaved={onScheduleSaved} /><AlertDialog><AlertDialogTrigger asChild><button aria-label={`${item.title} 삭제`} className="grid size-8 place-items-center rounded-lg text-[#A66A1E] hover:bg-white"><Trash2 className="size-4" /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{item.title}’ 일정을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>기존 계획이 이 일정과 충돌하게 되면 삭제가 거절됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeSchedule(item.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>} />)}
          {pendingUntimed.map((item) => <Row key={`t-${item.id}`} accent="border-[#7A6BC9] bg-[#F4F1FF]" icon={<CheckCircle2 className="size-3.5" />} meta="체크리스트" metaClass="text-[#6F62B5]" title={item.title} titleClass="text-[#4B4382]" onToggle={() => void toggleTodayItem(item)} />)}
          {recurringRows.filter((entry) => !entry.completed).map(({ item, row }) => <Row key={`r-${item.id}`} accent="border-[#D7C8F0] bg-[#FCE4EE]" meta="반복" metaClass="text-[#5A6185]" title={item.title} titleClass="text-[#2F3660]" onToggle={row ? () => void toggleTodayItem(row) : undefined} />)}
          {completedPlans.map((plan) => <Row key={`p-${plan.id}`} completed meta={`${formatTime(plan.start_datetime)} · ${duration(plan.start_datetime, plan.end_datetime)}분 · 완료`} title={plan.title} onToggle={() => void togglePlan(plan)} />)}
          {dayWorkouts.filter((item) => item.completed).map((item) => <Row key={`w-${item.id}`} completed icon={<Dumbbell className="size-3.5" />} meta="운동 · 완료" title={workoutTitle(item)} onToggle={() => void toggleWorkout(item)} />)}
          {completedFixed.map((item) => <Row key={`s-${item.id}`} completed meta={`${formatTime(item.start_datetime)}–${formatTime(item.end_datetime)} · 완료`} title={item.title} onToggle={() => void toggleSchedule(item)} />)}
          {completedUntimed.map((item) => <Row key={`t-${item.id}`} completed icon={<CheckCircle2 className="size-3.5" />} meta="완료" title={item.title} onToggle={() => void toggleTodayItem(item)} />)}
          {recurringRows.filter((entry) => entry.completed).map(({ item, row }) => <Row key={`r-${item.id}`} completed meta="반복 · 완료" title={item.title} onToggle={row ? () => void toggleTodayItem(row) : undefined} />)}
          {dayPlans.length === 0 && dayWorkouts.length === 0 && fixed.length === 0 && recurring.length === 0 && untimedItems.length === 0 && <p className="rounded-xl border border-dashed py-5 text-center text-sm text-[#A3A7BC]">비어 있음</p>}
        </div>
      </section>
    })}</div></>}
  </section>
}

function Row({ accent, completed, icon, meta, metaClass, title, titleClass, footer, onToggle }: {
  accent?: string; completed?: boolean; icon?: React.ReactNode; meta: string; metaClass?: string; title: string; titleClass?: string; footer?: React.ReactNode; onToggle?: () => void
}) {
  const shell = completed ? "border-[#A3A7BC] bg-[#F3EFF7] opacity-60" : accent
  return <div className={`min-w-0 rounded-xl border-l-4 p-3 ${shell}`}>
    <div className="flex items-start gap-2">
      {onToggle && <Checkbox checked={!!completed} onCheckedChange={onToggle} aria-label={completed ? `${title} 완료 취소` : `${title} 완료`} className="mt-0.5 size-5 shrink-0 rounded-[6px] border-[#8A8FA8] data-[state=checked]:border-[#2B3561] data-[state=checked]:bg-[#2B3561]" />}
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-1 whitespace-nowrap text-xs font-semibold ${completed ? "text-[#8A8FA8]" : metaClass}`}>{icon}{meta}</p>
        <p className={`mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 ${completed ? "text-[#5A6185] line-through" : titleClass}`} title={title}>{title}</p>
      </div>
    </div>
    {footer}
  </div>
}
