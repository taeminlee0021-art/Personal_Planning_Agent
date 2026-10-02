"use client"

import { useState } from "react"
import { CalendarPlus, Dumbbell, HeartPulse, LoaderCircle, Save, Sparkles, Trash2 } from "lucide-react"
import type { MuscleGroup, WorkoutSession, WorkoutSessionDraft, WorkoutSettings, WorkoutWeek } from "@/lib/types"
import { formatDate, muscleLabel, weekDays, weekdayLabels, workoutMinutes } from "@/components/planner/helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

const groups = Object.keys(muscleLabel) as MuscleGroup[]

function draft(session: WorkoutSession, changes: Partial<WorkoutSessionDraft> = {}): WorkoutSessionDraft {
  return { session_date: session.session_date, muscle_groups: session.muscle_groups, note: session.note, completed: session.completed, ...changes }
}

export function WorkoutPanel({ week, settings, saveSession, addSession, removeSession, planWeek, saveSettings }: {
  week: WorkoutWeek | null
  settings: WorkoutSettings
  saveSession: (id: number, value: WorkoutSessionDraft) => Promise<void>
  addSession: (value: WorkoutSessionDraft) => Promise<void>
  removeSession: (id: number) => Promise<void>
  planWeek: () => Promise<void>
  saveSettings: (value: WorkoutSettings) => Promise<void>
}) {
  const days = weekDays()
  const sessions = week?.sessions ?? []
  const used = new Set(sessions.map((item) => item.session_date))
  const freeDays = days.filter((day) => !used.has(day))
  const [newDay, setNewDay] = useState("")
  const [planning, setPlanning] = useState(false)
  const [defaults, setDefaults] = useState(settings)
  const openCount = sessions.filter((item) => !item.completed && item.focus_source !== "MANUAL").length
  const addDay = freeDays.includes(newDay) ? newDay : freeDays[0] ?? ""

  async function runPlan() {
    setPlanning(true); try { await planWeek() } finally { setPlanning(false) }
  }

  function toggleGroup(session: WorkoutSession, group: MuscleGroup) {
    const selected = session.muscle_groups.includes(group)
    if (!selected && session.muscle_groups.length >= 2) return
    const next = selected ? session.muscle_groups.filter((item) => item !== group) : [...session.muscle_groups, group]
    // A hand-picked focus makes the AI exercise note stale.
    void saveSession(session.id, draft(session, { muscle_groups: next, note: "" }))
  }

  return <div className="space-y-5">
    <section className="rounded-[1.3rem] bg-[#183D35] p-5 text-white sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><div className="flex items-center gap-2 text-[#CDE0D8]"><Dumbbell className="size-5" /><p className="text-sm font-semibold">이번 주 헬스</p></div><p className="mt-3 text-3xl font-bold">{sessions.filter((item) => item.completed).length} / {sessions.length}회</p><p className="mt-1 text-sm text-[#CDE0D8]">회당 근력 {settings.strength_minutes}분 + 유산소 {settings.cardio_minutes}분</p></div>
        <Button type="button" disabled={planning || openCount === 0} onClick={() => void runPlan()} className="h-11 shrink-0 bg-white text-[#183D35] hover:bg-[#E6F0EB]">{planning ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{planning ? "부위 짜는 중" : "AI로 부위 짜기"}</Button>
      </div>
      {week?.summary ? <p className="mt-4 border-t border-white/15 pt-4 text-sm leading-6 text-[#E3EEE9]">{week.summary}</p> : <p className="mt-4 border-t border-white/15 pt-4 text-sm leading-6 text-[#CDE0D8]">지난 운동 이력을 바탕으로 GPT가 미완료 세션의 근력 부위를 나눠 줍니다. 직접 고른 부위와 완료한 세션은 그대로 둡니다.</p>}
    </section>

    <div className="grid gap-3 md:grid-cols-2">{sessions.map((session) => <article key={session.id} className={`rounded-[1.2rem] border p-4 ${session.completed ? "bg-[#F2F4F2]" : "bg-white"}`}>
      <div className="flex items-start gap-3">
        <Checkbox checked={session.completed} onCheckedChange={() => void saveSession(session.id, draft(session, { completed: !session.completed }))} aria-label={session.completed ? "운동 완료 취소" : "운동 완료"} className="mt-1 size-6 rounded-full border-[#6F9586] data-[state=checked]:bg-[#356859]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className={`font-bold ${session.completed ? "text-[#7D8984] line-through" : "text-[#263A33]"}`}>{formatDate(`${session.session_date}T12:00:00+09:00`, { month: "long", day: "numeric", weekday: "short" })}</p>{session.focus_source === "AI" && <Badge variant="secondary" className="bg-[#E7F0EB] text-[#356859]"><Sparkles className="size-3" />AI 추천</Badge>}{session.focus_source === "MANUAL" && <Badge variant="outline">직접 지정</Badge>}</div>
          <p className="mt-1 text-sm text-[#718079]">{workoutMinutes(session)}</p>
        </div>
        <Button type="button" size="icon" variant="ghost" aria-label="운동 삭제" onClick={() => void removeSession(session.id)} className="size-9 shrink-0 text-[#9A6554]"><Trash2 /></Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="근력 부위 (최대 2개)">{groups.map((group) => { const active = session.muscle_groups.includes(group); return <button key={group} type="button" aria-pressed={active} disabled={!active && session.muscle_groups.length >= 2} onClick={() => toggleGroup(session, group)} className={`h-9 min-w-12 rounded-full border px-3 text-sm font-medium transition disabled:opacity-40 ${active ? "border-[#356859] bg-[#356859] text-white" : "border-[#D3DDD8] bg-white text-[#4E6159] hover:bg-[#EEF4F1]"}`}>{muscleLabel[group]}</button> })}</div>
      {session.note && <p className="mt-3 rounded-xl bg-[#F3F8F5] px-3 py-2 text-sm leading-6 text-[#4A5F57]">{session.note}</p>}
      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-[#5D6B65]">요일 옮기기<select value={session.session_date} onChange={(event) => void saveSession(session.id, draft(session, { session_date: event.target.value }))} className="h-10 flex-1 rounded-md border bg-white px-3 text-sm">{days.map((day, index) => <option key={day} value={day} disabled={day !== session.session_date && used.has(day)}>{weekdayLabels[index]}요일 ({Number(day.slice(-2))}일){day !== session.session_date && used.has(day) ? " · 운동 있음" : ""}</option>)}</select></label>
    </article>)}</div>
    {!sessions.length && <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-[#7A8580]">이번 주 운동이 없습니다. 아래에서 추가해 보세요.</div>}

    {freeDays.length > 0 && <div className="flex flex-col gap-2 rounded-[1.2rem] border bg-white p-4 sm:flex-row sm:items-center"><p className="flex items-center gap-2 text-sm font-semibold text-[#263A33]"><CalendarPlus className="size-4 text-[#356859]" />운동 추가</p><select aria-label="추가할 요일" value={addDay} onChange={(event) => setNewDay(event.target.value)} className="h-10 flex-1 rounded-md border bg-white px-3 text-sm">{freeDays.map((day) => <option key={day} value={day}>{weekdayLabels[days.indexOf(day)]}요일 ({Number(day.slice(-2))}일)</option>)}</select><Button type="button" variant="outline" disabled={!addDay} onClick={() => void addSession({ session_date: addDay, muscle_groups: [], note: "", completed: false })} className="h-10">추가</Button></div>}

    <section className="rounded-[1.3rem] border bg-white p-5 sm:p-6">
      <h3 className="flex items-center gap-2 font-bold text-[#263A33]"><HeartPulse className="size-5 text-[#356859]" />기본 운동 요일</h3>
      <p className="mt-1 text-sm text-[#7A8580]">다음 주부터 이 요일에 헬스가 자동으로 추가됩니다. 이번 주는 위에서 요일을 옮기세요.</p>
      <div className="mt-4 grid grid-cols-7 gap-1.5">{weekdayLabels.map((label, index) => { const active = defaults.weekdays.includes(index); return <button key={label} type="button" aria-pressed={active} onClick={() => setDefaults({ ...defaults, weekdays: active ? defaults.weekdays.filter((day) => day !== index) : [...defaults.weekdays, index].sort((a, b) => a - b) })} className={`h-11 rounded-xl border text-sm font-semibold ${active ? "border-[#356859] bg-[#356859] text-white" : "bg-white text-[#56665F]"}`}>{label}</button> })}</div>
      <div className="mt-4 grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium">근력 (분)<Input type="number" min={0} max={180} inputMode="numeric" value={defaults.strength_minutes} onChange={(event) => setDefaults({ ...defaults, strength_minutes: Number(event.target.value) })} /></label><label className="grid gap-1.5 text-sm font-medium">유산소 (분)<Input type="number" min={0} max={180} inputMode="numeric" value={defaults.cardio_minutes} onChange={(event) => setDefaults({ ...defaults, cardio_minutes: Number(event.target.value) })} /></label></div>
      <Button type="button" disabled={!defaults.weekdays.length || defaults.strength_minutes + defaults.cardio_minutes <= 0} onClick={() => void saveSettings(defaults)} className="mt-4 h-11 w-full bg-[#183D35] hover:bg-[#28564A]"><Save />기본값 저장</Button>
    </section>
  </div>
}
