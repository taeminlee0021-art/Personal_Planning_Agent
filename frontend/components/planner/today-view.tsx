"use client"

import { DragEvent, FormEvent, useState } from "react"
import { CalendarClock, Check, CheckCircle2, Circle, Clock3, GripVertical, Plus, Repeat2, Sparkles, Trash2 } from "lucide-react"
import type { FixedSchedule, Plan, Task, TodayItem } from "@/lib/types"
import { PlanRow, LoadingCards } from "@/components/planner/shared"
import { duration, formatTime } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

export function TodayView({ loading, items, plans, schedules, weekPlans, tasks, openAgent, openWeight, addItem, toggleItem, togglePlan, toggleSchedule, removeItem, reorderItems }: {
  loading: boolean
  items: TodayItem[]
  plans: Plan[]
  schedules: FixedSchedule[]
  weekPlans: Plan[]
  tasks: Task[]
  openAgent: () => void
  openWeight: () => void
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
    return <div key={item.id} onDragOver={(event) => canDrag && event.preventDefault()} onDrop={(event) => canDrag && dropItem(event, item.id)} className={`group flex min-h-14 items-center gap-2 border-b border-[#EDF0ED] py-2 transition last:border-b-0 ${draggedId === item.id ? "opacity-45" : ""}`}>
      {canDrag ? <button type="button" draggable onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move" }} onDragEnd={() => setDraggedId(null)} aria-label={`${item.title} 순서 변경`} title="드래그하여 순서 변경" className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-[#96A09B] hover:bg-[#F0F3F1] hover:text-[#53665E] active:cursor-grabbing"><GripVertical className="size-5" /></button> : <span className="size-8 shrink-0" aria-hidden="true" />}
      <button type="button" onClick={() => isHealthPrompt ? openWeight() : void toggleItem(item)} aria-label={isHealthPrompt ? "건강 기록 탭 열기" : item.status === "COMPLETED" ? `${item.title} 완료 취소` : `${item.title} 완료`} className="grid size-10 shrink-0 place-items-center rounded-xl text-[#356859] hover:bg-[#EDF4F0]">{item.status === "COMPLETED" ? <span className="grid size-6 place-items-center rounded-full bg-[#356859] text-white"><Check className="size-4" /></span> : <Circle className="size-6" />}</button>
      <div className="min-w-0 flex-1"><p className={`break-words font-medium ${item.status === "COMPLETED" ? "text-[#8A928E] line-through" : "text-[#283B34]"}`}>{isHealthPrompt ? <button type="button" onClick={openWeight} className="rounded text-left underline decoration-[#9CB7AC] underline-offset-4 hover:text-[#285A4D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5F8C7C]">{item.title}</button> : item.title}</p><div className="mt-1 flex flex-wrap gap-1.5">{item.source === "RECURRING" && <Badge variant="secondary" className="h-5 bg-[#EEF3F0] px-1.5 text-[0.68rem] text-[#53665E]"><Repeat2 className="size-3" />{isHealthPrompt ? "건강 탭 열기" : "반복"}</Badge>}{item.source === "TASK" && <Badge variant="secondary" className="h-5 bg-[#EEF3F0] px-1.5 text-[0.68rem] text-[#53665E]">할 일에서 추가</Badge>}{item.completion_target > 1 && <Badge variant="outline" className="h-5 px-1.5 text-[0.68rem]">{item.completion_count * 500}ml · {item.completion_count}/{item.completion_target}</Badge>}</div></div>
      {item.source !== "RECURRING" && <Button size="icon" variant="ghost" onClick={() => void removeItem(item.id)} aria-label={`${item.title} 삭제`} className="shrink-0 text-[#9A6554] opacity-70 hover:opacity-100"><Trash2 /></Button>}
    </div>
  }

  return <section aria-labelledby="today-heading">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <div className="min-w-0">
        <div className="mb-5"><p className="mb-1 text-sm font-semibold text-[#356859]">TODAY</p><h2 id="today-heading" className="text-2xl font-bold tracking-tight md:text-3xl">오늘 할 일을 바로 적어보세요</h2><p className="mt-2 text-sm text-[#74807A]">입력하고 Enter를 누르면 즉시 등록됩니다.</p></div>
        <form onSubmit={submit} className="flex gap-2 rounded-2xl border border-[#BFCFC7] bg-white p-2 shadow-[0_8px_24px_rgba(34,64,53,0.08)] focus-within:border-[#5F8C7C] focus-within:ring-4 focus-within:ring-[#DCEAE3]">
          <div className="grid size-11 shrink-0 place-items-center text-[#356859]"><Plus className="size-5" /></div>
          <Input aria-label="오늘 할 일" autoComplete="off" maxLength={120} placeholder="예: 저녁에 우유 사기" value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 border-0 px-0 text-base shadow-none focus-visible:ring-0" />
          <Button type="submit" disabled={adding || !title.trim()} className="h-11 shrink-0 rounded-xl bg-[#183D35] px-4">{adding ? "추가 중" : "추가"}</Button>
        </form>

        <section className="mt-5 rounded-[1.35rem] border bg-white p-4 sm:p-5" aria-labelledby="checklist-heading">
          <div className="mb-3 flex items-center justify-between"><h3 id="checklist-heading" className="font-bold text-[#263A33]">오늘 체크리스트</h3><span className="text-sm font-medium text-[#74807A]">{completed} / {items.length} 완료</span></div>
          {loading ? <LoadingCards /> : pendingItems.length ? <div className="divide-y">{pendingItems.map((item) => checklistItem(item, true))}</div> : <div className="rounded-xl border border-dashed bg-[#FAFBF9] px-4 py-8 text-center"><p className="font-medium text-[#54645E]">남은 체크리스트가 없습니다</p><p className="mt-1 text-sm text-[#89918D]">새 할 일을 추가하거나 아래에서 완료를 취소할 수 있습니다.</p></div>}
        </section>

        {!loading && completedItems.length > 0 && <section className="mt-4 rounded-[1.35rem] border border-[#D8DEDA] bg-[#F1F4F2] p-4 sm:p-5" aria-labelledby="completed-checklist-heading"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-[#66776F]" /><h3 id="completed-checklist-heading" className="font-bold text-[#4E5E57]">완료된 항목</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#718078]">{completedItems.length}개</span></div><div className="divide-y divide-[#DDE3DF]">{completedItems.map((item) => checklistItem(item, false))}</div></section>}

        <section className="mt-6" aria-labelledby="scheduled-heading">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Clock3 className="size-5 text-[#356859]" /><h3 id="scheduled-heading" className="font-bold text-[#263A33]">시간이 정해진 계획</h3></div><Button variant="ghost" size="sm" onClick={openAgent} className="text-[#285A4D]"><Sparkles />AI로 계획</Button></div>
          {loading ? <LoadingCards /> : plans.length || schedules.length ? <div className="grid gap-3">{schedules.map((schedule) => <article key={`schedule-${schedule.id}`} className={`grid grid-cols-[auto_4.3rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-4 transition sm:grid-cols-[auto_5rem_minmax(0,1fr)_auto] ${schedule.completed ? "border-[#D8DEDA] bg-[#F7F8F6]" : "border-[#F0D8CB] bg-[#FFF8F3]"}`}><Checkbox checked={schedule.completed} onCheckedChange={() => void toggleSchedule(schedule)} aria-label={schedule.completed ? `${schedule.title} 완료 취소` : `${schedule.title} 완료`} className="size-5 rounded-full border-[#B47A60] data-[state=checked]:bg-[#8B5D48]" /><div className="tabular-nums"><p className="font-bold text-[#764B39]">{formatTime(schedule.start_datetime)}</p><p className="text-sm text-[#9A7464]">{formatTime(schedule.end_datetime)}</p></div><div className="min-w-0 border-l-2 border-[#E4BDAA] pl-4"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="bg-[#F8E7DE] text-[#95573C]"><CalendarClock className="size-3" />고정 일정</Badge>{schedule.completed && <Badge variant="outline">완료</Badge>}</div><h3 className={`truncate text-base font-semibold sm:text-lg ${schedule.completed ? "text-[#89928E] line-through" : "text-[#5D4034]"}`} title={schedule.title}>{schedule.title}</h3></div><p className="col-start-3 text-sm text-[#8B6B5D] sm:col-auto">{duration(schedule.start_datetime, schedule.end_datetime)}분</p></article>)}{plans.map((plan) => <PlanRow key={plan.id} plan={plan} onToggle={(item) => void togglePlan(item)} />)}</div> : <div className="rounded-2xl border border-dashed bg-white p-6 text-center"><p className="text-sm text-[#74807A]">오늘 배정된 시간 계획이 없습니다.</p><Button variant="link" onClick={openAgent} className="mt-1 text-[#285A4D]">플래너에게 계획 요청하기</Button></div>}
        </section>
      </div>

      <aside className="grid content-start gap-5">
        <section className="rounded-[1.4rem] border bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[#356859]"><CheckCircle2 className="size-5" /><p className="font-semibold">진행 중인 목표</p></div><div className="mt-5 grid gap-4">{activeTasks.slice(0, 4).map((task) => { const count = weekPlans.filter((plan) => plan.task_id === task.id && plan.status === "COMPLETED").length; return <div key={task.id}><div className="mb-2 flex justify-between text-sm"><span className="truncate font-medium text-[#31443D]">{task.title}</span><span className="ml-3 shrink-0 text-[#74807A]">{count} / {task.weekly_target_count}회</span></div><Progress value={Math.min(100, count / task.weekly_target_count * 100)} className="bg-[#E5ECE8] [&_[data-slot=progress-indicator]]:bg-[#356859]" /></div>})}{!activeTasks.length && <p className="text-sm leading-6 text-[#74807A]">진행 중인 할 일이 없습니다.</p>}</div></section>
      </aside>
    </div>
  </section>
}
