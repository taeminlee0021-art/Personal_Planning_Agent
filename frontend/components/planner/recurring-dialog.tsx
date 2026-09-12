"use client"

import { FormEvent, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { RecurringTask, RecurringTaskDraft } from "@/lib/types"
import { dateKey } from "@/components/planner/helpers"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"]
const emptyRecurring = (): RecurringTaskDraft => ({ title: "", cadence: "DAILY", weekdays: [], start_date: dateKey(new Date()), active: true })

export function RecurringDialog({ item, trigger, onSaved }: { item?: RecurringTask; trigger: React.ReactNode; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<RecurringTaskDraft>(emptyRecurring)

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setDraft(item ? { title: item.title, cadence: item.cadence, weekdays: item.weekdays, start_date: item.start_date, active: item.active } : emptyRecurring())
    setOpen(nextOpen)
  }

  function toggleWeekday(day: number) {
    setDraft((current) => ({ ...current, weekdays: current.weekdays.includes(day) ? current.weekdays.filter((value) => value !== day) : [...current.weekdays, day].sort() }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (draft.cadence === "WEEKLY" && draft.weekdays.length === 0) {
      toast.error("매주 반복할 요일을 하나 이상 선택해 주세요.")
      return
    }
    setSaving(true)
    try {
      const payload = { ...draft, title: draft.title.trim(), weekdays: draft.cadence === "DAILY" ? [] : draft.weekdays }
      if (item) await api.updateRecurringTask(item.id, payload)
      else await api.createRecurringTask(payload)
      await onSaved()
      setOpen(false)
      toast.success(item ? "반복 작업을 수정했습니다." : "반복 작업을 추가했습니다.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "반복 작업을 저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="rounded-2xl sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{item ? "반복 작업 수정" : "반복 작업 추가"}</DialogTitle>
        <DialogDescription>해당 날짜의 오늘 목록에 자동으로 나타날 일을 설정합니다.</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} className="grid gap-5">
        <label className="grid gap-1.5 text-sm font-medium">할 일<Input autoFocus required maxLength={120} placeholder="예: 물 2L 마시기" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="grid gap-1.5 text-sm font-medium">시작일<Input required type="date" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} /></label>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">반복 주기</legend>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={draft.cadence === "DAILY" ? "default" : "outline"} className={draft.cadence === "DAILY" ? "bg-[#183D35]" : ""} onClick={() => setDraft({ ...draft, cadence: "DAILY", weekdays: [] })}>매일</Button>
            <Button type="button" variant={draft.cadence === "WEEKLY" ? "default" : "outline"} className={draft.cadence === "WEEKLY" ? "bg-[#183D35]" : ""} onClick={() => setDraft({ ...draft, cadence: "WEEKLY" })}>매주</Button>
          </div>
        </fieldset>
        {draft.cadence === "WEEKLY" && <fieldset>
          <legend className="mb-2 text-sm font-medium">요일 선택</legend>
          <div className="grid grid-cols-7 gap-1.5">{weekdayLabels.map((label, day) => <button key={label} type="button" aria-pressed={draft.weekdays.includes(day)} onClick={() => toggleWeekday(day)} className={`aspect-square min-h-10 rounded-xl border text-sm font-semibold transition ${draft.weekdays.includes(day) ? "border-[#356859] bg-[#DDE9E3] text-[#183D35]" : "bg-white text-[#707A75] hover:bg-[#F3F5F1]"}`}>{label}</button>)}</div>
        </fieldset>}
        <label className="flex items-center justify-between rounded-xl border bg-[#F8F9F6] px-4 py-3 text-sm font-medium"><span>반복 사용</span><Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /></label>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button><Button disabled={saving} type="submit" className="bg-[#183D35] hover:bg-[#28564A]">{saving && <Loader2 className="animate-spin" />}저장</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
