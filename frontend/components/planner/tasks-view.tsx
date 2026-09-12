"use client"

import { CalendarClock, CalendarPlus, Check, Circle, Clock3, ListTodo, Pencil, Plus, Trash2 } from "lucide-react"
import type { Task, TodayItem } from "@/lib/types"
import { dateKey, priorityLabel, priorityStyle } from "@/components/planner/helpers"
import { TaskDialog } from "@/components/planner/task-dialog"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function TasksView({ loading, tasks, todayItems, refresh, toggleTask, removeTask, addTaskToToday }: {
  loading: boolean
  tasks: Task[]
  todayItems: TodayItem[]
  refresh: () => Promise<void>
  toggleTask: (task: Task) => Promise<void>
  removeTask: (id: number) => Promise<void>
  addTaskToToday: (task: Task) => Promise<void>
}) {
  const today = dateKey(new Date())
  return <section aria-labelledby="tasks-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-[#356859]">SOMEDAY</p><h2 id="tasks-heading" className="text-2xl font-bold tracking-tight md:text-3xl">필요할 때 꺼내 쓰는 할 일</h2><p className="mt-2 text-sm text-[#74807A]">정기적이지 않지만 잊지 말아야 할 일을 저장해 두세요.</p></div>
      <TaskDialog trigger={<Button className="h-11 rounded-xl bg-[#183D35]"><Plus />할 일 추가</Button>} onSaved={refresh} />
    </div>
    {loading ? <LoadingCards /> : tasks.length ? <div className="grid gap-4 lg:grid-cols-2">{tasks.map((task) => {
      const isToday = todayItems.some((item) => item.task_id === task.id)
      const dueDays = task.due_date ? Math.round((Date.parse(`${task.due_date}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86400000) : null
      const dueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 14
      const overdue = dueDays !== null && dueDays < 0
      const deadlineLabel = overdue ? "마감 지남" : dueDays === 0 ? "오늘 마감" : dueSoon ? `D-${dueDays}` : null
      return <article key={task.id} className={`rounded-[1.35rem] border bg-white p-5 shadow-[0_8px_28px_rgba(39,59,50,0.045)] ${overdue ? "border-[#D98F80] bg-[#FFF8F6]" : dueSoon ? "border-[#E1B765] bg-[#FFFBF2]" : ""} ${task.status === "COMPLETED" ? "opacity-65" : ""}`}>
        <div className="flex items-start gap-3">
          <button onClick={() => void toggleTask(task)} aria-label={`${task.title} ${task.status === "COMPLETED" ? "다시 열기" : "완료"}`} className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border transition ${task.status === "COMPLETED" ? "border-[#356859] bg-[#356859] text-white" : "border-[#CDD6D1] text-[#72807A] hover:border-[#356859] hover:bg-[#EDF4F0]"}`}>{task.status === "COMPLETED" ? <Check className="size-5" /> : <Circle className="size-5" />}</button>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-lg font-bold text-[#263A33] ${task.status === "COMPLETED" ? "line-through" : ""}`}>{task.title}</h3><Badge className={priorityStyle[task.priority]}>{priorityLabel[task.priority]}</Badge></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#74807A]">{task.description || "필요한 날 오늘 목록으로 가져오세요."}</p></div>
          <div className="flex shrink-0"><TaskDialog task={task} trigger={<Button variant="ghost" size="icon" aria-label="수정"><Pencil /></Button>} onSaved={refresh} /><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="삭제" className="text-[#A45145]"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{task.title}’을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>연결된 계획이 있으면 안전을 위해 삭제가 거절됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeTask(task.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#74807A]"><span><Clock3 className="mr-1 inline size-4" />약 {task.estimated_minutes}분</span><span>{task.category}</span>{task.due_date && <span>마감 {task.due_date}</span>}{deadlineLabel && <Badge className={overdue ? "bg-[#A94E3E] text-white" : "bg-[#F3D48D] text-[#704F14]"}><CalendarClock className="size-3.5" />{deadlineLabel}</Badge>}</div>
          <Button type="button" variant={isToday ? "secondary" : "outline"} disabled={isToday || task.status === "COMPLETED"} onClick={() => void addTaskToToday(task)} className="rounded-xl">{isToday ? <><Check />오늘에 추가됨</> : <><CalendarPlus />오늘에 추가</>}</Button>
        </div>
      </article>
    })}</div> : <Empty className="min-h-80 border bg-white"><EmptyHeader><EmptyMedia variant="icon"><ListTodo /></EmptyMedia><EmptyTitle>나중에 할 일을 저장해 보세요</EmptyTitle><EmptyDescription>냉장고 청소처럼 언젠가 해야 하지만 날짜가 정해지지 않은 일에 적합합니다.</EmptyDescription></EmptyHeader><EmptyContent><TaskDialog trigger={<Button className="bg-[#183D35]"><Plus />할 일 추가</Button>} onSaved={refresh} /></EmptyContent></Empty>}
  </section>
}
