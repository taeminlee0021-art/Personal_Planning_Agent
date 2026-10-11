"use client"

import { FormEvent, useMemo, useState } from "react"
import { Activity, CalendarDays, Dumbbell, Flame, LoaderCircle, Ruler, Save, Scale, Sparkles, Trash2, Utensils } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { BodySettings, DietReview, FoodNutrition, MealDraft, MealEntry, MealType, WeightRecord, WorkoutSessionDraft, WorkoutSettings, WorkoutWeek } from "@/lib/types"
import { WorkoutPanel } from "@/components/planner/workout-panel"
import { dateKey, formatDate } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingCards } from "@/components/planner/shared"

const chartConfig = { weight: { label: "몸무게", color: "#356859" } } satisfies ChartConfig
const mealLabels: Record<MealType, string> = { BREAKFAST: "아침", LUNCH: "점심", DINNER: "저녁", SNACK: "간식" }
const emptyMeal = (): MealDraft => ({ eaten_on: dateKey(new Date()), meal_type: "BREAKFAST", food_name: "", calories_kcal: null, protein_g: null })

function bmiLabel(value: number) {
  if (value < 18.5) return "저체중"
  if (value < 23) return "정상"
  if (value < 25) return "비만 전단계"
  if (value < 30) return "1단계 비만"
  if (value < 35) return "2단계 비만"
  return "3단계 비만 (고도비만)"
}

function nutrition(value: number | null, unit: string) {
  return value === null ? "계산 전" : `${Math.round(value * 10) / 10}${unit}`
}

export type HealthTab = "workout" | "diet" | "weight"

