"use client"

import { FormEvent, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { FixedSchedule, ScheduleDraft } from "@/lib/types"
import { emptySchedule, toAware, toDatetimeLocal } from "@/components/planner/helpers"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function ScheduleDialog({ schedule, trigger, onSaved }: { schedule?: FixedSchedule; trigger: React.ReactNode; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<ScheduleDraft>(emptySchedule)
  useEffect(() => {
    if (open) setDraft(schedule ? { title: schedule.title, description: schedule.description, start_datetime: toDatetimeLocal(schedule.start_datetime), end_datetime: toDatetimeLocal(schedule.end_datetime), fixed: true } : emptySchedule)
  }, [open, schedule])
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      const payload = { ...draft, start_datetime: toAware(draft.start_datetime), end_datetime: toAware(draft.end_datetime) }
      if (schedule) await api.updateSchedule(schedule.id, payload)
      else await api.createSchedule(payload)
      await onSaved(); setOpen(false); toast.success(schedule ? "고정 일정을 수정했습니다." : "고정 일정을 추가했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "저장하지 못했습니다.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="rounded-2xl sm:max-w-xl"><DialogHeader><DialogTitle>{schedule ? "고정 일정 수정" : "고정 일정 추가"}</DialogTitle><DialogDescription>플래너가 이동하거나 겹쳐 배치하면 안 되는 시간을 등록합니다.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">제목<Input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">시작<Input required type="datetime-local" value={draft.start_datetime} onChange={(e) => setDraft({ ...draft, start_datetime: e.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">종료<Input required type="datetime-local" value={draft.end_datetime} onChange={(e) => setDraft({ ...draft, end_datetime: e.target.value })} /></label></div>
        <label className="grid gap-1.5 text-sm font-medium">설명<Textarea value={draft.description} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button><Button disabled={saving} type="submit" className="bg-[#183D35] hover:bg-[#28564A]">{saving && <Loader2 className="animate-spin" />}저장</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
