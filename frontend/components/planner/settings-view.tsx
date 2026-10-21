"use client"

import { FormEvent } from "react"
import { ExternalLink, Flame, Pencil, Plus, Repeat2, Trash2 } from "lucide-react"
import type { Preferences, RecurringTask } from "@/lib/types"
import { RecurringDialog } from "@/components/planner/recurring-dialog"
import { formatDate } from "@/components/planner/helpers"
import { LoadingCards } from "@/components/planner/shared"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const weekdays = ["월", "화", "수", "목", "금", "토", "일"]
const iconTones = ["bg-[#DCEBFF] text-[#4B4382]", "bg-[#FCE4EE] text-[#D9456B]", "bg-[#FFF3B0] text-[#A66A1E]", "bg-[#E8E3FB] text-[#6F62B5]"]

function cadenceLabel(item: RecurringTask) {
  return item.cadence === "DAILY" ? "매일" : item.cadence === "MONTHLY" ? `매월 ${Number(item.start_date.slice(8, 10))}일` : item.weekdays.map((day) => weekdays[day]).join(" · ")
}

function SettingRow({ title, description, children, last }: { title: string; description: string; children: React.ReactNode; last?: boolean }) {
  return <div className={`flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between ${last ? "" : "border-b border-dashed border-[#E3DCEA]"}`}>
    <div className="min-w-0"><p className="font-semibold text-[#2F3660]">{title}</p><p className="mt-1 text-sm leading-6 text-[#8A8FA8]">{description}</p></div>
    <div className="shrink-0">{children}</div>
  </div>
}

