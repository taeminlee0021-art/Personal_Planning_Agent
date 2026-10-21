"use client"

import { ChangeEvent, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Trash2 } from "lucide-react"
import type { Photo } from "@/lib/types"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const MAX_PHOTOS = 10

export function PhotoSettings({ photos, addPhoto, updateCaption, movePhoto, removePhoto }: {
  photos: Photo[]
  addPhoto: (file: File) => Promise<void>
  updateCaption: (id: number, caption: string) => Promise<void>
  movePhoto: (id: number, direction: -1 | 1) => Promise<void>
  removePhoto: (id: number) => Promise<void>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const full = photos.length >= MAX_PHOTOS

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploading(true)
    try { await addPhoto(file) } catch { /* toast shown by the caller */ } finally { setUploading(false) }
  }

  async function commitCaption(photo: Photo) {
    const next = (drafts[photo.id] ?? photo.caption).trim()
    if (next === photo.caption) return
    try { await updateCaption(photo.id, next) } catch { /* toast shown by the caller */ }
    setDrafts((current) => { const copy = { ...current }; delete copy[photo.id]; return copy })
  }

  return <section className="mt-8" aria-labelledby="photos-heading">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><h3 id="photos-heading" className="font-display text-xl text-[#2B3561]">내 사진 <span className="text-[#E85D8E]">{photos.length}/{MAX_PHOTOS}</span></h3><p className="mt-1 text-sm text-[#8A8FA8]">오른쪽 메뉴 아래 폴라로이드에 8초마다 한 장씩 보여요. 올릴 때 자동으로 줄여 저장하고, 캡션과 순서를 바꿀 수 있어요.</p></div>
      <input ref={fileInput} type="file" accept="image/*" className="sr-only" aria-label="사진 파일 선택" onChange={(event) => void onPick(event)} />
      <Button type="button" disabled={uploading || full} onClick={() => fileInput.current?.click()} className="h-11 rounded-full bg-[#F48FB1] px-5 text-[#2B3561] hover:bg-[#F27AA5]">{uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}{uploading ? "올리는 중" : full ? "10장까지 저장돼요" : "사진 올리기"}</Button>
    </div>
    {photos.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{photos.map((photo, index) => <article key={photo.id} className="card-soft rounded-[1.25rem] bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.image_data} alt={photo.caption || `사진 ${index + 1}`} className="aspect-[4/5] w-full rounded-xl object-cover" />
      <Input aria-label={`${index + 1}번째 사진 캡션`} maxLength={120} placeholder="캡션" value={drafts[photo.id] ?? photo.caption} onChange={(event) => setDrafts((current) => ({ ...current, [photo.id]: event.target.value }))} onBlur={() => void commitCaption(photo)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur() } }} className="mt-2 h-9 border-0 border-b border-dashed border-[#E3DCEA] bg-transparent px-1 text-center text-sm shadow-none focus-visible:ring-0" />
      <div className="mt-2 flex items-center justify-between">
        <Button type="button" size="icon-sm" variant="ghost" disabled={index === 0} aria-label="앞으로" onClick={() => void movePhoto(photo.id, -1)} className="text-[#5A6185]"><ChevronLeft /></Button>
        <AlertDialog><AlertDialogTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="사진 삭제" className="text-[#C06A84]"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 사진을 삭제할까요?</AlertDialogTitle><AlertDialogDescription>삭제하면 되돌릴 수 없습니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void removePhoto(photo.id)}>삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        <Button type="button" size="icon-sm" variant="ghost" disabled={index === photos.length - 1} aria-label="뒤로" onClick={() => void movePhoto(photo.id, 1)} className="text-[#5A6185]"><ChevronRight /></Button>
      </div>
    </article>)}</div> : <div className="rounded-[1.25rem] border border-dashed border-[#E3DCEA] bg-[#FBF9FC] p-8 text-center"><p className="font-semibold text-[#5A6185]">아직 올린 사진이 없습니다</p><p className="mt-1 text-sm text-[#8A8FA8]">좋아하는 사진을 올리면 오른쪽 폴라로이드에 돌아가며 보여요.</p></div>}
  </section>
}
