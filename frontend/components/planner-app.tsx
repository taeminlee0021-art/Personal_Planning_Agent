"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, HeartHandshake, ListTodo, LoaderCircle, MessageCircleMore, RotateCcw, Scale, Settings2, Sparkles, SunMedium } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { ActionSelection, AgentResponse, BodySettings, DietReview, FixedSchedule, FoodNutrition, MealDraft, MealEntry, PendingAction, Photo, Plan, Preferences, RecurringTask, Task, TodayItem, WeightRecord, WorkoutSession, WorkoutSessionDraft, WorkoutSettings, WorkoutWeek, GratitudeDraft, GratitudeEntry } from "@/lib/types"
import { dateKey, defaultPreferences, emptyTask, formatDate, weekDays, type View } from "@/components/planner/helpers"
import { TodayView } from "@/components/planner/today-view"
import { TasksView } from "@/components/planner/tasks-view"
import { WeekView } from "@/components/planner/week-view"
import { AgentView } from "@/components/planner/agent-view"
import { SettingsView } from "@/components/planner/settings-view"
import { WeightView, type HealthTab } from "@/components/planner/weight-view"
import { GratitudeView } from "@/components/planner/gratitude-view"
import { PhotoSettings } from "@/components/planner/photo-settings"
import { Polaroid } from "@/components/planner/polaroid"
import { DdayCard } from "@/components/planner/dday-card"
import { fileToDataUrl } from "@/components/planner/photo-utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Toaster } from "@/components/ui/sonner"

const navigation: { id: View; label: string; short?: string; tagline: string; icon: typeof SunMedium }[] = [
  { id: "today", label: "오늘", tagline: "오늘 하루를 한눈에", icon: SunMedium },
  { id: "tasks", label: "할 일", tagline: "필요할 때 꺼내 쓰는 일", icon: ListTodo },
  { id: "week", label: "주간 계획", short: "주간", tagline: "한눈에 보는 이번 주", icon: CalendarDays },
  { id: "weight", label: "건강", tagline: "운동 · 식단 · 몸무게", icon: Scale },
  { id: "gratitude", label: "감사일기", short: "감사", tagline: "오늘 감사한 일", icon: HeartHandshake },
  { id: "agent", label: "플래너", tagline: "말로 계획하고 확인 후 적용", icon: MessageCircleMore },
  { id: "settings", label: "설정", tagline: "내 생활에 맞게", icon: Settings2 },
]

type RefreshPart = "tasks" | "todayPlans" | "weekPlans" | "schedules" | "preferences" | "actions" | "recurring" | "todayItems" | "weekTodayItems" | "bodySettings" | "weights" | "meals" | "foods" | "dietReview" | "workoutWeek" | "workoutSettings" | "gratitude" | "photos"
const allParts: RefreshPart[] = ["tasks", "todayPlans", "weekPlans", "schedules", "preferences", "actions", "recurring", "todayItems", "weekTodayItems", "bodySettings", "weights", "meals", "foods", "dietReview", "workoutWeek", "workoutSettings", "gratitude", "photos"]

