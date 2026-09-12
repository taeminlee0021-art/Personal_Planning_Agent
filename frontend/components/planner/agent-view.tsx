"use client"

import { FormEvent } from "react"
import { AlertCircle, MessageCircleMore, Send, Sparkles } from "lucide-react"
import type { ActionSelection, AgentResponse, PendingAction } from "@/lib/types"
import { ReviewCard } from "@/components/planner/shared"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"

export function AgentView({ loading, message, setMessage, sending, agentError, latestResponse, actions, deciding, sendMessage, decide }: { loading: boolean; message: string; setMessage: (value: string) => void; sending: boolean; agentError: string; latestResponse: AgentResponse | null; actions: PendingAction[]; deciding: boolean; sendMessage: (event: FormEvent) => Promise<void>; decide: (id: number, decision: "approve" | "reject", selection?: ActionSelection) => Promise<void> }) {
  return <section aria-labelledby="agent-heading" className="mx-auto max-w-4xl"><div className="mb-6"><p className="mb-1 text-sm font-semibold text-[#356859]">PLANNING AGENT</p><h2 id="agent-heading" className="text-2xl font-bold tracking-tight md:text-3xl">말로 계획하고, 확인한 뒤 적용하세요</h2><p className="mt-2 text-[0.9375rem] leading-6 text-[#74807A]">플래너는 저장된 할 일·고정 일정·선호 시간을 읽습니다. 일정 변경은 아래에서 승인하기 전까지 적용되지 않습니다.</p></div>
    <div className="grid gap-5"><div className="rounded-[1.35rem] border bg-white p-4 shadow-[0_8px_28px_rgba(39,59,50,0.045)] sm:p-6"><div className="mb-4 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#DDE9E3] text-[#285A4D]"><Sparkles /></div><div><p className="font-bold text-[#263A33]">PlanningAgent</p><p className="text-sm text-[#74807A]">읽기 전용 도구로 확인하고 계획을 제안합니다</p></div></div><form onSubmit={sendMessage}><Textarea maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-28 resize-y rounded-xl bg-[#FBFCFA] p-4 text-base" placeholder="예: 이번 주에 운동 3번과 AI Agent 공부 4시간을 현실적으로 배치해 줘." /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#87908C]">전송하면 OpenAI API 호출이 발생합니다.</p><Button disabled={sending || !message.trim()} type="submit" className="h-11 rounded-xl bg-[#183D35]"><Send />{sending ? "계획 중…" : "제안 받기"}</Button></div></form></div>
      {agentError && <div role="alert" className="rounded-2xl border border-[#E7C9C0] bg-[#FFF5F1] p-4 text-[#824733] sm:p-5"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="size-5" />플래너 요청 오류</div><p className="mt-2 break-words text-sm leading-6">{agentError}</p></div>}
      {latestResponse && !latestResponse.action_id && <div className="rounded-2xl border bg-white p-5"><p className="font-semibold text-[#263A33]">플래너 답변</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#5F6D67]">{latestResponse.explanation}</p></div>}
      {actions.length ? <div className="grid gap-4">{actions.map((action) => <ReviewCard key={action.id} action={action} busy={deciding} onDecision={decide} />)}</div> : !loading && <Empty className="min-h-64 border bg-white"><EmptyHeader><EmptyMedia variant="icon"><MessageCircleMore /></EmptyMedia><EmptyTitle>승인을 기다리는 제안이 없습니다</EmptyTitle><EmptyDescription>계획 요청을 보내면 정확한 생성·이동·삭제 내용을 여기에서 검토할 수 있습니다.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  </section>
}
