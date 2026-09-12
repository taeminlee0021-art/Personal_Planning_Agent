"use client"

import { FormEvent } from "react"
import { CalendarSync, ExternalLink, Pencil, Plus, Settings2, Trash2, WalletCards } from "lucide-react"
import type { Preferences, RecurringTask } from "@/lib/types"
import { RecurringDialog } from "@/components/planner/recurring-dialog"
import { formatDate } from "@/components/planner/helpers"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const weekdays = ["월", "화", "수", "목", "금", "토", "일"]

export function SettingsView({ loading, recurringTasks, preferences, setPreferences, refresh, toggleRecurringTask, removeRecurringTask, savePreferences }: {
  loading: boolean
  recurringTasks: RecurringTask[]
  preferences: Preferences
  setPreferences: (value: Preferences) => void
  refresh: () => Promise<void>
  toggleRecurringTask: (item: RecurringTask) => Promise<void>
  removeRecurringTask: (id: number) => Promise<void>
  savePreferences: (event: FormEvent) => Promise<void>
}) {
  return <section aria-labelledby="settings-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-[#356859]">SETTINGS</p><h2 id="settings-heading" className="text-2xl font-bold tracking-tight md:text-3xl">내 생활에 맞게 설정해요</h2></div>
      <RecurringDialog trigger={<Button className="h-11 rounded-xl bg-[#183D35] hover:bg-[#28564A]"><Plus />반복 작업 추가</Button>} onSaved={refresh} />
    </div>

    <section className="rounded-[1.35rem] border bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E7F0EB] text-[#285A4D]"><CalendarSync className="size-5" /></div><div><h3 className="font-bold text-[#263A33]">반복 작업</h3><p className="mt-1 text-sm leading-6 text-[#74807A]">매일 또는 선택한 요일마다 오늘 목록에 자동 등록됩니다.</p></div></div>
      {loading ? <div className="mt-5"><LoadingCards /></div> : recurringTasks.length ? <div className="mt-5 grid gap-3">{recurringTasks.map((item) => <div key={item.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${item.active ? "bg-white" : "bg-[#F5F6F4] opacity-70"}`}>
        <Switch checked={item.active} onCheckedChange={() => void toggleRecurringTask(item)} aria-label={`${item.title} 반복 사용`} />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#2A3D36]">{item.title}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="secondary" className="bg-[#EEF3F0] text-[#53665E]">{item.cadence === "DAILY" ? "매일" : item.weekdays.map((day) => weekdays[day]).join(" · ")}</Badge><Badge variant="outline">{formatDate(`${item.start_date}T12:00:00+09:00`, { month: "short", day: "numeric" })}부터</Badge>{!item.active && <Badge variant="outline">중지됨</Badge>}</div></div>
        <RecurringDialog item={item} trigger={<Button size="icon" variant="ghost" aria-label="반복 작업 수정"><Pencil /></Button>} onSaved={refresh} />
        <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label="반복 작업 삭제" className="text-[#A4543A]"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{item.title}’ 반복을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>앞으로 자동 등록되지 않습니다. 이미 만들어진 오늘 기록은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeRecurringTask(item.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>)}</div> : <div className="mt-5 rounded-2xl border border-dashed bg-[#FAFBF9] p-8 text-center"><p className="font-semibold text-[#40534C]">등록된 반복 작업이 없습니다</p><p className="mt-1 text-sm text-[#7B8580]">운동, 약 복용, 주간 정리 같은 습관을 추가해 보세요.</p></div>}
    </section>

    <form onSubmit={savePreferences} className="mt-6 rounded-[1.35rem] border bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E7F0EB] text-[#285A4D]"><Settings2 className="size-5" /></div><div><h3 className="font-bold text-[#263A33]">계획 가능 시간</h3><p className="mt-1 text-sm leading-6 text-[#74807A]">한국 시간 기준, AI 플래너가 일정을 배치할 수 있는 범위입니다.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><label className="grid gap-1.5 text-sm font-medium">평일 시작<Input type="time" value={preferences.weekday_available_from.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekday_available_from: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">평일 종료<Input type="time" value={preferences.weekday_available_until.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekday_available_until: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">주말 시작<Input type="time" value={preferences.weekend_available_from.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekend_available_from: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">주말 종료<Input type="time" value={preferences.weekend_available_until.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekend_available_until: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">하루 최대(분)<Input type="number" min={1} max={1440} value={preferences.max_daily_planning_minutes} onChange={(event) => setPreferences({ ...preferences, max_daily_planning_minutes: Number(event.target.value) })} /></label></div>
      <div className="mt-5 flex justify-end"><Button type="submit" className="bg-[#183D35]">시간 설정 저장</Button></div>
    </form>

    <section className="mt-6 rounded-[1.35rem] border bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FFF0E7] text-[#A75D3D]"><WalletCards className="size-5" /></div><div className="min-w-0 flex-1"><h3 className="font-bold text-[#263A33]">OpenAI API 크레딧</h3><p className="mt-1 text-sm leading-6 text-[#74807A]">프로젝트 API 키로는 선불 크레딧의 남은 금액을 안전하게 자동 조회할 수 없습니다. 아래 OpenAI 결제 화면에서 현재 잔액을 확인할 수 있습니다.</p><Button asChild variant="outline" className="mt-4 h-10 rounded-xl"><a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">잔액 확인<ExternalLink className="size-4" /></a></Button></div></div>
    </section>
  </section>
}