function upsertById<T extends { id: number }>(current: T[], saved: T): T[] {
  return current.some((item) => item.id === saved.id)
    ? current.map((item) => item.id === saved.id ? saved : item)
    : [...current, saved]
}

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
  const [bodySettings, setBodySettings] = useState<BodySettings>({ height_cm: 176, daily_protein_target_g: 160, daily_calorie_target_kcal: 1800 })
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([])
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([])
  const [foodNutrition, setFoodNutrition] = useState<FoodNutrition[]>([])
  const [dietReview, setDietReview] = useState<DietReview | null>(null)
  const [workoutWeek, setWorkoutWeek] = useState<WorkoutWeek | null>(null)
  const [workoutSettings, setWorkoutSettings] = useState<WorkoutSettings>({ weekdays: [0, 2, 4, 6], strength_minutes: 30, cardio_minutes: 30 })
  const [healthTab, setHealthTab] = useState<HealthTab>("workout")
  const [gratitudeEntries, setGratitudeEntries] = useState<GratitudeEntry[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [serverState, setServerState] = useState<"checking" | "ready" | "failed">("checking")
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [agentError, setAgentError] = useState("")
  const [deciding, setDeciding] = useState(false)
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null)

  const refresh = useCallback(async (parts: readonly RefreshPart[] = allParts) => {
    try {
      await Promise.all([
        parts.includes("tasks") && api.tasks().then(setTasks),
        parts.includes("todayPlans") && api.plansToday().then(setTodayPlans),
        parts.includes("weekPlans") && api.plansWeek().then(setWeekPlans),
        parts.includes("schedules") && api.schedules().then(setSchedules),
        parts.includes("preferences") && api.preferences().then(setPreferences),
        parts.includes("actions") && api.pendingActions().then(setActions),
        parts.includes("recurring") && api.recurringTasks().then(setRecurringTasks),
        parts.includes("todayItems") && api.todayItems().then(setTodayItems),
        parts.includes("weekTodayItems") && api.weekTodayItems().then(setWeekTodayItems),
        parts.includes("bodySettings") && api.bodySettings().then(setBodySettings),
        parts.includes("weights") && api.weightRecords().then(setWeightRecords),
        parts.includes("meals") && api.mealEntries().then(setMealEntries),
        parts.includes("foods") && api.foodNutrition().then(setFoodNutrition),
        parts.includes("dietReview") && api.currentDietReview().then(setDietReview),
        parts.includes("workoutWeek") && api.workoutWeek().then(setWorkoutWeek),
        parts.includes("workoutSettings") && api.workoutSettings().then(setWorkoutSettings),
        parts.includes("gratitude") && api.gratitudeEntries().then(setGratitudeEntries),
        parts.includes("photos") && api.photos().then(setPhotos),
      ])
      setLoadError("")
    } catch (error) { setLoadError(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.") }
    finally { setLoading(false) }
  }, [])

  const onTaskSaved = useCallback((saved: Task) => setTasks((current) => upsertById(current, saved)), [])
  const onScheduleSaved = useCallback((saved: FixedSchedule) => setSchedules((current) =>
    upsertById(current, saved).sort((left, right) => left.start_datetime.localeCompare(right.start_datetime))), [])
  const onRecurringSaved = useCallback((saved: RecurringTask) => {
    setRecurringTasks((current) => upsertById(current, saved))
    void refresh(["todayItems", "weekTodayItems"])
  }, [refresh])
  const onTodayItemSaved = useCallback((saved: TodayItem) => {
    setTodayItems((current) => upsertById(current, saved).sort((left, right) => left.order_index - right.order_index))
    setWeekTodayItems((current) => upsertById(current, saved).sort((left, right) =>
      left.item_date.localeCompare(right.item_date) || left.order_index - right.order_index))
  }, [])

  const waitForBackend = useCallback(async () => {
    setServerState("checking")
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 12_000)
      try {
        const result = await api.health(controller.signal)
        if (result.status === "ok") {
          setServerState("ready")
          return
        }
      } catch {
        // A sleeping Render instance can exceed one request's time limit.
      } finally {
        window.clearTimeout(timeout)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3_000))
    }
    setServerState("failed")
    throw new Error("서버를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
  }, [])

  const initialize = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      await waitForBackend()
      await refresh()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "서버를 준비하지 못했습니다.")
      setLoading(false)
    }
  }, [refresh, waitForBackend])

  useEffect(() => {
    const timer = window.setTimeout(() => void initialize(), 0)
    return () => window.clearTimeout(timer)
  }, [initialize])

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
          onTaskSaved(created); setView("tasks"); return { id: created.id, status: created.status }
        },
      }, { signal: lifecycle.signal })
    }
    void register().catch(() => {})
    return () => lifecycle.abort()
  }, [onTaskSaved])

  const weeklyProgress = useMemo(() => {
    const unmatchedChecklist = weekTodayItems.filter((item) => item.source !== "RECURRING" && !weekPlans.some((plan) =>
      dateKey(plan.start_datetime) === item.item_date && (item.task_id !== null ? plan.task_id === item.task_id : plan.title === item.title)
    ))
    const days = weekDays()
    const recurringTarget = recurringTasks.filter((item) => item.active).reduce((count, item) =>
      count + days.filter((day, index) => day >= item.start_date && (item.cadence === "DAILY" || item.weekdays.includes(index))).length, 0)
    const weeklySchedules = schedules.filter((item) => days.includes(dateKey(item.start_datetime)))
    const workouts = workoutWeek?.sessions ?? []
    return {
      target: weekPlans.length + weeklySchedules.length + unmatchedChecklist.length + recurringTarget + workouts.length,
      completed: weekPlans.filter((plan) => plan.status === "COMPLETED").length
        + weeklySchedules.filter((item) => item.completed).length
        + unmatchedChecklist.filter((item) => item.status === "COMPLETED").length
        + weekTodayItems.filter((item) => item.source === "RECURRING" && item.recurrence_id !== null && item.status === "COMPLETED").length
        + workouts.filter((item) => item.completed).length,
    }
  }, [recurringTasks, schedules, weekPlans, weekTodayItems, workoutWeek])

  async function toggleTask(task: Task) {
    try {
      const saved = await api.updateTask(task.id, { status: task.status === "COMPLETED" ? "TODO" : "COMPLETED" })
      onTaskSaved(saved)
      const syncLinkedItem = (item: TodayItem) => item.task_id === task.id && item.item_date === dateKey(new Date()) ? {
        ...item, status: saved.status === "COMPLETED" ? "COMPLETED" as const : "TODO" as const,
        completion_count: saved.status === "COMPLETED" ? item.completion_target : 0,
      } : item
      setTodayItems((current) => current.map(syncLinkedItem))
      setWeekTodayItems((current) => current.map(syncLinkedItem))
      toast.success(task.status === "COMPLETED" ? "할 일을 다시 열었습니다." : "할 일을 완료했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.") }
  }
  async function addTaskToToday(task: Task) {
    try { onTodayItemSaved(await api.createTodayItemFromTask(task.id)); toast.success("오늘 할 일에 추가했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "오늘에 추가하지 못했습니다.") }
  }
  async function removeTask(id: number) {
    try { await api.deleteTask(id); setTasks((current) => current.filter((task) => task.id !== id)); void refresh(["todayItems", "weekTodayItems"]); toast.success("할 일을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function removeSchedule(id: number) {
    try { await api.deleteSchedule(id); setSchedules((current) => current.filter((item) => item.id !== id)); toast.success("고정 일정을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function toggleSchedule(schedule: FixedSchedule) {
    try {
      onScheduleSaved(await api.updateScheduleStatus(schedule.id, !schedule.completed))
      toast.success(schedule.completed ? "고정 일정을 다시 열었습니다." : "고정 일정을 완료했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "일정 상태를 바꾸지 못했습니다.") }
  }
  async function addTodayItem(title: string) {
    try { onTodayItemSaved(await api.createTodayItem(title)); toast.success("오늘 할 일에 추가했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "추가하지 못했습니다."); throw error }
  }
  async function toggleTodayItem(item: TodayItem) {
    try {
      onTodayItemSaved(await api.updateTodayItem(item.id, item.status === "COMPLETED" ? "TODO" : "COMPLETED"))
      if (item.task_id !== null) void refresh(["tasks"])
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "상태를 바꾸지 못했습니다.") }
  }
  async function togglePlan(plan: Plan) {
    try {
      const saved = await api.updatePlanStatus(plan.id, plan.status === "COMPLETED" ? "PLANNED" : "COMPLETED")
      if (dateKey(saved.start_datetime) === dateKey(new Date())) {
        setTodayPlans((current) => upsertById(current, saved))
      }
      setWeekPlans((current) => upsertById(current, saved))
      void refresh(["tasks"])
      toast.success(plan.status === "COMPLETED" ? "시간 계획을 다시 열었습니다." : "시간 계획을 완료했습니다.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "계획 상태를 바꾸지 못했습니다.") }
  }
  async function removeTodayItem(id: number) {
    try { await api.deleteTodayItem(id); setTodayItems((current) => current.filter((item) => item.id !== id)); setWeekTodayItems((current) => current.filter((item) => item.id !== id)); toast.success("오늘 할 일을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function reorderTodayItems(orderedIds: number[]) {
    const positions = new Map(orderedIds.map((id, index) => [id, index]))
    setTodayItems((current) => [...current].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)))
    try {
      const reordered = await api.reorderTodayItems(orderedIds)
      setTodayItems(reordered)
      setWeekTodayItems((current) => current.map((item) => reordered.find((row) => row.id === item.id) ?? item))
    }
    catch (error) { await refresh(["todayItems", "weekTodayItems"]); toast.error(error instanceof Error ? error.message : "순서를 저장하지 못했습니다.") }
  }
  async function saveWeight(weight: number, measuredOn: string) {
    try {
      const saved = await api.saveWeightRecord(weight, measuredOn)
      setWeightRecords((current) => upsertById(current, saved).sort((left, right) => left.measured_on.localeCompare(right.measured_on)))
      void refresh(["todayItems", "weekTodayItems"])
      toast.success("몸무게를 기록했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "몸무게를 저장하지 못했습니다."); throw error }
  }
  async function saveHeight(height: number) {
    try { setBodySettings(await api.updateBodySettings({ ...bodySettings, height_cm: height })); toast.success("키를 저장했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "키를 저장하지 못했습니다."); throw error }
  }
  async function saveTargets(protein: number, calories: number) {
    try { setBodySettings(await api.updateBodySettings({ ...bodySettings, daily_protein_target_g: protein, daily_calorie_target_kcal: calories })); toast.success("하루 목표를 저장했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "목표를 저장하지 못했습니다."); throw error }
  }
  async function saveMeal(value: MealDraft) {
    try {
      const saved = await api.createMealEntry(value)
      setMealEntries((current) => upsertById(current, saved).sort((left, right) => left.eaten_on.localeCompare(right.eaten_on) || left.id - right.id))
      void refresh(["foods", "dietReview", "todayItems", "weekTodayItems"])
      toast.success("식단을 기록했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "식단을 저장하지 못했습니다."); throw error }
  }
  async function removeMeal(id: number) {
    try {
      await api.deleteMealEntry(id)
      setMealEntries((current) => current.filter((item) => item.id !== id))
      void refresh(["dietReview", "todayItems", "weekTodayItems"])
      toast.success("식단 기록을 삭제했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "식단을 삭제하지 못했습니다.") }
  }
  async function saveWorkout(id: number, value: WorkoutSessionDraft) {
    try { await api.updateWorkoutSession(id, value); await refresh(["workoutWeek"]) }
    catch (error) { toast.error(error instanceof Error ? error.message : "운동을 저장하지 못했습니다.") }
  }
  async function toggleWorkout(session: WorkoutSession) {
    await saveWorkout(session.id, { session_date: session.session_date, muscle_groups: session.muscle_groups, note: session.note, completed: !session.completed })
  }
  async function addWorkout(value: WorkoutSessionDraft) {
    try { await api.createWorkoutSession(value); await refresh(["workoutWeek"]); toast.success("운동을 추가했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "운동을 추가하지 못했습니다.") }
  }
  async function removeWorkout(id: number) {
    try { await api.deleteWorkoutSession(id); await refresh(["workoutWeek"]); toast.success("운동을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "운동을 삭제하지 못했습니다.") }
  }
  async function planWorkouts() {
    try { setWorkoutWeek(await api.planWorkoutWeek()); toast.success("이번 주 운동 부위를 짰습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "운동 부위를 짜지 못했습니다.") }
  }
  async function saveWorkoutSettings(value: WorkoutSettings) {
    try { setWorkoutSettings(await api.updateWorkoutSettings(value)); toast.success("기본 운동 요일을 저장했습니다. 다음 주부터 적용됩니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "운동 기본값을 저장하지 못했습니다.") }
  }
  function openHealth(tab: HealthTab) { setHealthTab(tab); setView("weight") }
  const sortGratitude = (entries: GratitudeEntry[]) => [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id)
  async function addGratitude(value: GratitudeDraft) {
    try { const saved = await api.createGratitudeEntry(value); setGratitudeEntries((current) => sortGratitude([...current, saved])); toast.success("감사일기를 저장했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "감사일기를 저장하지 못했습니다."); throw error }
  }
  async function editGratitude(id: number, value: GratitudeDraft) {
    try { const saved = await api.updateGratitudeEntry(id, value); setGratitudeEntries((current) => sortGratitude(upsertById(current, saved))); toast.success("감사일기를 수정했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "감사일기를 수정하지 못했습니다."); throw error }
  }
  async function removeGratitude(id: number) {
    try { await api.deleteGratitudeEntry(id); setGratitudeEntries((current) => current.filter((item) => item.id !== id)); toast.success("감사일기를 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function addPhoto(file: File) {
    try {
      const saved = await api.createPhoto({ caption: "", image_data: await fileToDataUrl(file) })
      setPhotos((current) => [...current, saved]); toast.success("사진을 올렸습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "사진을 올리지 못했습니다."); throw error }
  }
  async function updatePhotoCaption(id: number, caption: string) {
    try { const saved = await api.updatePhoto(id, caption); setPhotos((current) => upsertById(current, saved)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "캡션을 저장하지 못했습니다."); throw error }
  }
  async function movePhoto(id: number, direction: -1 | 1) {
    const ids = photos.map((photo) => photo.id)
    const from = ids.indexOf(id); const to = from + direction
    if (from < 0 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    try { setPhotos(await api.reorderPhotos(ids)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "순서를 저장하지 못했습니다.") }
  }
  async function removePhoto(id: number) {
    try { await api.deletePhoto(id); setPhotos((current) => current.filter((photo) => photo.id !== id)); toast.success("사진을 삭제했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.") }
  }
  async function analyzeDiet() {
    try { setDietReview(await api.analyzeDiet()); void refresh(["todayItems", "weekTodayItems"]); toast.success("이번 주 식단 평가를 완료했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "식단을 평가하지 못했습니다."); throw error }
  }
  async function toggleRecurringTask(item: RecurringTask) {
    try { onRecurringSaved(await api.updateRecurringTask(item.id, { title: item.title, cadence: item.cadence, weekdays: item.weekdays, start_date: item.start_date, active: !item.active })); toast.success(item.active ? "반복을 잠시 껐습니다." : "반복을 다시 켰습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "반복 설정을 바꾸지 못했습니다.") }
  }
  async function removeRecurringTask(id: number) {
    try { await api.deleteRecurringTask(id); setRecurringTasks((current) => current.filter((item) => item.id !== id)); void refresh(["todayItems", "weekTodayItems"]); toast.success("반복 작업을 삭제했습니다.") }
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
      setPreferences(await api.updatePreferences(payload)); toast.success("계획 가능 시간을 저장했습니다.")
    }
    catch (error) { toast.error(error instanceof Error ? error.message : "선호 설정을 저장하지 못했습니다.") }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (!message.trim()) return; setSending(true); setAgentError("")
    try { const response = await api.sendAgentMessage(message.trim()); setLatestResponse(response); setMessage(""); await refresh(["actions"]); toast.success(response.action_id ? "검토할 계획 제안이 도착했습니다." : "플래너가 요청을 검토했습니다.") }
    catch (error) { const detail = error instanceof Error ? error.message : "플래너 요청에 실패했습니다."; setAgentError(detail); toast.error(detail) }
    finally { setSending(false) }
  }
  async function decide(id: number, decision: "approve" | "reject", selection?: ActionSelection) {
    setDeciding(true)
    try { if (decision === "approve") await api.approveAction(id, selection); else await api.rejectAction(id); await refresh(decision === "approve" ? ["actions", "tasks", "todayPlans", "weekPlans"] : ["actions"]); setLatestResponse(null); toast.success(decision === "approve" ? "선택한 제안을 적용했습니다." : "제안을 거절했습니다.") }
    catch (error) { toast.error(error instanceof Error ? error.message : "결정을 처리하지 못했습니다.") }
    finally { setDeciding(false) }
  }

  const currentLabel = navigation.find((item) => item.id === view)?.label
  const nowIso = new Date().toISOString()
  const yearMonth = formatDate(nowIso, { year: "numeric", month: "long" })
  const dayNumber = formatDate(nowIso, { day: "numeric" })
  const weekdayName = formatDate(nowIso, { weekday: "long" })
  const weeklyPercent = weeklyProgress.target ? Math.round(weeklyProgress.completed / weeklyProgress.target * 100) : 0

  return <div className="min-h-svh pb-24 md:pb-8">
    <header className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 pt-5 md:px-8">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="select-none text-xl leading-none tracking-[0.2em]"><span className="text-[#8AB4FF]">✦</span><span className="text-[#F4A3C0]">✧</span><span className="text-[#F2C94C]">✦</span></span>
        <h1 className="font-display text-3xl leading-none text-[#2B3561] md:text-4xl">오늘의 흐름</h1>
      </div>
      <Button onClick={() => setView("agent")} className="h-10 rounded-full bg-[#F48FB1] px-4 text-[#2B3561] shadow-[0_6px_18px_rgba(244,143,177,0.45)] hover:bg-[#F27AA5]"><Sparkles className="size-4" /><span className="hidden sm:inline">플래너에게 요청</span><span className="sm:hidden">AI 계획</span></Button>
    </header>
    <div className="mx-auto mt-4 w-full max-w-[1400px] px-4 md:px-8"><div className="rainbow-bar h-2 w-full rounded-full" /></div>

    <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 pt-4 md:grid-cols-[minmax(0,1fr)_14rem] md:px-8">
      <main className="card-soft relative min-w-0 rounded-[1.75rem] bg-white/90 p-4 backdrop-blur sm:rounded-[2rem] sm:p-6 sm:pl-12 md:p-8 md:pl-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-8 left-4 hidden w-4 flex-col justify-between sm:flex md:left-5">{Array.from({ length: 9 }, (_, index) => <span key={index} className="block size-4 rounded-full border-2 border-[#E3DCEA] bg-[#FBF6F9] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]" />)}</div>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#2B3561] pb-4">
          <div>
            <p className="text-sm font-medium text-[#8A8FA8]">{yearMonth}</p>
            <p className="font-display text-[2.75rem] leading-none text-[#2B3561] md:text-5xl">{currentLabel}<span className="ml-3 text-2xl text-[#2F3660] md:text-3xl">{dayNumber} {weekdayName}</span></p>
          </div>
          <span className="text-sm font-medium text-[#8A8FA8]">{navigation.find((item) => item.id === view)?.tagline}</span>
        </div>
        {loading && serverState === "checking" && <div role="status" aria-live="polite" className="mt-5 flex items-center gap-3 rounded-2xl border border-[#F0D3E0] bg-[#FFF2F7] px-4 py-3 text-sm text-[#4A5590]"><LoaderCircle className="size-5 shrink-0 animate-spin" /><div><p className="font-semibold">서버를 준비하는 중입니다</p><p className="mt-0.5 text-[#8A8FA8]">무료 서버가 다시 시작되는 데 최대 1~2분 정도 걸릴 수 있습니다. 이 화면에서 잠시 기다려 주세요.</p></div></div>}
        {loadError && <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#F7C6D3] bg-[#FFF1F4] px-4 py-3 text-sm text-[#A63A5C]"><span>{loadError}</span><Button variant="ghost" size="sm" onClick={() => void initialize()}><RotateCcw />다시 시도</Button></div>}
        <div className="pt-6">
        {view === "today" && <TodayView loading={loading} items={todayItems} plans={todayPlans} schedules={schedules.filter((item) => dateKey(item.start_datetime) === dateKey(new Date()))} weekPlans={weekPlans} tasks={tasks} openAgent={() => setView("agent")} workouts={(workoutWeek?.sessions ?? []).filter((item) => item.session_date === dateKey(new Date()))} toggleWorkout={toggleWorkout} openHealth={openHealth} openGratitude={() => setView("gratitude")} todayGratitude={gratitudeEntries.filter((entry) => entry.entry_date === dateKey(new Date()))} addGratitude={addGratitude} addItem={addTodayItem} toggleItem={toggleTodayItem} togglePlan={togglePlan} toggleSchedule={toggleSchedule} removeItem={removeTodayItem} reorderItems={reorderTodayItems} />}
        {view === "tasks" && <TasksView loading={loading} tasks={tasks} todayItems={todayItems} onTaskSaved={onTaskSaved} toggleTask={toggleTask} removeTask={removeTask} addTaskToToday={addTaskToToday} />}
        {view === "week" && <WeekView loading={loading} plans={weekPlans} schedules={schedules} recurringTasks={recurringTasks} weekTodayItems={weekTodayItems} workouts={workoutWeek?.sessions ?? []} onScheduleSaved={onScheduleSaved} removeSchedule={removeSchedule} togglePlan={togglePlan} toggleSchedule={toggleSchedule} toggleTodayItem={toggleTodayItem} toggleWorkout={toggleWorkout} />}
        {view === "weight" && <WeightView key={`${bodySettings.height_cm}-${bodySettings.daily_protein_target_g}-${bodySettings.daily_calorie_target_kcal}`} loading={loading} tab={healthTab} onTabChange={setHealthTab} workoutWeek={workoutWeek} workoutSettings={workoutSettings} saveWorkout={saveWorkout} addWorkout={addWorkout} removeWorkout={removeWorkout} planWorkouts={planWorkouts} saveWorkoutSettings={saveWorkoutSettings} settings={bodySettings} records={weightRecords} meals={mealEntries} foods={foodNutrition} review={dietReview} saveWeight={saveWeight} saveHeight={saveHeight} saveTargets={saveTargets} saveMeal={saveMeal} removeMeal={removeMeal} analyzeDiet={analyzeDiet} />}
        {view === "gratitude" && <GratitudeView loading={loading} entries={gratitudeEntries} addEntry={addGratitude} editEntry={editGratitude} removeEntry={removeGratitude} />}
        {view === "agent" && <AgentView loading={loading} message={message} setMessage={setMessage} sending={sending} agentError={agentError} latestResponse={latestResponse} actions={actions} deciding={deciding} sendMessage={sendMessage} decide={decide} />}
        {view === "settings" && <><SettingsView loading={loading} recurringTasks={recurringTasks} preferences={preferences} setPreferences={setPreferences} onRecurringSaved={onRecurringSaved} toggleRecurringTask={toggleRecurringTask} removeRecurringTask={removeRecurringTask} savePreferences={savePreferences} /><PhotoSettings photos={photos} addPhoto={addPhoto} updateCaption={updatePhotoCaption} movePhoto={movePhoto} removePhoto={removePhoto} /></>}
        </div>
      </main>

      <aside className="hidden md:block">
        <div className="sticky top-5 grid gap-4">
          <nav aria-label="주요 메뉴" className="card-soft rounded-[1.75rem] bg-gradient-to-b from-[#FFE4EE] to-[#FFD6E5] p-3">
            <ul className="grid gap-1">{navigation.map(({ id, label, icon: Icon }) => <li key={id}><button type="button" onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={`flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-[0.95rem] font-semibold transition ${view === id ? "bg-white text-[#2B3561] shadow-[0_6px_16px_rgba(214,120,160,0.18)]" : "text-[#4A5590] hover:bg-white/60"}`}><Icon className={`size-5 ${view === id ? "text-[#E85D8E]" : "text-[#6F62B5]"}`} /><span>{label}</span>{id === "agent" && actions.length > 0 && <span className="ml-auto grid size-5 place-items-center rounded-full bg-[#E85D8E] text-xs text-white">{actions.length}</span>}</button></li>)}</ul>
          </nav>
          <div className="card-soft rounded-[1.75rem] bg-white p-5">
            <p className="text-sm font-semibold text-[#5A6185]">이번 주 완료율</p>
            <p className="mt-2 font-display text-4xl leading-none text-[#2B3561]">{weeklyPercent}%<span className="ml-2 text-base text-[#8A8FA8]">{weeklyProgress.completed}/{weeklyProgress.target}</span></p>
            <Progress value={weeklyPercent} className="mt-3 h-2.5 bg-[#DCEBFF] [&_[data-slot=progress-indicator]]:bg-[#7A6BC9]" />
          </div>
          <Polaroid photos={photos} onManage={() => setView("settings")} />
          <DdayCard tasks={tasks} schedules={schedules} />
        </div>
      </aside>
    </div>

    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-[#F6D6E3] bg-[#FFF2F7]/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">{navigation.map(({ id, label, short, icon: Icon }) => <button key={id} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[0.68rem] font-semibold ${view === id ? "bg-white text-[#2B3561] shadow-sm" : "text-[#6F62B5]"}`}><Icon className={`size-5 ${view === id ? "text-[#E85D8E]" : ""}`} /><span className="truncate">{short ?? label}</span>{id === "agent" && actions.length > 0 && <span className="absolute right-[18%] top-1 size-2 rounded-full bg-[#E85D8E]" />}</button>)}</nav>
    <Toaster position="top-center" richColors />
  </div>
}
