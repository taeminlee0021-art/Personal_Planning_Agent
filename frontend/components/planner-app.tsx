"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, ListTodo, MessageCircleMore, RotateCcw, Scale, Settings2, Sparkles, SunMedium } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { ActionSelection, AgentResponse, BodySettings, FixedSchedule, PendingAction, Plan, Preferences, RecurringTask, Task, TodayItem, WeightRecord } from "@/lib/types"
import { dateKey, defaultPreferences, emptyTask, formatDate, weekDays, type View } from "@/components/planner/helpers"
import { TodayView } from "@/components/planner/today-view"
import { TasksView } from "@/components/planner/tasks-view"
import { WeekView } from "@/components/planner/week-view"
import { AgentView } from "@/components/planner/agent-view"
import { SettingsView } from "@/components/planner/settings-view"
import { WeightView } from "@/components/planner/weight-view"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Toaster } from "@/components/ui/sonner"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar"

const navigation: { id: View; label: string; icon: typeof SunMedium }[] = [
  { id: "today", label: "오늘", icon: SunMedium },
  { id: "tasks", label: "할 일", icon: ListTodo },
  { id: "week", label: "주간 계획", icon: CalendarDays },
  { id: "weight", label: "몸무게", icon: Scale },
  { id: "agent", label: "플래너", icon: MessageCircleMore },
  { id: "settings", label: "설정", icon: Settings2 },
]