export function SettingsView({ loading, recurringTasks, preferences, setPreferences, onRecurringSaved, toggleRecurringTask, removeRecurringTask, savePreferences }: {
  loading: boolean
  recurringTasks: RecurringTask[]
  preferences: Preferences
  setPreferences: (value: Preferences) => void
  onRecurringSaved: (saved: RecurringTask) => void
  toggleRecurringTask: (item: RecurringTask) => Promise<void>
  removeRecurringTask: (id: number) => Promise<void>
  savePreferences: (event: FormEvent) => Promise<void>
}) {
  return <section aria-labelledby="settings-heading">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-[#E85D8E]">SETTINGS</p><h2 id="settings-heading" className="font-display text-xl text-[#2B3561] md:text-2xl">내 생활에 맞게 설정해요</h2></div>
      <RecurringDialog trigger={<Button className="h-11 rounded-full bg-[#2B3561] px-5 hover:bg-[#3A4578]"><Plus />반복 작업 추가</Button>} onSaved={onRecurringSaved} />
    </div>

    <section aria-labelledby="recurring-heading">
      <div className="mb-3 flex items-end justify-between gap-3"><div><h3 id="recurring-heading" className="font-display text-xl text-[#2B3561]">반복 작업 <span className="text-[#E85D8E]">{recurringTasks.length}</span></h3><p className="mt-1 text-sm text-[#8A8FA8]">매일, 선택한 요일, 또는 매월 지정한 날짜에 오늘 목록에 자동 등록됩니다.</p></div></div>
      {loading ? <LoadingCards /> : recurringTasks.length ? <div className="grid gap-3">{recurringTasks.map((item, index) => <div key={item.id} className={`card-soft flex items-center gap-3 rounded-[1.25rem] bg-white p-3 pr-2 sm:p-4 sm:pr-3 ${item.active ? "" : "opacity-60"}`}>
        <div className={`grid size-11 shrink-0 place-items-center rounded-full ${iconTones[index % iconTones.length]}`}><Repeat2 className="size-5" /></div>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#2F3660]">{item.title}</p><p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[#8A8FA8]"><Flame className="size-3.5 text-[#F0863A]" aria-hidden="true" />{cadenceLabel(item)}<span>·</span>{formatDate(`${item.start_date}T12:00:00+09:00`, { month: "short", day: "numeric" })}부터{!item.active && <><span>·</span><span className="font-medium text-[#C06A84]">중지됨</span></>}</p></div>
        <Switch checked={item.active} onCheckedChange={() => void toggleRecurringTask(item)} aria-label={`${item.title} 반복 사용`} className="data-[state=checked]:bg-[#E85D8E]" />
        <RecurringDialog item={item} trigger={<Button size="icon" variant="ghost" aria-label="반복 작업 수정" className="text-[#5A6185]"><Pencil /></Button>} onSaved={onRecurringSaved} />
        <AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label="반복 작업 삭제" className="text-[#C06A84]"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>‘{item.title}’ 반복을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>앞으로 자동 등록되지 않습니다. 이미 만들어진 오늘 기록은 유지됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removeRecurringTask(item.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>)}</div> : <div className="rounded-[1.25rem] border border-dashed border-[#E3DCEA] bg-[#FBF9FC] p-8 text-center"><p className="font-semibold text-[#5A6185]">등록된 반복 작업이 없습니다</p><p className="mt-1 text-sm text-[#8A8FA8]">운동, 약 복용, 주간 정리 같은 습관을 추가해 보세요.</p></div>}
    </section>

    <form onSubmit={savePreferences} className="card-soft mt-8 rounded-[1.5rem] bg-white px-5 pb-5 pt-2 sm:px-6">
      <div className="pt-4"><h3 className="font-display text-xl text-[#2B3561]">계획 가능 시간</h3><p className="mt-1 text-sm text-[#8A8FA8]">한국 시간 기준, AI 플래너가 일정을 배치할 수 있는 범위입니다.</p></div>
      <SettingRow title="평일" description="월요일부터 금요일까지 계획을 넣을 수 있는 시간">
        <div className="flex items-center gap-2"><Input aria-label="평일 시작" type="time" value={preferences.weekday_available_from.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekday_available_from: event.target.value })} className="h-11 w-32" /><span className="text-sm text-[#8A8FA8]">~</span><Input aria-label="평일 종료" type="time" value={preferences.weekday_available_until.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekday_available_until: event.target.value })} className="h-11 w-32" /></div>
      </SettingRow>
      <SettingRow title="주말" description="토요일과 일요일에 계획을 넣을 수 있는 시간">
        <div className="flex items-center gap-2"><Input aria-label="주말 시작" type="time" value={preferences.weekend_available_from.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekend_available_from: event.target.value })} className="h-11 w-32" /><span className="text-sm text-[#8A8FA8]">~</span><Input aria-label="주말 종료" type="time" value={preferences.weekend_available_until.slice(0, 5)} onChange={(event) => setPreferences({ ...preferences, weekend_available_until: event.target.value })} className="h-11 w-32" /></div>
      </SettingRow>
      <SettingRow title="하루 최대 계획 시간" description="하루에 배치할 수 있는 개인 계획의 합계(분)" last>
        <div className="flex items-center gap-2"><Input aria-label="하루 최대 분" type="number" min={1} max={1440} value={preferences.max_daily_planning_minutes} onChange={(event) => setPreferences({ ...preferences, max_daily_planning_minutes: Number(event.target.value) })} className="h-11 w-28" /><span className="text-sm text-[#8A8FA8]">분</span></div>
      </SettingRow>
      <div className="flex justify-end border-t border-dashed border-[#E3DCEA] pt-4"><Button type="submit" className="h-11 rounded-full bg-[#2B3561] px-6 hover:bg-[#3A4578]">시간 설정 저장</Button></div>
    </form>

    <section className="card-soft mt-6 rounded-[1.5rem] bg-white px-5 sm:px-6">
      <SettingRow title="OpenAI API 크레딧" description="프로젝트 API 키로는 선불 크레딧의 남은 금액을 안전하게 자동 조회할 수 없습니다. OpenAI 결제 화면에서 현재 잔액을 확인할 수 있습니다." last>
        <Button asChild variant="outline" className="h-10 rounded-full bg-white px-4"><a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">잔액 확인<ExternalLink className="size-4" /></a></Button>
      </SettingRow>
    </section>
  </section>
}
