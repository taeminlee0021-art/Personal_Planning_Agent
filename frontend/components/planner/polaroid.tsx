"use client"

import { useEffect, useState } from "react"
import { ImagePlus } from "lucide-react"
import type { Photo } from "@/lib/types"

const ROTATE_MS = 8000

export function Polaroid({ photos, onManage }: { photos: Photo[]; onManage: () => void }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (photos.length < 2) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % photos.length), ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [photos.length])

  const safeIndex = photos.length ? index % photos.length : 0
  const current = photos[safeIndex]

  return <div className="card-soft relative rounded-[1.75rem] bg-white p-4 pt-6">
    <span aria-hidden="true" className="absolute left-1/2 top-2 z-10 -translate-x-1/2"><span className="block size-4 rounded-full bg-[#F06292] shadow-[0_2px_4px_rgba(0,0,0,0.25)]" /><span className="mx-auto -mt-0.5 block h-3 w-0.5 bg-[#C9B8E8]" /></span>
    {current ? <>
      <p className="absolute right-4 top-3 text-xs font-medium text-[#8A8FA8]">{safeIndex + 1}/{photos.length}</p>
      <div className="mt-2 rounded-xl bg-[#FBF9FC] p-2 shadow-[0_6px_18px_rgba(190,120,160,0.15)]">
        {/* Data URLs come from the backend, so a plain img avoids Next image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.image_data} alt={current.caption || `사진 ${safeIndex + 1}`} className="aspect-[4/5] w-full rounded-lg object-cover" />
        <p className="mt-2 min-h-5 truncate text-center text-sm text-[#5A6185]" title={current.caption}>{current.caption}</p>
      </div>
      {photos.length > 1 && <div className="mt-3 flex justify-center gap-1.5" role="tablist" aria-label="사진 선택">{photos.map((photo, position) => <button key={photo.id} type="button" role="tab" aria-selected={position === safeIndex} aria-label={`${position + 1}번째 사진`} onClick={() => setIndex(position)} className={`size-2 rounded-full transition ${position === safeIndex ? "bg-[#E85D8E]" : "bg-[#E3DCEA] hover:bg-[#C9B8E8]"}`} />)}</div>}
    </> : <button type="button" onClick={onManage} className="mt-2 grid aspect-[4/5] w-full place-items-center rounded-xl border-2 border-dashed border-[#E3DCEA] bg-[#FBF9FC] text-sm text-[#8A8FA8] hover:border-[#F4A3C0] hover:text-[#4A5590]"><span className="grid place-items-center gap-2"><ImagePlus className="size-6" />내 사진 올리기</span></button>}
  </div>
}
