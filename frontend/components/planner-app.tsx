"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ListTodo, MessageCircleMore, RotateCcw, Sparkles, SunMedium } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { AgentResponse, FixedSchedule, PendingAction, Plan, Preferences, Task } from "@/lib/types"
import { defaultPreferences, emptyTask, formatDate, type View } from "@/components/planner/helpers"
import { TodayView } from "@/components/planner/today-view"
import { TasksView } from "@/components/planner/tasks-view"
import { WeekView } from "@/components/planner/week-view"
import { AgentView } from "@/components/planner/agent-view"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Toaster } from "@/components/ui/sonner"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar"

const navigation: { id: View; label: string; icon: typeof SunMedium }[] = [
  { id: "today", label: "오늘", icon: SunMedium },
  { id: "tasks", label: "할 일", icon: ListTodo },
  { id: "week", label: "주간 계획", icon: CalendarDays },
  { id: "agent", label: "플래너", icon: MessageCircleMore },
]

export function PlannerApp() {
  const [view, setView] = useState<View>("today")
  const [tasks, setTasks] = useState<Task[]>([])
  const [todayPlans, setTodayPlans] = useState<Plan[]>([])
  const [weekPlans, setWeekPlans] = useState<Plan[]>([])
  const [schedules, setSchedules] = useState<FixedSchedule[]>([])
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [actions, setActions] = useState<PendingAction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextToday, nextWeek, nextSchedules, nextPreferences, nextActions] = await Promise.all([
        api.tasks(), api.plansToday(), api.plansWeek(), api.schedules(), api.preferences(), api.pendingActions(),
      ])
      setTasks(nextTasks); setTodayPlans(nextToday); setWeekPlans(nextWeek)
      setSchedules(nextSchedules); setPreferences(nextPreferences); setActions(nextActions); setLoadError("")
    } catch (error) { setLoadError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    type ModelContext = { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> }
    const context = (document as Document & { modelContext?: ModelContext }).modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()
    const register = async () => {
      await context.registerTool({
        name: "list_planning_tasks", title: "할 일 목록 보기", description: "현재 개인 플래너의 할 일 목록과 상태를 읽습니다.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async () => ({ tasks: await api.tasks() }),
      }, { signal: lifecycle.signal })
      await context.registerTool({
        name: "create_planning_task", title: "할 일 추가", description: "사용자가 명시한 할 일을 개인 플래너에 추가하고 화면을 갱신합니다.",
        inputSchema: { type: "object", properties: { title: { type: "string" }, estimated_minutes: { type: "integer", minimum: 1, maximum: 120 }, weekly_target_count: { type: "integer", minimum: 1, maximum: 7 }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } }, required: ["title", "estimated_minutes"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const value = input as Partial<typeof emptyTask>
          if (!value.title?.trim() || !Number.isInteger(value.estimated_minutes)) throw new Error("제목과 올바른 예상 시간이 필요합니다.")
          const created = await api.createTask({ ...emptyTask, title: value.title.trim(), estimated_minutes: value.estimated_minutes!, weekly_target_count: value.weekly_target_count ?? 1, priority: value.priority ?? "MEDIUM" })
          await refresh(); setView("tasks"); return { id: created.id, status: created.status }
        },
      }, { signal: lifecycle.signal })
    }
    void register().catch(() => {})
    return () => lifecycle.abort()
  }, [refresh])

  const completedBlocks = useMemo(() => weekPlans.filter((plan) => plan.status === "COMPLETED").length, [weekPlans])

  async function toggleTask(task: Task) {
    try { await api.updateTask(task.id, { status: task.status === "COMPLETED" ? "TODO" : "COMPLETED" }); await refresh(); toast.success(task.status === "COMPLETED" ? "할 일을 다시 열었습니다." : "할 일을 완료했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.") }
  }
  async function removeTask(id: number) {
    try { await api.deleteTask(id); await refresh(); toast.success("할 일을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function removeSchedule(id: number) {
    try { await api.deleteSchedule(id); await refresh(); toast.success("고정 일정을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function savePreferences(event: FormEvent) {
    event.preventDefault()
    try { const { timezone: _timezone, ...payload } = preferences; await api.updatePreferences(payload); await refresh(); toast.success("계획 가능 시간을 저장했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "선호 설정을 저장하지 못했습니다.") }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (!message.trim()) return; setSending(true)
    try { const response = await api.sendAgentMessage(message.trim()); setLatestResponse(response); setMessage(""); await refresh(); toast.success(response.action_id ? "검토할 계획 제안이 도착했습니다." : "플래너가 요청을 검토했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "플래너 요청에 실패했습니다.") }
    finally { setSending(false) }
  }
  async function decide(id: number, decision: "approve" | "reject") {
    setDeciding(true)
    try { if (decision === "approve") await api.approveAction(id); else await api.rejectAction(id); await refresh(); setLatestResponse(null); toast.success(decision === "approve" ? "제안을 적용했습니다." : "제안을 거절했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "결정을 처리하지 못했습니다.") }
    finally { setDeciding(false) }
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label
  const dateTitle = formatDate(new Date().toISOString(), { month: "long", day: "numeric", weekday: "long" })

  return <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
    <Sidebar collapsible="none" className="border-r border-[#D9DED8] bg-[#F3F5F1]">
      <SidebarHeader className="px-5 pb-7 pt-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#183D35] text-white shadow-sm"><Sparkles className="size-5" /></div><div><p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#6A746F]">Personal</p><p className="text-lg font-bold tracking-tight text-[#183D35]">오늘의 흐름</p></div></div></SidebarHeader>
      <SidebarContent><SidebarGroup className="px-3"><SidebarGroupContent><SidebarMenu className="gap-2">{navigation.map(({ id, label, icon: Icon }) => <SidebarMenuItem key={id}><SidebarMenuButton onClick={() => setView(id)} isActive={view === id} className="h-11 rounded-xl px-3 text-[0.9375rem] data-[active=true]:bg-[#DDE9E3] data-[active=true]:font-semibold data-[active=true]:text-[#183D35]"><Icon className="size-5" /><span>{label}</span>{id === "agent" && actions.length > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#D17B52] text-xs text-white">{actions.length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="p-5"><div className="rounded-2xl border border-[#D4DDD7] bg-white/70 p-4"><p className="text-sm font-semibold text-[#31453E]">이번 주 완료</p><div className="mt-3 flex items-center justify-between text-sm text-[#68746E]"><span>{completedBlocks} / {weekPlans.length}개</span><span>{weekPlans.length ? Math.round(completedBlocks / weekPlans.length * 100) : 0}%</span></div><Progress value={weekPlans.length ? completedBlocks / weekPlans.length * 100 : 0} className="mt-2 bg-[#DDE6E0] [&_[data-slot=progress-indicator]]:bg-[#356859]" /></div></SidebarFooter>
    </Sidebar>

    <SidebarInset className="min-h-svh min-w-0 bg-[#F8F9F6] pb-24 md:pb-0">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[#E1E5E0] bg-white/85 px-5 py-3 backdrop-blur md:px-9"><div><p className="text-sm font-medium text-[#78817D]">{dateTitle}</p><h1 className="text-xl font-bold tracking-tight text-[#1D2E29] md:text-2xl">{currentLabel}</h1></div><Button onClick={() => setView("agent")} className="h-10 rounded-xl bg-[#183D35] px-4 hover:bg-[#28564A]"><Sparkles className="size-4" /><span className="hidden sm:inline">플래너에게 요청</span><span className="sm:hidden">AI 계획</span></Button></header>
      {loadError && <div role="alert" className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#E7C9C0] bg-[#FFF5F1] px-4 py-3 text-sm text-[#8A4634] md:mx-9"><span>{loadError}</span><Button variant="ghost" size="sm" onClick={() => { setLoading(true); void refresh() }}><RotateCcw />다시 시도</Button></div>}
      <div className="mx-auto w-full max-w-7xl p-5 md:p-9">
        {view === "today" && <TodayView loading={loading} plans={todayPlans} weekPlans={weekPlans} tasks={tasks} preferences={preferences} openAgent={() => setView("agent")} />}
        {view === "tasks" && <TasksView loading={loading} tasks={tasks} plans={weekPlans} refresh={refresh} toggleTask={toggleTask} removeTask={removeTask} />}
        {view === "week" && <WeekView loading={loading} plans={weekPlans} schedules={schedules} preferences={preferences} setPreferences={setPreferences} refresh={refresh} removeSchedule={removeSchedule} savePreferences={savePreferences} />}
        {view === "agent" && <AgentView loading={loading} message={message} setMessage={setMessage} sending={sending} latestResponse={latestResponse} actions={actions} deciding={deciding} sendMessage={sendMessage} decide={decide} />}
      </div>
    </SidebarInset>

    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#DDE2DD] bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium ${view === id ? "bg-[#E7F0EB] text-[#183D35]" : "text-[#707A75]"}`}><Icon className="size-5" /><span>{label}</span>{id === "agent" && actions.length > 0 && <span className="absolute right-[22%] top-1 size-2 rounded-full bg-[#D17B52]" />}</button>)}</nav>
    <Toaster position="top-center" richColors />
  </SidebarProvider>
}
