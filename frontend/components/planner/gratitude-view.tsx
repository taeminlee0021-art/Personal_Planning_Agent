"use client"

import { FormEvent, useState } from "react"
import { Check, ChevronLeft, ChevronRight, HeartHandshake, Pencil, Save, Trash2, X } from "lucide-react"
import type { GratitudeDraft, GratitudeEntry } from "@/lib/types"
import { dateKey, formatDate } from "@/components/planner/helpers"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const PAGE_SIZE = 10

export function GratitudeView({ loading, entries, addEntry, editEntry, removeEntry }: {
  loading: boolean
  entries: GratitudeEntry[]
  addEntry: (value: GratitudeDraft) => Promise<void>
  editEntry: (id: number, value: GratitudeDraft) => Promise<void>
  removeEntry: (id: number) => Promise<void>
}) {
  const today = dateKey(new Date())
  const [entryDate, setEntryDate] = useState(today)
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState("")
  const [requestedPage, setPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  // Deleting the last item of the final page shrinks pageCount; clamp instead of effect-driven state.
  const page = Math.min(requestedPage, pageCount)
  const pageItems = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const todayCount = entries.filter((entry) => entry.entry_date === today).length
  const daysWithEntries = new Set(entries.map((entry) => entry.entry_date)).size

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = content.trim()
    if (!value) return
    setSaving(true)
    try { await addEntry({ entry_date: entryDate, content: value }); setContent(""); setPage(1) } finally { setSaving(false) }
  }

  async function saveEdit(entry: GratitudeEntry) {
    const value = editContent.trim()
    if (!value) return
    setSaving(true)
    try { await editEntry(entry.id, { entry_date: entry.entry_date, content: value }); setEditingId(null) } finally { setSaving(false) }
  }

  return <section aria-labelledby="gratitude-heading">
    <div className="mb-6"><p className="mb-1 text-sm font-semibold text-[#E85D8E]">GRATITUDE</p><h2 id="gratitude-heading" className="font-display text-xl text-[#2B3561] md:text-2xl">오늘 감사한 일을 남겨요</h2><p className="mt-2 text-sm text-[#8A8FA8]">짧아도 괜찮습니다. 하루에 여러 개를 적어도 됩니다.</p></div>

    <div className="grid gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
      <form onSubmit={submit} className="h-fit rounded-[1.35rem] border border-[#F0D3E0] bg-white p-5 shadow-[0_8px_24px_rgba(34,64,53,0.08)] sm:p-6">
        <h3 className="flex items-center gap-2 font-bold text-[#2F3660]"><HeartHandshake className="size-5 text-[#E85D8E]" />감사일기 쓰기</h3>
        <label className="mt-5 grid gap-1.5 text-sm font-medium">날짜<Input required type="date" max={today} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-11" /></label>
        <label className="mt-4 grid gap-1.5 text-sm font-medium">감사한 일<Textarea required maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="예: 비 오는 날 우산을 빌려준 동료에게 감사하다." className="min-h-32 resize-y rounded-xl bg-[#FBF9FC] p-4 text-base" /></label>
        <div className="mt-2 flex justify-end text-xs text-[#A3A7BC]">{content.length} / 2000</div>
        <Button type="submit" disabled={saving || !content.trim()} className="mt-3 h-11 w-full bg-[#2B3561] hover:bg-[#3A4578]"><Save />{saving ? "저장 중" : "저장"}</Button>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#EFE9F4] pt-4 text-center"><div><p className="text-xl font-bold text-[#5A6185]">{todayCount}</p><p className="text-xs text-[#8A8FA8]">오늘</p></div><div><p className="text-xl font-bold text-[#5A6185]">{daysWithEntries}</p><p className="text-xs text-[#8A8FA8]">기록한 날</p></div><div><p className="text-xl font-bold text-[#5A6185]">{entries.length}</p><p className="text-xs text-[#8A8FA8]">전체</p></div></div>
      </form>

      <section className="min-w-0 rounded-[1.35rem] border bg-white" aria-label="감사일기 목록">
        <div className="flex items-center justify-between gap-3 border-b border-[#EFE9F4] px-4 py-3 sm:px-5"><h3 className="font-bold text-[#2F3660]">감사일기 목록</h3><p className="text-sm text-[#8A8FA8]">{entries.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, entries.length)} / ${entries.length}개` : "0개"}</p></div>
        {loading ? <div className="p-4"><LoadingCards /></div> : entries.length === 0 ? <div className="px-4 py-12 text-center"><p className="font-medium text-[#5A6185]">아직 적은 감사일기가 없습니다</p><p className="mt-1 text-sm text-[#A3A7BC]">왼쪽에서 오늘의 첫 감사를 남겨 보세요.</p></div> : <>
          <div className="hidden grid-cols-[7.5rem_minmax(0,1fr)_5.5rem] border-b border-[#F3EFF7] bg-[#FBF9FC] px-4 py-2 text-xs font-semibold text-[#8A8FA8] sm:grid sm:px-5"><span>날짜</span><span>내용</span><span className="text-right">관리</span></div>
          <ul className="divide-y divide-[#F3EFF7]">{pageItems.map((entry) => <li key={entry.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_5.5rem] sm:px-5">
            <div className="pt-0.5 text-sm font-semibold tabular-nums text-[#5A6185]"><span className="sm:hidden">{formatDate(`${entry.entry_date}T12:00:00+09:00`, { month: "2-digit", day: "2-digit" })}</span><span className="hidden sm:inline">{formatDate(`${entry.entry_date}T12:00:00+09:00`, { year: "2-digit", month: "2-digit", day: "2-digit", weekday: "short" })}</span></div>
            {editingId === entry.id ? <div className="col-span-2 sm:col-span-1"><Textarea autoFocus maxLength={2000} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-24 resize-y rounded-xl bg-[#FBF9FC] p-3 text-base" /><div className="mt-2 flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}><X />취소</Button><Button type="button" size="sm" disabled={saving || !editContent.trim()} onClick={() => void saveEdit(entry)} className="bg-[#2B3561]"><Check />저장</Button></div></div>
              : <p className="min-w-0 whitespace-pre-wrap break-words leading-6 text-[#2F3660]">{entry.content}</p>}
            {editingId !== entry.id && <div className="col-span-2 flex justify-end gap-0.5 sm:col-span-1"><Button type="button" size="icon" variant="ghost" aria-label="감사일기 수정" onClick={() => { setEditingId(entry.id); setEditContent(entry.content) }} className="size-8 text-[#5A6185]"><Pencil className="size-4" /></Button><AlertDialog><AlertDialogTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="감사일기 삭제" className="size-8 text-[#C06A84]"><Trash2 className="size-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 감사일기를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>삭제하면 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeEntry(entry.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
          </li>)}</ul>
          {pageCount > 1 && <nav aria-label="감사일기 페이지" className="flex items-center justify-between border-t border-[#EFE9F4] px-4 py-3 sm:px-5"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-9"><ChevronLeft />이전</Button><span className="text-sm font-medium text-[#5A6185]">{page} / {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="h-9">다음<ChevronRight /></Button></nav>}
        </>}
      </section>
    </div>
  </section>
}
