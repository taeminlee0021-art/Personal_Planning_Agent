"use client"

import { FormEvent, useMemo, useState } from "react"
import { Activity, CalendarDays, Ruler, Save, Scale } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { BodySettings, WeightRecord } from "@/lib/types"
import { dateKey, formatDate } from "@/components/planner/helpers"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { LoadingCards } from "@/components/planner/shared"

const chartConfig = {
  weight: { label: "몸무게", color: "#356859" },
} satisfies ChartConfig

export function WeightView({ loading, settings, records, saveWeight, saveHeight }: {
  loading: boolean
  settings: BodySettings
  records: WeightRecord[]
  saveWeight: (weight: number, measuredOn: string) => Promise<void>
  saveHeight: (height: number) => Promise<void>
}) {
  const [weight, setWeight] = useState("")
  const [measuredOn, setMeasuredOn] = useState(() => dateKey(new Date()))
  const [height, setHeight] = useState(String(settings.height_cm))
  const [saving, setSaving] = useState(false)

  const latest = records.at(-1)
  const bmi = latest ? latest.weight_kg / ((settings.height_cm / 100) ** 2) : null
  const chartData = useMemo(() => records.slice(-16).map((item) => ({
    date: item.measured_on,
    label: formatDate(`${item.measured_on}T12:00:00+09:00`, { month: "numeric", day: "numeric" }),
    weight: item.weight_kg,
  })), [records])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = Number(weight)
    if (!Number.isFinite(value) || value < 20 || value > 400) return
    setSaving(true)
    try {
      await saveWeight(value, measuredOn)
      setWeight("")
    } finally { setSaving(false) }
  }

  async function updateHeight() {
    const value = Number(height)
    if (!Number.isFinite(value) || value <= 50 || value > 250) return
    setSaving(true)
    try { await saveHeight(value) } finally { setSaving(false) }
  }

  if (loading) return <LoadingCards />

  return <section aria-labelledby="weight-heading">
    <div className="mb-6"><p className="mb-1 text-sm font-semibold text-[#356859]">BODY LOG</p><h2 id="weight-heading" className="text-2xl font-bold tracking-tight md:text-3xl">몸무게 기록</h2><p className="mt-2 text-sm text-[#74807A]">매주 같은 조건에서 측정하면 변화를 비교하기 쉽습니다.</p></div>

    <div className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-[1.3rem] bg-[#183D35] p-5 text-white"><div className="flex items-center gap-2 text-[#CDE0D8]"><Scale className="size-5" /><p className="text-sm font-semibold">최근 몸무게</p></div><p className="mt-5 text-3xl font-bold">{latest ? `${latest.weight_kg.toFixed(1)} kg` : "기록 없음"}</p>{latest && <p className="mt-2 text-sm text-[#CDE0D8]">{formatDate(`${latest.measured_on}T12:00:00+09:00`, { year: "numeric", month: "long", day: "numeric" })}</p>}</article>
      <article className="rounded-[1.3rem] border bg-white p-5"><div className="flex items-center gap-2 text-[#356859]"><Activity className="size-5" /><p className="text-sm font-semibold">현재 BMI</p></div><p className="mt-5 text-3xl font-bold text-[#253A32]">{bmi ? bmi.toFixed(1) : "—"}</p><p className="mt-2 text-sm text-[#7A8580]">몸무게 ÷ 키²로 계산한 참고 지표</p></article>
      <article className="rounded-[1.3rem] border bg-white p-5"><div className="flex items-center gap-2 text-[#356859]"><Ruler className="size-5" /><p className="text-sm font-semibold">키</p></div><div className="mt-4 flex items-center gap-2"><Input aria-label="키 센티미터" type="number" min={51} max={250} step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} className="h-11" /><span className="shrink-0 text-sm text-[#66736D]">cm</span></div><Button type="button" variant="outline" disabled={saving} onClick={() => void updateHeight()} className="mt-3 h-10 w-full">키 저장</Button></article>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.5fr)]">
      <form onSubmit={submit} className="rounded-[1.3rem] border bg-white p-5 sm:p-6"><div className="flex items-center gap-2 text-[#356859]"><CalendarDays className="size-5" /><h3 className="font-bold text-[#263A33]">측정값 입력</h3></div><label className="mt-5 grid gap-1.5 text-sm font-medium text-[#3B4D46]">측정일<Input required type="date" value={measuredOn} onChange={(event) => setMeasuredOn(event.target.value)} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium text-[#3B4D46]">몸무게 (kg)<Input required autoFocus type="number" min={20} max={400} step="0.1" inputMode="decimal" placeholder="예: 72.4" value={weight} onChange={(event) => setWeight(event.target.value)} /></label><Button type="submit" disabled={saving || !weight} className="mt-5 h-11 w-full bg-[#183D35] hover:bg-[#28564A]"><Save />{saving ? "저장 중" : "기록 저장"}</Button><p className="mt-3 text-xs leading-5 text-[#87908C]">같은 날짜를 다시 저장하면 기존 기록이 수정됩니다.</p></form>

      <section aria-labelledby="weight-chart-heading" className="min-w-0 rounded-[1.3rem] border bg-white p-4 sm:p-6"><div className="mb-4"><h3 id="weight-chart-heading" className="font-bold text-[#263A33]">주간 변화</h3><p className="mt-1 text-sm text-[#7A8580]">최근 16회 기록</p></div>{chartData.length ? <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto"><LineChart accessibilityLayer data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} width={38} tickFormatter={(value) => `${value}`} /><ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)} kg`} />} /><Line type="monotone" dataKey="weight" stroke="var(--color-weight)" strokeWidth={3} dot={{ fill: "var(--color-weight)", r: 4 }} activeDot={{ r: 6 }} /></LineChart></ChartContainer> : <div className="grid h-[280px] place-items-center rounded-xl border border-dashed bg-[#FAFBF9] text-center"><div><Scale className="mx-auto size-7 text-[#9AA49F]" /><p className="mt-3 font-medium text-[#56655F]">첫 몸무게를 기록해 보세요</p><p className="mt-1 text-sm text-[#8A938F]">기록이 쌓이면 주간 변화가 선으로 표시됩니다.</p></div></div>}</section>
    </div>
  </section>
}