export function PlannerApp() {
  const [view, setView] = useState<View>("today")
  const [tasks, setTasks] = useState<Task[]>([])
  const [todayPlans, setTodayPlans] = useState<Plan[]>([])
  const [weekPlans, setWeekPlans] = useState<Plan[]>([])
  const [schedules, setSchedules] = useState<FixedSchedule[]>([])
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [actions, setActions] = useState<PendingAction[]>([])
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([])
  const [todayItems, setTodayItems] = useState<TodayItem[]>([])
  const [weekTodayItems, setWeekTodayItems] = useState<TodayItem[]>([])
  const [bodySettings, setBodySettings] = useState<BodySettings>({ height_cm: 176 })
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [agentError, setAgentError] = useState("")
  const [deciding, setDeciding] = useState(false)
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextToday, nextWeek, nextSchedules, nextPreferences, nextActions, nextRecurring, nextTodayItems, nextWeekTodayItems, nextBodySettings, nextWeights] = await Promise.all([
        api.tasks(), api.plansToday(), api.plansWeek(), api.schedules(), api.preferences(), api.pendingActions(), api.recurringTasks(), api.todayItems(), api.weekTodayItems(), api.bodySettings(), api.weightRecords(),
      ])
      setTasks(nextTasks); setTodayPlans(nextToday); setWeekPlans(nextWeek)
      setSchedules(nextSchedules); setPreferences(nextPreferences); setActions(nextActions)
      setRecurringTasks(nextRecurring); setTodayItems(nextTodayItems); setWeekTodayItems(nextWeekTodayItems); setLoadError("")
      setBodySettings(nextBodySettings); setWeightRecords(nextWeights)
    } catch (error) { setLoadError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

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

  const weeklyProgress = useMemo(() => {
    const unmatchedChecklist = weekTodayItems.filter((item) => item.source !== "RECURRING" && !weekPlans.some((plan) =>
      dateKey(plan.start_datetime) === item.item_date && (item.task_id !== null ? plan.task_id === item.task_id : plan.title === item.title)
    ))
    const days = weekDays()
    const recurringTarget = recurringTasks.filter((item) => item.active).reduce((count, item) =>
      count + days.filter((day, index) => day >= item.start_date && (item.cadence === "DAILY" || item.weekdays.includes(index))).length, 0)
    const weeklySchedules = schedules.filter((item) => days.includes(dateKey(item.start_datetime)))
    return {
      target: weekPlans.length + weeklySchedules.length + unmatchedChecklist.length + recurringTarget,
      completed: weekPlans.filter((plan) => plan.status === "COMPLETED").length
        + weeklySchedules.filter((item) => item.completed).length
        + unmatchedChecklist.filter((item) => item.status === "COMPLETED").length
        + weekTodayItems.filter((item) => item.source === "RECURRING" && item.status === "COMPLETED").length,
    }
  }, [recurringTasks, schedules, weekPlans, weekTodayItems])

  async function toggleTask(task: Task) {
    try { await api.updateTask(task.id, { status: task.status === "COMPLETED" ? "TODO" : "COMPLETED" }); await refresh(); toast.success(task.status === "COMPLETED" ? "할 일을 다시 열었습니다." : "할 일을 완료했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.") }
  }
  async function addTaskToToday(task: Task) {
    try { await api.createTodayItemFromTask(task.id); await refresh(); toast.success("오늘 할 일에 추가했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "오늘에 추가하지 못했습니다.") }
  }
  async function removeTask(id: number) {
    try { await api.deleteTask(id); await refresh(); toast.success("할 일을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function removeSchedule(id: number) {
    try { await api.deleteSchedule(id); await refresh(); toast.success("고정 일정을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function toggleSchedule(schedule: FixedSchedule) {
    try {
      await api.updateScheduleStatus(schedule.id, !schedule.completed)
      await refresh()
      toast.success(schedule.completed ? "고정 일정을 다시 열었습니다." : "고정 일정을 완료했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "일정 상태를 바꾸지 못했습니다.") }
  }
  async function addTodayItem(title: string) {
    try { await api.createTodayItem(title); await refresh(); toast.success("오늘 할 일에 추가했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "추가하지 못했습니다."); throw error }
  }
  async function toggleTodayItem(item: TodayItem) {
    try { await api.updateTodayItem(item.id, item.status === "COMPLETED" ? "TODO" : "COMPLETED"); await refresh() }
    catch (error) { toast.error(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.") }
  }
  async function togglePlan(plan: Plan) {
    try {
      await api.updatePlanStatus(plan.id, plan.status === "COMPLETED" ? "PLANNED" : "COMPLETED")
      await refresh()
      toast.success(plan.status === "COMPLETED" ? "시간 계획을 다시 열었습니다." : "시간 계획을 완료했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "계획 상태를 바꾸지 못했습니다.") }
  }
  async function removeTodayItem(id: number) {
    try { await api.deleteTodayItem(id); await refresh(); toast.success("오늘 할 일을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function reorderTodayItems(orderedIds: number[]) {
    const positions = new Map(orderedIds.map((id, index) => [id, index]))
    setTodayItems((current) => [...current].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)))
    try { setTodayItems(await api.reorderTodayItems(orderedIds)) }
    catch (error) { await refresh(); toast.error(error instanceof Error ? error.message : "순서를 저장하지 못했습니다.") }
  }
  async function saveWeight(weight: number, measuredOn: string) {
    try { await api.saveWeightRecord(weight, measuredOn); await refresh(); toast.success("몸무게를 기록했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "몸무게를 저장하지 못했습니다."); throw error }
  }
  async function saveHeight(height: number) {
    try { await api.updateBodySettings(height); await refresh(); toast.success("키를 저장했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "키를 저장하지 못했습니다."); throw error }
  }
  async function toggleRecurringTask(item: RecurringTask) {
    try { await api.updateRecurringTask(item.id, { title: item.title, cadence: item.cadence, weekdays: item.weekdays, start_date: item.start_date, active: !item.active }); await refresh(); toast.success(item.active ? "반복을 잠시 껐습니다." : "반복을 다시 켰습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "반복 설정을 바꾸지 못했습니다.") }
  }
  async function removeRecurringTask(id: number) {
    try { await api.deleteRecurringTask(id); await refresh(); toast.success("반복 작업을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function savePreferences(event: FormEvent) {
    event.preventDefault()
    try {
      const payload = {
        weekday_available_from: preferences.weekday_available_from,
        weekday_available_until: preferences.weekday_available_until,
        weekend_available_from: preferences.weekend_available_from,
        weekend_available_until: preferences.weekend_available_until,
        max_daily_planning_minutes: preferences.max_daily_planning_minutes,
      }
      await api.updatePreferences(payload); await refresh(); toast.success("계획 가능 시간을 저장했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "선호 설정을 저장하지 못했습니다.") }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (!message.trim()) return; setSending(true); setAgentError("")
    try { const response = await api.sendAgentMessage(message.trim()); setLatestResponse(response); setMessage(""); await refresh(); toast.success(response.action_id ? "검토할 계획 제안이 도착했습니다." : "플래너가 요청을 검토했습니다.") }
    catch (error) { const detail = error instanceof Error ? error.message : "플래너 요청에 실패했습니다."; setAgentError(detail); toast.error(detail) }
    finally { setSending(false) }
  }
  async function decide(id: number, decision: "approve" | "reject", selection?: ActionSelection) {
    setDeciding(true)
    try { if (decision === "approve") await api.approveAction(id, selection); else await api.rejectAction(id); await refresh(); setLatestResponse(null); toast.success(decision === "approve" ? "선택한 제안을 적용했습니다." : "제안을 거절했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "결정을 처리하지 못했습니다.") }
    finally { setDeciding(false) }
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label
  const dateTitle = formatDate(new Date().toISOString(), { month: "long", day: "numeric", weekday: "long" })

  return <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
    <Sidebar collapsible="none" className="hidden border-r border-[#D9DED8] bg-[#F3F5F1] md:flex">
      <SidebarHeader className="px-5 pb-7 pt-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#183D35] text-white shadow-sm"><Sparkles className="size-5" /></div><div><p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#6A746F]">Personal</p><p className="text-lg font-bold tracking-tight text-[#183D35]">오늘의 흐름</p></div></div></SidebarHeader>
      <SidebarContent><SidebarGroup className="px-3"><SidebarGroupContent><SidebarMenu className="gap-2">{navigation.map(({ id, label, icon: Icon }) => <SidebarMenuItem key={id}><SidebarMenuButton onClick={() => setView(id)} isActive={view === id} className="h-11 rounded-xl px-3 text-[0.9375rem] data-[active=true]:bg-[#DDE9E3] data-[active=true]:font-semibold data-[active=true]:text-[#183D35]"><Icon className="size-5" /><span>{label}</span>{id === "agent" && actions.length > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#D17B52] text-xs text-white">{actions.length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="p-5"><div className="rounded-2xl border border-[#D4DDD7] bg-white/70 p-4"><p className="text-sm font-semibold text-[#31453E]">이번 주 완료</p><div className="mt-3 flex items-center justify-between text-sm text-[#68746E]"><span>{weeklyProgress.completed} / {weeklyProgress.target}개</span><span>{weeklyProgress.target ? Math.round(weeklyProgress.completed / weeklyProgress.target * 100) : 0}%</span></div><Progress value={weeklyProgress.target ? weeklyProgress.completed / weeklyProgress.target * 100 : 0} className="mt-2 bg-[#DDE6E0] [&_[data-slot=progress-indicator]]:bg-[#356859]" /></div></SidebarFooter>
    </Sidebar>

    <SidebarInset className="min-h-svh min-w-0 bg-[#F8F9F6] pb-24 md:pb-0">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[#E1E5E0] bg-white/85 px-5 py-3 backdrop-blur md:px-9"><div><p className="text-sm font-medium text-[#78817D]">{dateTitle}</p><h1 className="text-xl font-bold tracking-tight text-[#1D2E29] md:text-2xl">{currentLabel}</h1></div><Button onClick={() => setView("agent")} className="h-10 rounded-xl bg-[#183D35] px-4 hover:bg-[#28564A]"><Sparkles className="size-4" /><span className="hidden sm:inline">플래너에게 요청</span><span className="sm:hidden">AI 계획</span></Button></header>
      {loadError && <div role="alert" className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#E7C9C0] bg-[#FFF5F1] px-4 py-3 text-sm text-[#8A4634] md:mx-9"><span>{loadError}</span><Button variant="ghost" size="sm" onClick={() => { setLoading(true); void refresh() }}><RotateCcw />다시 시도</Button></div>}
      <div className="mx-auto w-full max-w-7xl p-5 md:p-9">
        {view === "today" && <TodayView loading={loading} items={todayItems} plans={todayPlans} schedules={schedules.filter((item) => dateKey(item.start_datetime) === dateKey(new Date()))} weekPlans={weekPlans} tasks={tasks} openAgent={() => setView("agent")} openWeight={() => setView("weight")} addItem={addTodayItem} toggleItem={toggleTodayItem} togglePlan={togglePlan} toggleSchedule={toggleSchedule} removeItem={removeTodayItem} reorderItems={reorderTodayItems} />}
        {view === "tasks" && <TasksView loading={loading} tasks={tasks} todayItems={todayItems} refresh={refresh} toggleTask={toggleTask} removeTask={removeTask} addTaskToToday={addTaskToToday} />}
        {view === "week" && <WeekView loading={loading} plans={weekPlans} schedules={schedules} recurringTasks={recurringTasks} weekTodayItems={weekTodayItems} refresh={refresh} removeSchedule={removeSchedule} />}
        {view === "weight" && <WeightView key={bodySettings.height_cm} loading={loading} settings={bodySettings} records={weightRecords} saveWeight={saveWeight} saveHeight={saveHeight} />}
        {view === "agent" && <AgentView loading={loading} message={message} setMessage={setMessage} sending={sending} agentError={agentError} latestResponse={latestResponse} actions={actions} deciding={deciding} sendMessage={sendMessage} decide={decide} />}
        {view === "settings" && <SettingsView loading={loading} recurringTasks={recurringTasks} preferences={preferences} setPreferences={setPreferences} refresh={refresh} toggleRecurringTask={toggleRecurringTask} removeRecurringTask={removeRecurringTask} savePreferences={savePreferences} />}
      </div>
    </SidebarInset>

    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-[#DDE2DD] bg-white/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[0.68rem] font-medium ${view === id ? "bg-[#E7F0EB] text-[#183D35]" : "text-[#707A75]"}`}><Icon className="size-5" /><span className="truncate">{label}</span>{id === "agent" && actions.length > 0 && <span className="absolute right-[18%] top-1 size-2 rounded-full bg-[#D17B52]" />}</button>)}</nav>
    <Toaster position="top-center" richColors />
  </SidebarProvider>
}
