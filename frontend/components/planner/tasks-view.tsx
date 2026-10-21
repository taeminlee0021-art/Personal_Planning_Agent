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

export function TasksView({ loading, tasks, todayItems, onTaskSaved, toggleTask, removeTask, addTaskToToday }: {
  loading: boolean
  tasks: Task[]
  todayItems: TodayItem[]
  onTaskSaved: (saved: Task) => void
  toggleTask: (task: Task) => Promise<void>
  removeTask: (id: number) => Promise<void>
  addTaskToToday: (task: Task) => Promise<void>
}) {
  const today = dateKey(new Date())
  return <section aria-labelledby="tasks-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-[#E85D8E]">SOMEDAY</p><h2 id="tasks-heading" className="font-display text-xl text-[#2B3561] md:text-2xl">필요할 때 꺼내 쓰는 할 일</h2><p className="mt-2 text-sm text-[#8A8FA8]">정기적이지 않지만 잊지 말아야 할 일을 저장해 두세요.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 text-xs font-medium text-[#5A6185]" aria-label="우선순위 색 안내"><span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#E85D8E]" />높음</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#F7C6D3]" />보통</span><span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#C9B8E8]" />낮음</span></div>
        <TaskDialog trigger={<Button className="h-11 rounded-full bg-[#F48FB1] px-5 text-[#2B3561] hover:bg-[#F27AA5]"><Plus />할 일</Button>} onSaved={onTaskSaved} />
      </div>
    </div>
    {loading ? <LoadingCards /> : tasks.length ? <div className="grid gap-4 lg:grid-cols-2">{tasks.map((task) => {
      const isToday = todayItems.some((item) => item.task_id === task.id)
      const dueDays = task.due_date ? Math.round((Date.parse(`${task.due_date}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86400000) : null
      const dueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 14
      const overdue = dueDays !== null && dueDays < 0
      const deadlineLabel = overdue ? "마감 지남" : dueDays === 0 ? "오늘 마감" : dueSoon ? `D-${dueDays}` : null
      return <article key={task.id} className={`rounded-[1.35rem] border bg-white p-5 shadow-[0_8px_28px_rgba(39,59,50,0.045)] ${overdue ? "border-[#F3A1B8] bg-[#FFF1F4]" : dueSoon ? "border-[#F2C94C] bg-[#FFFBEA]" : ""} ${task.status === "COMPLETED" ? "opacity-65" : ""}`}>
        <div className="flex items-start gap-3">
          <button onClick={() => void toggleTask(task)} aria-label={`${task.title} ${task.status === "COMPLETED" ? "다시 열기" : "완료"}`} className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border transition ${task.status === "COMPLETED" ? "border-[#E85D8E] bg-[#E85D8E] text-white" : "border-[#E3DCEA] text-[#8A8FA8] hover:border-[#E85D8E] hover:bg-[#FCE4EE]"}`}>{task.status === "COMPLETED" ? <Check className="size-5" /> : <Circle className="size-5" />}</button>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-lg font-bold text-[#2F3660] ${task.status === "COMPLETED" ? "line-through" : ""}`}>{task.title}</h3><Badge className={priorityStyle[task.priority]}>{priorityLabel[task.priority]}</Badge></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-[#8A8FA8]">{task.description || "필요한 날 오늘 목록으로 가져오세요."}</p></div>
          <div className="flex shrink-0"><TaskDialog task={task} trigger={<Button variant="ghost" size="icon" aria-label="수정"><Pencil /></Button>} onSaved={onTaskSaved} /><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label="삭제" className="text-[#D9456B]"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{task.title}’을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>연결된 계획이 있으면 안전을 위해 삭제가 거절됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeTask(task.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#8A8FA8]"><span><Clock3 className="mr-1 inline size-4" />약 {task.estimated_minutes}분</span><span>{task.category}</span>{task.start_date && <span>시작 {task.start_date}</span>}{task.due_date && <span>마감 {task.due_date}</span>}{deadlineLabel && <Badge className={overdue ? "bg-[#D9456B] text-white" : "bg-[#FFE88A] text-[#6B5410]"}><CalendarClock className="size-3.5" />{deadlineLabel}</Badge>}</div>
          <Button type="button" variant={isToday ? "secondary" : "outline"} disabled={isToday || task.status === "COMPLETED" || Boolean(task.start_date && today < task.start_date)} onClick={() => void addTaskToToday(task)} className="rounded-xl">{isToday ? <><Check />오늘에 추가됨</> : task.start_date && today < task.start_date ? <>시작일 전</> : <><CalendarPlus />오늘에 추가</>}</Button>
        </div>
      </article>
    })}</div> : <Empty className="min-h-80 border bg-white"><EmptyHeader><EmptyMedia variant="icon"><ListTodo /></EmptyMedia><EmptyTitle>나중에 할 일을 저장해 보세요</EmptyTitle><EmptyDescription>냉장고 청소처럼 언젠가 해야 하지만 날짜가 정해지지 않은 일에 적합합니다.</EmptyDescription></EmptyHeader><EmptyContent><TaskDialog trigger={<Button className="bg-[#2B3561]"><Plus />할 일 추가</Button>} onSaved={onTaskSaved} /></EmptyContent></Empty>}
  </section>
}
