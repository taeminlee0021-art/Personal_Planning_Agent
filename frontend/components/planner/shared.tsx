"use client"

import { Check, Sparkles, X } from "lucide-react"
import type { PendingAction, Plan } from "@/lib/types"
import { duration, formatDate, formatTime } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function LoadingCards() {
  return <div className="grid gap-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
}

export function PlanRow({ plan }: { plan: Plan }) {
  return <article className="grid grid-cols-[4.3rem_1fr] gap-3 rounded-2xl border bg-white p-4 shadow-[0_8px_28px_rgba(39,59,50,0.045)] sm:grid-cols-[5rem_1fr_auto] sm:items-center">
    <div className="tabular-nums"><p className="font-bold text-[#273B34]">{formatTime(plan.start_datetime)}</p><p className="text-sm text-[#8A928E]">{formatTime(plan.end_datetime)}</p></div>
    <div className="min-w-0 border-l-2 border-[#BCD2C7] pl-4"><div className="mb-1 flex items-center gap-2"><Badge variant="secondary" className="bg-[#E7F0EB] text-[#356859]">{plan.source === "AGENT" ? "AI 계획" : "직접 계획"}</Badge>{plan.status === "COMPLETED" && <Badge variant="outline">완료</Badge>}</div><h3 className="truncate text-base font-semibold text-[#20332C] sm:text-lg">{plan.title}</h3></div>
    <p className="col-start-2 text-sm text-[#74807A] sm:col-auto">{duration(plan.start_datetime, plan.end_datetime)}분</p>
  </article>
}

export function ReviewCard({ action, busy, onDecision }: { action: PendingAction; busy: boolean; onDecision: (id: number, decision: "approve" | "reject") => Promise<void> }) {
  const proposal = action.proposal
  return <article className="rounded-2xl border border-[#C9D8D0] bg-[#F5F9F6] p-4 sm:p-5">
    <div className="flex items-center gap-2 text-[#285A4D]"><Sparkles className="size-4" /><p className="text-sm font-semibold">적용 대기 중인 제안</p></div>
    <p className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-7 text-[#33463F]">{proposal.explanation}</p>
    <div className="mt-4 grid gap-2">
      {proposal.blocks.map((block, index) => <div key={`${block.task_id}-${block.start_datetime}-${index}`} className="rounded-xl bg-white p-3 text-sm"><p className="font-semibold text-[#263A33]">새 계획 · {block.title}</p><p className="mt-1 text-[#72807A]">{formatDate(block.start_datetime, { month: "long", day: "numeric", weekday: "short" })} {formatTime(block.start_datetime)}–{formatTime(block.end_datetime)}</p></div>)}
      {proposal.changes.map((change) => <div key={change.plan_id} className="rounded-xl bg-white p-3 text-sm"><p className="font-semibold text-[#263A33]">{change.operation === "MOVE" ? "일정 이동" : "일정 삭제"} · {change.before.title}</p><p className="mt-1 text-[#72807A]">{formatDate(change.before.start_datetime, { month: "short", day: "numeric", weekday: "short" })} {formatTime(change.before.start_datetime)} {change.after ? `→ ${formatDate(change.after.start_datetime, { month: "short", day: "numeric", weekday: "short" })} ${formatTime(change.after.start_datetime)}` : "→ 삭제"}</p></div>)}
      {proposal.blocks.length === 0 && proposal.changes.length === 0 && <p className="text-sm text-[#72807A]">적용할 일정 변경은 없습니다.</p>}
    </div>
    {proposal.unallocated.length > 0 && <p className="mt-3 rounded-xl bg-[#FFF5E7] px-3 py-2 text-sm text-[#845D2E]">빈 시간 부족으로 {proposal.unallocated.reduce((sum, item) => sum + item.remaining_count, 0)}회는 배치하지 못했습니다.</p>}
    <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button disabled={busy} onClick={() => onDecision(action.id, "approve")} className="h-11 flex-1 bg-[#183D35] hover:bg-[#28564A]"><Check />모두 적용</Button><Button disabled={busy} onClick={() => onDecision(action.id, "reject")} variant="outline" className="h-11 flex-1"><X />거절</Button></div>
  </article>
}
