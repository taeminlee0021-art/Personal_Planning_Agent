"use client"

import { DragEvent, FormEvent, useState } from "react"
import { CalendarClock, Check, CheckCircle2, Clock3, Dumbbell, GripVertical, HeartHandshake, Plus, Repeat2, Sparkles, Trash2 } from "lucide-react"
import type { FixedSchedule, GratitudeDraft, GratitudeEntry, Plan, Task, TodayItem, WorkoutSession } from "@/lib/types"
import type { HealthTab } from "@/components/planner/weight-view"
import { PlanRow, LoadingCards } from "@/components/planner/shared"
import { dateKey, duration, formatTime, workoutMinutes, workoutTitle } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

export function TodayView({ loading, items, plans, schedules, weekPlans, tasks, workouts, toggleWorkout, openAgent, openHealth, openGratitude, todayGratitude, addGratitude, addItem, toggleItem, togglePlan, toggleSchedule, removeItem, reorderItems }: {
  loading: boolean
  items: TodayItem[]
  plans: Plan[]
  schedules: FixedSchedule[]
  weekPlans: Plan[]
  tasks: Task[]
  openAgent: () => void
  workouts: WorkoutSession[]
  toggleWorkout: (session: WorkoutSession) => Promise<void>
  openHealth: (tab: HealthTab) => void
  openGratitude: () => void
  todayGratitude: GratitudeEntry[]
  addGratitude: (value: GratitudeDraft) => Promise<void>
  addItem: (title: string) => Promise<void>
  toggleItem: (item: TodayItem) => Promise<void>
  togglePlan: (plan: Plan) => Promise<void>
  toggleSchedule: (schedule: FixedSchedule) => Promise<void>
  removeItem: (id: number) => Promise<void>
  reorderItems: (orderedIds: number[]) => Promise<void>
}) {
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [gratitude, setGratitude] = useState("")
  const [savingGratitude, setSavingGratitude] = useState(false)
  const activeTasks = tasks.filter((task) => task.status !== "COMPLETED")
  const completed = items.filter((item) => item.status === "COMPLETED").length
  const pendingItems = items.filter((item) => item.status !== "COMPLETED")
  const completedItems = items.filter((item) => item.status === "COMPLETED")

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    setAdding(true)
    try {
      await addItem(value)
      setTitle("")
    } finally {
      setAdding(false)
    }
  }

  async function submitGratitude(event: FormEvent) {
    event.preventDefault()
    const value = gratitude.trim()
    if (!value) return
    setSavingGratitude(true)
    try { await addGratitude({ entry_date: dateKey(new Date()), content: value }); setGratitude("") } finally { setSavingGratitude(false) }
  }

  function dropItem(event: DragEvent, targetId: number) {
    event.preventDefault()
    if (draggedId === null || draggedId === targetId) return
    const next = items.map((item) => item.id)
    const from = next.indexOf(draggedId)
    const to = next.indexOf(targetId)
    next.splice(to, 0, next.splice(from, 1)[0])
    setDraggedId(null)
    void reorderItems(next)
  }

  function checklistItem(item: TodayItem, canDrag: boolean) {
    const isHealthPrompt = item.source === "RECURRING" && item.recurrence_id === null && (item.title === "몸무게 기록" || item.title === "주간 식단 평가")
    const isWeightPrompt = isHealthPrompt && item.title === "몸무게 기록"
    const isGratitudePrompt = item.source === "RECURRING" && item.recurrence_id === null && item.title === "감사일기 쓰기"
    const openPrompt = isGratitudePrompt ? openGratitude : isWeightPrompt ? () => openHealth("weight") : null
    return <div key={item.id} onDragOver={(event) => canDrag && event.preventDefault()} onDrop={(event) => canDrag && dropItem(event, item.id)} className={`group flex min-h-14 items-center gap-2 border-b border-[#F3EFF7] py-2 transition last:border-b-0 ${draggedId === item.id ? "opacity-45" : ""}`}>
      {canDrag ? <button type="button" draggable onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move" }} onDragEnd={() => setDraggedId(null)} aria-label={`${item.title} 순서 변경`} title="드래그하여 순서 변경" className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-[#A3A7BC] hover:bg-[#F3EFF7] hover:text-[#5A6185] active:cursor-grabbing"><GripVertical className="size-5" /></button> : <span className="size-8 shrink-0" aria-hidden="true" />}
      <button type="button" onClick={() => openPrompt ? openPrompt() : void toggleItem(item)} aria-label={isGratitudePrompt ? "감사일기 탭 열기" : isWeightPrompt ? "몸무게 입력 탭 열기" : item.status === "COMPLETED" ? `${item.title} 완료 취소` : `${item.title} 완료`} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#2B3561] hover:bg-[#FCE4EE]">{item.status === "COMPLETED" ? <span className="grid size-6 place-items-center rounded-[6px] bg-[#2B3561] text-white"><Check className="size-4" /></span> : <span className="size-6 rounded-[6px] border-2 border-[#8A8FA8] bg-white" />}</button>
      <div className="min-w-0 flex-1"><p className={`break-words font-medium ${item.status === "COMPLETED" ? "text-[#A3A7BC] line-through" : "text-[#2F3660]"}`}>{isHealthPrompt || isGratitudePrompt ? <button type="button" onClick={() => isGratitudePrompt ? openGratitude() : openHealth(isWeightPrompt ? "weight" : "diet")} className="rounded text-left underline decoration-[#D7C8F0] underline-offset-4 hover:text-[#4A5590] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A3C0]">{item.title}</button> : item.title}</p><div className="mt-1 flex flex-wrap gap-1.5">{item.source === "RECURRING" && <Badge variant="secondary" className="h-5 bg-[#F3EFF7] px-1.5 text-[0.68rem] text-[#5A6185]"><Repeat2 className="size-3" />{isGratitudePrompt ? "감사일기 열기" : isHealthPrompt ? "건강 탭 열기" : "반복"}</Badge>}{item.source === "TASK" && <Badge variant="secondary" className="h-5 bg-[#F3EFF7] px-1.5 text-[0.68rem] text-[#5A6185]">할 일에서 추가</Badge>}{item.completion_target > 1 && <Badge variant="outline" className="h-5 px-1.5 text-[0.68rem]">{item.completion_count * 500}ml · {item.completion_count}/{item.completion_target}</Badge>}</div></div>
      {item.source !== "RECURRING" && <Button size="icon" variant="ghost" onClick={() => void removeItem(item.id)} aria-label={`${item.title} 삭제`} className="shrink-0 text-[#C06A84] opacity-70 hover:opacity-100"><Trash2 /></Button>}
    </div>
  }

  return <section aria-labelledby="today-heading">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <div className="min-w-0">
        <div className="mb-5"><p className="mb-1 text-sm font-semibold text-[#E85D8E]">TODAY</p><h2 id="today-heading" className="font-display text-xl text-[#2B3561] md:text-2xl">오늘 하루를 한눈에</h2><p className="mt-2 text-sm text-[#8A8FA8]">운동, 감사일기, 체크리스트를 순서대로 확인하세요.</p></div>
        {!loading && workouts.length > 0 && <section aria-labelledby="workout-heading">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Dumbbell className="size-5 text-[#E85D8E]" /><h3 id="workout-heading" className="font-display text-xl text-[#2B3561]">오늘의 운동</h3></div><Button variant="ghost" size="sm" onClick={() => openHealth("workout")} className="text-[#4A5590]">운동 관리</Button></div>
          <div className="grid gap-3">{workouts.map((session) => <article key={session.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${session.completed ? "border-[#E9E4EE] bg-[#FBF9FC]" : "border-[#F0D3E0] bg-[#FFF2F7]"}`}><Checkbox checked={session.completed} onCheckedChange={() => void toggleWorkout(session)} aria-label={session.completed ? "운동 완료 취소" : "운동 완료"} className="mt-0.5 size-5 rounded-[6px] border-[#8A8FA8] data-[state=checked]:border-[#2B3561] data-[state=checked]:bg-[#2B3561]" /><div className="min-w-0 flex-1"><h3 className={`text-base font-semibold sm:text-lg ${session.completed ? "text-[#A3A7BC] line-through" : "text-[#2F3660]"}`}>{workoutTitle(session)}</h3><p className="mt-0.5 text-sm text-[#5A6185]">{workoutMinutes(session)}</p>{session.note && <p className="mt-2 text-sm leading-6 text-[#5A6185]">{session.note}</p>}{!session.muscle_groups.length && <button type="button" onClick={() => openHealth("workout")} className="mt-2 text-sm font-medium text-[#4A5590] underline underline-offset-4">부위 정하기</button>}</div></article>)}</div>
        </section>}

        <section className="mt-6 rounded-[1.35rem] border border-[#F0D3E0] bg-[#FFF2F7] p-4 sm:p-5" aria-labelledby="gratitude-today-heading">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><HeartHandshake className="size-5 text-[#E85D8E]" /><h3 id="gratitude-today-heading" className="font-display text-xl text-[#2B3561]">감사일기</h3></div><Button variant="ghost" size="sm" onClick={openGratitude} className="text-[#4A5590]">전체 보기</Button></div>
          {todayGratitude.length > 0 && <ul className="mb-3 space-y-1.5">{todayGratitude.map((entry) => <li key={entry.id} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-sm leading-6 text-[#2F3660]"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#E85D8E]" /><span className="min-w-0 whitespace-pre-wrap break-words">{entry.content}</span></li>)}</ul>}
          <form onSubmit={submitGratitude} className="flex gap-2"><Input aria-label="오늘 감사한 일" autoComplete="off" maxLength={2000} placeholder={todayGratitude.length ? "하나 더 적어볼까요?" : "오늘 감사한 일을 한 줄 적어보세요"} value={gratitude} onChange={(event) => setGratitude(event.target.value)} className="h-11 bg-white text-base" /><Button type="submit" disabled={savingGratitude || !gratitude.trim()} className="h-11 shrink-0 rounded-xl bg-[#2B3561] px-4">{savingGratitude ? "저장 중" : "저장"}</Button></form>
        </section>

        <form onSubmit={submit} className="mt-6 flex gap-2 rounded-2xl border border-[#F0D3E0] bg-white p-2 shadow-[0_8px_24px_rgba(34,64,53,0.08)] focus-within:border-[#F4A3C0] focus-within:ring-4 focus-within:ring-[#FCE4EE]">
          <div className="grid size-11 shrink-0 place-items-center text-[#E85D8E]"><Plus className="size-5" /></div>
          <Input aria-label="오늘 할 일" autoComplete="off" maxLength={120} placeholder="예: 저녁에 우유 사기" value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 border-0 px-0 text-base shadow-none focus-visible:ring-0" />
          <Button type="submit" disabled={adding || !title.trim()} className="h-11 shrink-0 rounded-xl bg-[#2B3561] px-4">{adding ? "추가 중" : "추가"}</Button>
        </form>

        <section className="mt-5 rounded-[1.35rem] border bg-white p-4 sm:p-5" aria-labelledby="checklist-heading">
          <div className="mb-3 flex items-center justify-between"><h3 id="checklist-heading" className="font-display text-xl text-[#2B3561]">오늘 체크리스트</h3><span className="text-sm font-medium text-[#8A8FA8]">{completed} / {items.length} 완료</span></div>
          {loading ? <LoadingCards /> : pendingItems.length ? <div className="divide-y">{pendingItems.map((item) => checklistItem(item, true))}</div> : <div className="rounded-xl border border-dashed bg-[#FBF9FC] px-4 py-8 text-center"><p className="font-medium text-[#5A6185]">남은 체크리스트가 없습니다</p><p className="mt-1 text-sm text-[#A3A7BC]">새 할 일을 추가하거나 아래에서 완료를 취소할 수 있습니다.</p></div>}
        </section>

        {!loading && completedItems.length > 0 && <section className="mt-4 rounded-[1.35rem] border border-[#E9E4EE] bg-[#F3EFF7] p-4 sm:p-5" aria-labelledby="completed-checklist-heading"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-[#5A6185]" /><h3 id="completed-checklist-heading" className="font-display text-xl text-[#5A6185]">완료된 항목</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#8A8FA8]">{completedItems.length}개</span></div><div className="divide-y divide-[#EBE4F0]">{completedItems.map((item) => checklistItem(item, false))}</div></section>}

        <section className="mt-6" aria-labelledby="scheduled-heading">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Clock3 className="size-5 text-[#E85D8E]" /><h3 id="scheduled-heading" className="font-display text-xl text-[#2B3561]">시간이 정해진 계획</h3></div><Button variant="ghost" size="sm" onClick={openAgent} className="text-[#4A5590]"><Sparkles />AI로 계획</Button></div>
          {loading ? <LoadingCards /> : plans.length || schedules.length ? <div className="grid gap-3">{schedules.map((schedule) => <article key={`schedule-${schedule.id}`} className={`grid grid-cols-[auto_4.3rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-4 transition sm:grid-cols-[auto_5rem_minmax(0,1fr)_auto] ${schedule.completed ? "border-[#E9E4EE] bg-[#FBF9FC]" : "border-[#FBE7B8] bg-[#FFF8E1]"}`}><Checkbox checked={schedule.completed} onCheckedChange={() => void toggleSchedule(schedule)} aria-label={schedule.completed ? `${schedule.title} 완료 취소` : `${schedule.title} 완료`} className="size-5 rounded-full border-[#E3B35A] data-[state=checked]:bg-[#D29A2F]" /><div className="tabular-nums"><p className="font-bold text-[#6B4A12]">{formatTime(schedule.start_datetime)}</p><p className="text-sm text-[#9A7E4A]">{formatTime(schedule.end_datetime)}</p></div><div className="min-w-0 border-l-2 border-[#F6DFA0] pl-4"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="bg-[#FFF0C2] text-[#A66A1E]"><CalendarClock className="size-3" />고정 일정</Badge>{schedule.completed && <Badge variant="outline">완료</Badge>}</div><h3 className={`truncate text-base font-semibold sm:text-lg ${schedule.completed ? "text-[#A3A7BC] line-through" : "text-[#6B4A12]"}`} title={schedule.title}>{schedule.title}</h3></div><p className="col-start-3 text-sm text-[#9A7E4A] sm:col-auto">{duration(schedule.start_datetime, schedule.end_datetime)}분</p></article>)}{plans.map((plan) => <PlanRow key={plan.id} plan={plan} onToggle={(item) => void togglePlan(item)} />)}</div> : <div className="rounded-2xl border border-dashed bg-white p-6 text-center"><p className="text-sm text-[#8A8FA8]">오늘 배정된 시간 계획이 없습니다.</p><Button variant="link" onClick={openAgent} className="mt-1 text-[#4A5590]">플래너에게 계획 요청하기</Button></div>}
        </section>
      </div>

      <aside className="grid content-start gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[1.25rem] bg-[#F3EFF7] p-4"><p className="text-xs font-semibold text-[#5A6185]">남은 체크리스트</p><p className="mt-1 font-display text-3xl leading-none text-[#2B3561]">{pendingItems.length}</p></div>
          <div className="rounded-[1.25rem] bg-[#FFF3B0] p-4"><p className="text-xs font-semibold text-[#6B5410]">오늘 완료</p><p className="mt-1 font-display text-3xl leading-none text-[#2B3561]">{completed}</p></div>
          <div className="rounded-[1.25rem] bg-[#FCE4EE] p-4"><p className="text-xs font-semibold text-[#C06A84]">시간이 정해진 계획</p><p className="mt-1 font-display text-3xl leading-none text-[#2B3561]">{plans.length + schedules.length}</p></div>
          <div className="rounded-[1.25rem] bg-[#DCEBFF] p-4"><p className="text-xs font-semibold text-[#4B4382]">진행 중인 목표</p><p className="mt-1 font-display text-3xl leading-none text-[#2B3561]">{activeTasks.length}</p></div>
        </div>
        <section className="rounded-[1.4rem] border bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[#E85D8E]"><CheckCircle2 className="size-5" /><p className="font-display text-lg text-[#2B3561]">진행 중인 목표</p></div><div className="mt-5 grid gap-4">{activeTasks.slice(0, 4).map((task) => { const count = weekPlans.filter((plan) => plan.task_id === task.id && plan.status === "COMPLETED").length; return <div key={task.id}><div className="mb-2 flex justify-between text-sm"><span className="truncate font-medium text-[#2F3660]">{task.title}</span><span className="ml-3 shrink-0 text-[#8A8FA8]">{count} / {task.weekly_target_count}회</span></div><Progress value={Math.min(100, count / task.weekly_target_count * 100)} className="bg-[#EFE9F4] [&_[data-slot=progress-indicator]]:bg-[#E85D8E]" /></div>})}{!activeTasks.length && <p className="text-sm leading-6 text-[#8A8FA8]">진행 중인 할 일이 없습니다.</p>}</div></section>
      </aside>
    </div>
  </section>
}
