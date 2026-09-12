"use client"

import { useState } from "react"
import { CalendarPlus, Check, Sparkles, X } from "lucide-react"
import type { ActionSelection, PendingAction, Plan } from "@/lib/types"
import { duration, formatDate, formatTime } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"

export function LoadingCards() {
  return <div className="grid gap-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
}

export function PlanRow({ plan, onToggle }: { plan: Plan; onToggle?: (plan: Plan) => void }) {
  const completed = plan.status === "COMPLETED"
  return <article className={`grid grid-cols-[auto_4.3rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-white p-4 shadow-[0_8px_28px_rgba(39,59,50,0.045)] transition ${completed ? "border-[#D8DEDA] bg-[#F7F8F6]" : ""} sm:grid-cols-[auto_5rem_minmax(0,1fr)_auto]`}>
    {onToggle && <Checkbox checked={completed} onCheckedChange={() => onToggle(plan)} aria-label={completed ? `${plan.title} 완료 취소` : `${plan.title} 완료`} className="size-5 rounded-full border-[#6F9586] data-[state=checked]:bg-[#356859]" />}
    <div className="tabular-nums"><p className="font-bold text-[#273B34]">{formatTime(plan.start_datetime)}</p><p className="text-sm text-[#8A928E]">{formatTime(plan.end_datetime)}</p></div>
    <div className="min-w-0 border-l-2 border-[#BCD2C7] pl-4"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="bg-[#E7F0EB] text-[#356859]">{plan.source === "AGENT" ? "AI 계획" : "직접 계획"}</Badge>{completed && <Badge variant="outline">완료</Badge>}</div><h3 className={`truncate text-base font-semibold sm:text-lg ${completed ? "text-[#89928E] line-through" : "text-[#20332C]"}`} title={plan.title}>{plan.title}</h3></div>
    <p className="col-start-3 text-sm text-[#74807A] sm:col-auto">{duration(plan.start_datetime, plan.end_datetime)}분</p>
  </article>
}

export function ReviewCard({ action, busy, onDecision }: { action: PendingAction; busy: boolean; onDecision: (id: number, decision: "approve" | "reject", selection?: ActionSelection) => Promise<void> }) {
  const proposal = action.proposal
  const [blocks, setBlocks] = useState(() => proposal.blocks.map((_, index) => index))
  const [changes, setChanges] = useState(() => proposal.changes.map((_, index) => index))
  const [schedules, setSchedules] = useState(() => proposal.schedules.map((_, index) => index))
  const selectedCount = blocks.length + changes.length + schedules.length
  function toggle(values: number[], setValues: (value: number[]) => void, index: number, checked: boolean) {
    setValues(checked ? [...values, index].sort((a, b) => a - b) : values.filter((value) => value !== index))
  }
  const selection = { block_indexes: blocks, change_indexes: changes, schedule_indexes: schedules }
  return <article className="rounded-2xl border border-[#C9D8D0] bg-[#F5F9F6] p-4 sm:p-5">
    <div className="flex items-center gap-2 text-[#285A4D]"><Sparkles className="size-4" /><p className="text-sm font-semibold">적용 대기 중인 제안</p></div>
    <p className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-7 text-[#33463F]">{proposal.explanation}</p>
    <div className="mt-4 grid gap-2">
      {proposal.schedules.map((schedule, index) => <label key={`schedule-${schedule.start_datetime}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-sm"><Checkbox checked={schedules.includes(index)} onCheckedChange={(checked) => toggle(schedules, setSchedules, index, checked === true)} aria-label={`${schedule.title} 선택`} className="mt-0.5" /><span><span className="flex items-center gap-1.5 font-semibold text-[#263A33]"><CalendarPlus className="size-4 text-[#A76548]" />새 고정 일정 · {schedule.title}</span><span className="mt-1 block text-[#72807A]">{formatDate(schedule.start_datetime, { month: "long", day: "numeric", weekday: "short" })} {formatTime(schedule.start_datetime)}–{formatTime(schedule.end_datetime)}</span></span></label>)}
      {proposal.blocks.map((block, index) => <label key={`${block.task_id}-${block.start_datetime}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-sm"><Checkbox checked={blocks.includes(index)} onCheckedChange={(checked) => toggle(blocks, setBlocks, index, checked === true)} aria-label={`${block.title} 선택`} className="mt-0.5" /><span><span className="font-semibold text-[#263A33]">새 계획 · {block.title}</span><span className="mt-1 block text-[#72807A]">{formatDate(block.start_datetime, { month: "long", day: "numeric", weekday: "short" })} {formatTime(block.start_datetime)}–{formatTime(block.end_datetime)}</span></span></label>)}
      {proposal.changes.map((change, index) => <label key={change.plan_id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 text-sm"><Checkbox checked={changes.includes(index)} onCheckedChange={(checked) => toggle(changes, setChanges, index, checked === true)} aria-label={`${change.before.title} 변경 선택`} className="mt-0.5" /><span><span className="font-semibold text-[#263A33]">{change.operation === "MOVE" ? "일정 이동" : "일정 삭제"} · {change.before.title}</span><span className="mt-1 block text-[#72807A]">{formatDate(change.before.start_datetime, { month: "short", day: "numeric", weekday: "short" })} {formatTime(change.before.start_datetime)} {change.after ? `→ ${formatDate(change.after.start_datetime, { month: "short", day: "numeric", weekday: "short" })} ${formatTime(change.after.start_datetime)}` : "→ 삭제"}</span></span></label>)}
      {proposal.blocks.length === 0 && proposal.changes.length === 0 && proposal.schedules.length === 0 && <p className="text-sm text-[#72807A]">적용할 일정 변경은 없습니다.</p>}
    </div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button disabled={busy || selectedCount === 0} onClick={() => onDecision(action.id, "approve", selection)} className="h-11 flex-1 bg-[#183D35] hover:bg-[#28564A]"><Check />선택 적용 ({selectedCount})</Button><Button disabled={busy} onClick={() => onDecision(action.id, "reject")} variant="outline" className="h-11 flex-1"><X />전체 거절</Button></div>
  </article>
}
