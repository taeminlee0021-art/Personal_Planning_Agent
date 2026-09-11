"use client"

import { CheckCircle2, SunMedium } from "lucide-react"
import type { Plan, Preferences, Task } from "@/lib/types"
import { PlanRow, LoadingCards } from "@/components/planner/shared"
import { duration } from "@/components/planner/helpers"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"

export function TodayView({ loading, plans, weekPlans, tasks, preferences, openAgent }: { loading: boolean; plans: Plan[]; weekPlans: Plan[]; tasks: Task[]; preferences: Preferences; openAgent: () => void }) {
  const minutes = plans.reduce((sum, plan) => sum + duration(plan.start_datetime, plan.end_datetime), 0)
  const available = Math.max(0, preferences.max_daily_planning_minutes - minutes)
  const activeTasks = tasks.filter((task) => task.status !== "COMPLETED")
  return <section aria-labelledby="today-heading"><div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
    <div className="min-w-0"><div className="mb-5 flex items-end justify-between"><div><p className="mb-1 text-sm font-semibold text-[#356859]">TODAY</p><h2 id="today-heading" className="text-2xl font-bold tracking-tight md:text-3xl">{plans.length ? `오늘은 ${plans.length}가지에 집중해요` : "오늘 계획을 가볍게 시작해요"}</h2></div>{plans.length > 0 && <p className="hidden text-sm text-[#707A75] sm:block">총 {minutes}분</p>}</div>
      {loading ? <LoadingCards /> : plans.length ? <div className="grid gap-3">{plans.map((plan) => <PlanRow key={plan.id} plan={plan} />)}</div> : <Empty className="min-h-72 border bg-white"><EmptyHeader><EmptyMedia variant="icon"><SunMedium /></EmptyMedia><EmptyTitle>아직 오늘 계획이 없습니다</EmptyTitle><EmptyDescription>할 일을 추가한 다음 플래너에게 현실적인 일정을 요청해 보세요.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={openAgent} className="bg-[#183D35]">계획 요청하기</Button></EmptyContent></Empty>}
    </div>
    <aside className="grid content-start gap-5"><section className="rounded-[1.4rem] bg-[#183D35] p-5 text-white shadow-[0_12px_32px_rgba(24,61,53,0.18)] sm:p-6"><div className="flex items-center justify-between"><p className="font-semibold">오늘의 계획 여유</p><span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold">최대 {preferences.max_daily_planning_minutes}분</span></div><p className="mt-7 text-4xl font-bold tracking-tight">{available}분</p><p className="mt-2 text-sm leading-6 text-[#C9DBD4]">설정한 하루 계획 한도에서 아직 사용할 수 있는 시간입니다.</p></section>
      <section className="rounded-[1.4rem] border bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[#356859]"><CheckCircle2 className="size-5" /><p className="font-semibold">진행 중인 목표</p></div><div className="mt-5 grid gap-4">{activeTasks.slice(0, 4).map((task) => { const count = weekPlans.filter((plan) => plan.task_id === task.id && plan.status === "COMPLETED").length; return <div key={task.id}><div className="mb-2 flex justify-between text-sm"><span className="truncate font-medium text-[#31443D]">{task.title}</span><span className="ml-3 shrink-0 text-[#74807A]">{count} / {task.weekly_target_count}회</span></div><Progress value={Math.min(100, count / task.weekly_target_count * 100)} className="bg-[#E5ECE8] [&_[data-slot=progress-indicator]]:bg-[#356859]" /></div>})}{!activeTasks.length && <p className="text-sm leading-6 text-[#74807A]">진행 중인 할 일이 없습니다.</p>}</div></section></aside>
  </div></section>
}
