"use client"

import { FormEvent, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Priority, Task, TaskDraft } from "@/lib/types"
import { emptyTask } from "@/components/planner/helpers"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export function TaskDialog({ task, trigger, onSaved }: { task?: Task; trigger: React.ReactNode; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(emptyTask)

  useEffect(() => {
    if (open) setDraft(task ? {
      title: task.title, description: task.description, estimated_minutes: task.estimated_minutes,
      priority: task.priority, due_date: task.due_date, category: task.category, weekly_target_count: task.weekly_target_count,
    } : emptyTask)
  }, [open, task])

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      if (task) await api.updateTask(task.id, draft)
      else await api.createTask(draft)
      await onSaved(); setOpen(false)
      toast.success(task ? "할 일을 수정했습니다." : "할 일을 추가했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "저장하지 못했습니다.") }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="max-h-[90svh] overflow-y-auto rounded-2xl sm:max-w-xl">
      <DialogHeader><DialogTitle>{task ? "할 일 수정" : "새 할 일"}</DialogTitle><DialogDescription>계획에 필요한 핵심 정보만 입력하세요. 날짜가 없으면 이번 주 안에서 배치합니다.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">제목<Input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 운동하기" /></label>
        <label className="grid gap-1.5 text-sm font-medium">설명<Textarea maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="필요한 내용을 간단히 적어 주세요." /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">예상 시간(분)<Input required type="number" min={1} max={120} value={draft.estimated_minutes} onChange={(e) => setDraft({ ...draft, estimated_minutes: Number(e.target.value) })} /></label>
          <label className="grid gap-1.5 text-sm font-medium">주간 횟수<Input required type="number" min={1} max={7} value={draft.weekly_target_count} onChange={(e) => setDraft({ ...draft, weekly_target_count: Number(e.target.value) })} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">우선순위<Select value={draft.priority} onValueChange={(value) => setDraft({ ...draft, priority: value as Priority })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="LOW">낮음</SelectItem><SelectItem value="MEDIUM">보통</SelectItem><SelectItem value="HIGH">높음</SelectItem></SelectContent></Select></label>
          <label className="grid gap-1.5 text-sm font-medium">마감일<Input type="date" value={draft.due_date || ""} onChange={(e) => setDraft({ ...draft, due_date: e.target.value || null })} /></label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">카테고리<Input maxLength={120} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="personal" /></label>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button><Button disabled={saving} type="submit" className="bg-[#183D35] hover:bg-[#28564A]">{saving && <Loader2 className="animate-spin" />}{task ? "변경 저장" : "할 일 추가"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