export function WeightView({ loading, tab, onTabChange, settings, records, meals, foods, review, workoutWeek, workoutSettings, saveWeight, saveHeight, saveTargets, saveMeal, removeMeal, analyzeDiet, saveWorkout, addWorkout, removeWorkout, planWorkouts, saveWorkoutSettings }: {
  tab: HealthTab
  onTabChange: (tab: HealthTab) => void
  workoutWeek: WorkoutWeek | null
  workoutSettings: WorkoutSettings
  saveWorkout: (id: number, value: WorkoutSessionDraft) => Promise<void>
  addWorkout: (value: WorkoutSessionDraft) => Promise<void>
  removeWorkout: (id: number) => Promise<void>
  planWorkouts: () => Promise<void>
  saveWorkoutSettings: (value: WorkoutSettings) => Promise<void>
  loading: boolean
  settings: BodySettings
  records: WeightRecord[]
  meals: MealEntry[]
  foods: FoodNutrition[]
  review: DietReview | null
  saveWeight: (weight: number, measuredOn: string) => Promise<void>
  saveHeight: (height: number) => Promise<void>
  saveTargets: (protein: number, calories: number) => Promise<void>
  saveMeal: (meal: MealDraft) => Promise<void>
  removeMeal: (id: number) => Promise<void>
  analyzeDiet: () => Promise<void>
}) {
  const [weight, setWeight] = useState("")
  const [measuredOn, setMeasuredOn] = useState(() => dateKey(new Date()))
  const [height, setHeight] = useState(String(settings.height_cm))
  const [proteinTarget, setProteinTarget] = useState(String(settings.daily_protein_target_g))
  const [calorieTarget, setCalorieTarget] = useState(String(settings.daily_calorie_target_kcal))
  const [meal, setMeal] = useState<MealDraft>(emptyMeal)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const latest = records.at(-1)
  const bmi = latest ? latest.weight_kg / ((settings.height_cm / 100) ** 2) : null
  const chartData = useMemo(() => records.slice(-16).map((item) => ({
    label: formatDate(`${item.measured_on}T12:00:00+09:00`, { month: "numeric", day: "numeric" }), weight: item.weight_kg,
  })), [records])
  const totals = useMemo(() => ({
    calories: meals.reduce((sum, item) => sum + (item.calories_kcal ?? 0), 0),
    protein: meals.reduce((sum, item) => sum + (item.protein_g ?? 0), 0),
    unresolved: meals.filter((item) => item.calories_kcal === null || item.protein_g === null).length,
  }), [meals])
  const todayKey = dateKey(new Date())
  const proteinByDay = useMemo(() => meals.reduce<Record<string, number>>((days, item) => {
    days[item.eaten_on] = (days[item.eaten_on] ?? 0) + (item.protein_g ?? 0)
    return days
  }, {}), [meals])
  const caloriesByDay = useMemo(() => meals.reduce<Record<string, number>>((days, item) => {
    days[item.eaten_on] = (days[item.eaten_on] ?? 0) + (item.calories_kcal ?? 0)
    return days
  }, {}), [meals])
  const todayProtein = proteinByDay[todayKey] ?? 0
  const target = settings.daily_protein_target_g
  const calorieTargetValue = settings.daily_calorie_target_kcal
  const loggedDays = Object.keys(proteinByDay)
  const weekStats = {
    days: loggedDays.length,
    proteinHit: loggedDays.filter((day) => target > 0 && (proteinByDay[day] ?? 0) >= target).length,
    calorieOver: loggedDays.filter((day) => calorieTargetValue > 0 && (caloriesByDay[day] ?? 0) > calorieTargetValue).length,
    avgProtein: loggedDays.length ? totals.protein / loggedDays.length : 0,
    avgCalories: loggedDays.length ? totals.calories / loggedDays.length : 0,
  }
  const grouped = useMemo(() => Object.entries(meals.reduce<Record<string, MealEntry[]>>((days, item) => {
    ;(days[item.eaten_on] ??= []).push(item)
    return days
  }, {})).sort(([a], [b]) => b.localeCompare(a)), [meals])

  function matchFood(name: string) {
    const key = name.trim().toLocaleLowerCase().replace(/\s+/g, " ")
    return foods.find((item) => item.normalized_name === key)
  }

  function changeFood(name: string) {
    setMeal((current) => {
      const known = matchFood(name)
      const wasKnown = matchFood(current.food_name)
      return { ...current, food_name: name,
        calories_kcal: known?.calories_kcal ?? (wasKnown ? null : current.calories_kcal),
        protein_g: known?.protein_g ?? (wasKnown ? null : current.protein_g) }
    })
  }

  async function submitWeight(event: FormEvent) {
    event.preventDefault(); const value = Number(weight)
    if (!Number.isFinite(value) || value < 20 || value > 400) return
    setSaving(true)
    try { await saveWeight(value, measuredOn); setWeight("") } finally { setSaving(false) }
  }

  async function submitMeal(event: FormEvent) {
    event.preventDefault(); if (!meal.food_name.trim()) return
    setSaving(true)
    try { await saveMeal({ ...meal, food_name: meal.food_name.trim() }); setMeal(emptyMeal()) } finally { setSaving(false) }
  }

  async function updateTargets() {
    const protein = Number(proteinTarget); const calories = Number(calorieTarget)
    if (!Number.isFinite(protein) || protein < 0 || protein > 500 || !Number.isFinite(calories) || calories < 0 || calories > 10000) return
    setSaving(true); try { await saveTargets(protein, calories) } finally { setSaving(false) }
  }
  const targetsUnchanged = Number(proteinTarget) === settings.daily_protein_target_g && Number(calorieTarget) === settings.daily_calorie_target_kcal

  async function updateHeight() {
    const value = Number(height); if (!Number.isFinite(value) || value <= 50 || value > 250) return
    setSaving(true); try { await saveHeight(value) } finally { setSaving(false) }
  }

  async function runAnalysis() {
    setAnalyzing(true); try { await analyzeDiet() } finally { setAnalyzing(false) }
  }

  if (loading) return <LoadingCards />

  return <section aria-labelledby="health-heading">
    <div className="mb-6"><p className="mb-1 text-sm font-semibold text-[#356859]">HEALTH LOG</p><h2 id="health-heading" className="text-2xl font-bold tracking-tight md:text-3xl">건강 기록</h2><p className="mt-2 text-sm text-[#74807A]">헬스와 식사를 기록하고, 일요일에 한 주 운동·식단과 몸무게 흐름을 함께 확인하세요.</p></div>
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as HealthTab)} className="gap-5">
      <TabsList className="h-11 w-full max-w-md rounded-xl bg-[#E8EEEA] p-1"><TabsTrigger value="workout" className="rounded-lg"><Dumbbell />운동</TabsTrigger><TabsTrigger value="diet" className="rounded-lg"><Utensils />식단</TabsTrigger><TabsTrigger value="weight" className="rounded-lg"><Scale />몸무게</TabsTrigger></TabsList>

      <TabsContent value="workout"><WorkoutPanel key={JSON.stringify(workoutSettings)} week={workoutWeek} settings={workoutSettings} saveSession={saveWorkout} addSession={addWorkout} removeSession={removeWorkout} planWeek={planWorkouts} saveSettings={saveWorkoutSettings} /></TabsContent>

      <TabsContent value="diet" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[1.3rem] bg-[#183D35] p-5 text-white"><div className="flex items-center gap-2 text-[#CDE0D8]"><Flame className="size-5" /><p className="text-sm font-semibold">이번 주 칼로리</p></div><p className="mt-5 text-3xl font-bold">{Math.round(totals.calories).toLocaleString()} kcal</p></article>
          <article className="rounded-[1.3rem] border bg-white p-5"><p className="text-sm font-semibold text-[#356859]">오늘 단백질</p><div className="mt-5 flex flex-wrap items-end gap-2"><p className="text-3xl font-bold text-[#253A32]">{Math.round(todayProtein)} g</p><p className="mb-1 text-sm text-[#7A8580]">/ {target} g</p>{target > 0 && todayProtein >= target && <Badge className="mb-1 bg-[#E3EEE8] text-[#285A4D] hover:bg-[#E3EEE8]">목표 달성</Badge>}</div><Progress value={target > 0 ? Math.min(100, todayProtein / target * 100) : 0} aria-label="오늘 단백질 달성률" className="mt-3 bg-[#E5ECE8] [&_[data-slot=progress-indicator]]:bg-[#356859]" /><p className="mt-2 text-sm text-[#7A8580]">{target > 0 && todayProtein < target ? `${Math.round(target - todayProtein)} g 더 필요 · 이번 주 ${Math.round(totals.protein)} g` : `이번 주 ${Math.round(totals.protein)} g`}</p></article>
          <article className="rounded-[1.3rem] border bg-white p-5"><p className="text-sm font-semibold text-[#356859]">영양정보 미확정</p><p className="mt-5 text-3xl font-bold text-[#253A32]">{totals.unresolved}개</p><p className="mt-2 text-sm text-[#7A8580]">평가 시 GPT가 추정합니다.</p></article>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
          <form onSubmit={submitMeal} className="rounded-[1.3rem] border bg-white p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-bold text-[#263A33]"><Utensils className="size-5 text-[#356859]" />먹은 음식 입력</h3>
            <div className="mt-5 grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium">날짜<Input required type="date" value={meal.eaten_on} onChange={(e) => setMeal({ ...meal, eaten_on: e.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">구분<select value={meal.meal_type} onChange={(e) => setMeal({ ...meal, meal_type: e.target.value as MealType })} className="h-9 rounded-md border bg-transparent px-3 text-sm">{Object.entries(mealLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <label className="mt-4 grid gap-1.5 text-sm font-medium">음식과 양<Input required list="known-foods" maxLength={200} placeholder="예: 닭가슴살 200g" value={meal.food_name} onChange={(e) => changeFood(e.target.value)} /></label><datalist id="known-foods">{foods.map((food) => <option key={food.id} value={food.display_name} />)}</datalist>
            {matchFood(meal.food_name) && <p className="mt-2 text-xs font-medium text-[#356859]">저장된 영양정보를 자동으로 불러왔습니다.</p>}
            <div className="mt-4 grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium">칼로리 (선택)<Input type="number" min={0} max={5000} step="0.1" inputMode="decimal" placeholder="모르면 비워두기" value={meal.calories_kcal ?? ""} onChange={(e) => setMeal({ ...meal, calories_kcal: e.target.value === "" ? null : Number(e.target.value) })} /></label><label className="grid gap-1.5 text-sm font-medium">단백질 g (선택)<Input type="number" min={0} max={500} step="0.1" inputMode="decimal" placeholder="모르면 비워두기" value={meal.protein_g ?? ""} onChange={(e) => setMeal({ ...meal, protein_g: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>
            <Button type="submit" disabled={saving || !meal.food_name.trim()} className="mt-5 h-11 w-full bg-[#183D35] hover:bg-[#28564A]"><Save />{saving ? "저장 중" : "식단 기록"}</Button>
          </form>

          <section className="rounded-[1.3rem] border bg-white p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-[#263A33]">이번 주 식사</h3><p className="mt-1 text-sm text-[#7A8580]">같은 음식은 다음 입력부터 영양값이 자동 완성됩니다.</p></div></div>
            {grouped.length ? <div className="mt-4 space-y-5">{grouped.map(([day, entries]) => <div key={day}><p className="mb-2 text-sm font-bold text-[#50625A]">{formatDate(`${day}T12:00:00+09:00`, { month: "long", day: "numeric", weekday: "short" })}</p><ProteinBar value={proteinByDay[day] ?? 0} target={target} /><div className="space-y-2">{entries!.map((item) => <article key={item.id} className="flex items-start gap-3 rounded-xl bg-[#F7F9F6] p-3"><Badge variant="secondary" className="mt-0.5 shrink-0">{mealLabels[item.meal_type]}</Badge><div className="min-w-0 flex-1"><p className="font-medium break-words">{item.food_name}</p><p className="mt-1 text-xs text-[#718079]">{nutrition(item.calories_kcal, " kcal")} · 단백질 {nutrition(item.protein_g, "g")}{item.nutrition_source === "GPT" || item.nutrition_source === "MIXED" ? " · GPT 추정" : ""}</p></div><Button type="button" size="icon" variant="ghost" aria-label={`${item.food_name} 삭제`} onClick={() => void removeMeal(item.id)} className="size-9 shrink-0 text-[#9A6554]"><Trash2 /></Button></article>)}</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-[#7A8580]">이번 주 식사 기록이 없습니다.</div>}
          </section>
        </div>

        <section className="rounded-[1.3rem] border border-[#CAD9D1] bg-[#F3F8F5] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h3 className="flex items-center gap-2 font-bold text-[#263A33]"><Sparkles className="size-5 text-[#356859]" />이번 주 식단 평가</h3><p className="mt-2 text-sm leading-6 text-[#64736C]">기록된 식사량과 최근 몸무게를 함께 참고합니다. 빠진 날짜나 식사는 먹지 않은 것으로 간주하지 않습니다.</p></div><Button type="button" disabled={analyzing || meals.length === 0} onClick={() => void runAnalysis()} className="h-11 shrink-0 bg-[#183D35] hover:bg-[#28564A]">{analyzing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{analyzing ? "평가 중" : "GPT로 평가하기"}</Button></div>
          {review && <div className="mt-5 space-y-4 border-t border-[#D8E3DD] pt-5">
            <p className="leading-7 text-[#344A42]">{review.summary}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="기록한 날" value={`${weekStats.days}일`} />
              <Stat label="단백질 목표 달성" value={`${weekStats.proteinHit} / ${weekStats.days}일`} good={weekStats.days > 0 && weekStats.proteinHit === weekStats.days} />
              <Stat label="일평균 단백질" value={`${Math.round(weekStats.avgProtein)} g`} sub={`목표 ${target} g`} good={weekStats.avgProtein >= target} />
              <Stat label="일평균 칼로리" value={`${Math.round(weekStats.avgCalories)} kcal`} sub={`목표 ${calorieTargetValue} kcal · 초과 ${weekStats.calorieOver}일`} good={weekStats.avgCalories <= calorieTargetValue} />
            </div>
            {review.biggest_issue && <div className="rounded-xl border border-[#E5C2B7] bg-[#FFF8F5] p-4"><h4 className="font-bold text-[#7E4A39]">이번 주 가장 큰 문제</h4><p className="mt-2 text-sm leading-6 text-[#5F4A43]">{review.biggest_issue}</p></div>}
            {review.next_week_actions && review.next_week_actions.length > 0 && <div className="rounded-xl border border-[#9DB9AD] bg-[#EEF6F1] p-4"><h4 className="font-bold text-[#285A4D]">다음 주에 바꿀 것</h4><ol className="mt-2 space-y-2 text-sm leading-6 text-[#344A42]">{review.next_week_actions.map((item, index) => <li key={item} className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#356859] text-xs font-bold text-white">{index + 1}</span><span>{item}</span></li>)}</ol></div>}
            <div className="grid gap-4 md:grid-cols-3"><ReviewList title="좋았던 점" items={review.good_points} tone="good" /><ReviewList title="피하는 게 나은 음식" items={review.avoid_foods} tone="avoid" /><ReviewList title="양을 줄일 음식" items={review.limit_foods} tone="limit" /></div>
          </div>}
          <p className="mt-4 text-xs leading-5 text-[#7B8983]">GPT 영양값은 일반적인 양을 바탕으로 한 추정치이며, BMI와 식단 평가는 의료 진단을 대신하지 않습니다.</p>
        </section>

        <section className="rounded-[1.3rem] border bg-white p-5 sm:p-6"><h3 className="font-bold text-[#263A33]">하루 목표</h3><p className="mt-1 text-sm text-[#7A8580]">날짜별 달성도와 GPT 식단 평가가 이 값을 기준으로 합니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="grid gap-1.5 text-sm font-medium">단백질 (g / 일)<Input aria-label="하루 단백질 목표 그램" type="number" min={0} max={500} step="1" inputMode="numeric" value={proteinTarget} onChange={(e) => setProteinTarget(e.target.value)} className="h-11" /></label><label className="grid gap-1.5 text-sm font-medium">칼로리 (kcal / 일)<Input aria-label="하루 칼로리 목표" type="number" min={0} max={10000} step="10" inputMode="numeric" value={calorieTarget} onChange={(e) => setCalorieTarget(e.target.value)} className="h-11" /></label><Button type="button" variant="outline" disabled={saving || targetsUnchanged} onClick={() => void updateTargets()} className="h-11">저장</Button></div></section>
      </TabsContent>

      <TabsContent value="weight" className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-[1.3rem] bg-[#183D35] p-5 text-white"><div className="flex items-center gap-2 text-[#CDE0D8]"><Scale className="size-5" /><p className="text-sm font-semibold">최근 몸무게</p></div><p className="mt-5 text-3xl font-bold">{latest ? `${latest.weight_kg.toFixed(1)} kg` : "기록 없음"}</p>{latest && <p className="mt-2 text-sm text-[#CDE0D8]">{formatDate(`${latest.measured_on}T12:00:00+09:00`, { year: "numeric", month: "long", day: "numeric" })}</p>}</article>
          <article className="rounded-[1.3rem] border bg-white p-5"><div className="flex items-center gap-2 text-[#356859]"><Activity className="size-5" /><p className="text-sm font-semibold">현재 BMI</p></div><div className="mt-5 flex flex-wrap items-end gap-2"><p className="text-3xl font-bold text-[#253A32]">{bmi ? bmi.toFixed(1) : "—"}</p>{bmi && <Badge className="mb-1 bg-[#E3EEE8] text-[#285A4D] hover:bg-[#E3EEE8]">{bmiLabel(bmi)}</Badge>}</div><p className="mt-2 text-sm text-[#7A8580]">대한비만학회 성인 기준 참고 분류이며 의료 진단은 아닙니다.</p></article>
          <article className="rounded-[1.3rem] border bg-white p-5"><div className="flex items-center gap-2 text-[#356859]"><Ruler className="size-5" /><p className="text-sm font-semibold">키</p></div><div className="mt-4 flex items-center gap-2"><Input aria-label="키 센티미터" type="number" min={51} max={250} step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className="h-11" /><span className="shrink-0 text-sm text-[#66736D]">cm</span></div><Button type="button" variant="outline" disabled={saving} onClick={() => void updateHeight()} className="mt-3 h-10 w-full">키 저장</Button></article>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.5fr)]">
          <form onSubmit={submitWeight} className="rounded-[1.3rem] border bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[#356859]"><CalendarDays className="size-5" /><h3 className="font-bold text-[#263A33]">측정값 입력</h3></div><label className="mt-5 grid gap-1.5 text-sm font-medium">측정일<Input required type="date" value={measuredOn} onChange={(e) => setMeasuredOn(e.target.value)} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium">몸무게 (kg)<Input required type="number" min={20} max={400} step="0.1" inputMode="decimal" placeholder="예: 72.4" value={weight} onChange={(e) => setWeight(e.target.value)} /></label><Button type="submit" disabled={saving || !weight} className="mt-5 h-11 w-full bg-[#183D35]"><Save />{saving ? "저장 중" : "기록 저장"}</Button></form>
          <section className="min-w-0 rounded-[1.3rem] border bg-white p-4 sm:p-6"><h3 className="font-bold text-[#263A33]">주간 변화</h3>{chartData.length ? <ChartContainer config={chartConfig} className="mt-4 h-[280px] w-full aspect-auto"><LineChart accessibilityLayer data={chartData}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} width={38} /><ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)} kg`} />} /><Line type="monotone" dataKey="weight" stroke="var(--color-weight)" strokeWidth={3} dot={{ fill: "var(--color-weight)", r: 4 }} /></LineChart></ChartContainer> : <div className="mt-4 grid h-[280px] place-items-center rounded-xl border border-dashed text-sm text-[#7A8580]">첫 몸무게를 기록해 보세요.</div>}</section>
        </div>
      </TabsContent>
    </Tabs>
  </section>
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return <div className="rounded-xl border border-[#DDE5E0] bg-white p-3"><p className="text-xs font-semibold text-[#77827D]">{label}</p><p className={`mt-1 text-lg font-bold ${good ? "text-[#285A4D]" : "text-[#253A32]"}`}>{value}</p>{sub && <p className="mt-0.5 text-xs text-[#8A948F]">{sub}</p>}</div>
}

function ProteinBar({ value, target }: { value: number; target: number }) {
  const reached = target > 0 && value >= target
  return <div className="mb-2 flex items-center gap-3"><Progress value={target > 0 ? Math.min(100, value / target * 100) : 0} aria-label="단백질 달성률" className={`h-1.5 flex-1 bg-[#E5ECE8] ${reached ? "[&_[data-slot=progress-indicator]]:bg-[#356859]" : "[&_[data-slot=progress-indicator]]:bg-[#9DB9AD]"}`} /><span className={`shrink-0 text-xs font-semibold tabular-nums ${reached ? "text-[#285A4D]" : "text-[#7A8580]"}`}>단백질 {Math.round(value)} / {target} g</span></div>
}

function ReviewList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "avoid" | "limit" }) {
  const colors = tone === "good" ? "border-[#BFD8C9] bg-white" : tone === "avoid" ? "border-[#E5C2B7] bg-[#FFF8F5]" : "border-[#E5D6AF] bg-[#FFFBF0]"
  return <div className={`rounded-xl border p-4 ${colors}`}><h4 className="font-bold text-[#344A42]">{title}</h4>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-[#5F6F68]">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-sm text-[#84908B]">해당 없음</p>}</div>
}
