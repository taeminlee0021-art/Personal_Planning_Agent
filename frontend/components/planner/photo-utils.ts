// Browser-side downscale so a photo stays well under the backend's data-URL limit.
const MAX_EDGE = 900
const MAX_LENGTH = 580_000

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 올릴 수 있습니다.")
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new Error("이 이미지 형식은 열 수 없습니다. JPG나 PNG로 다시 저장해 주세요.")
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("이미지를 처리할 수 없습니다.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let quality = 0.82
    let output = canvas.toDataURL("image/jpeg", quality)
    while (output.length > MAX_LENGTH && quality > 0.4) {
      quality -= 0.1
      output = canvas.toDataURL("image/jpeg", quality)
    }
    if (output.length > MAX_LENGTH) throw new Error("사진이 너무 커서 저장할 수 없습니다.")
    return output
  } finally {
    bitmap.close()
  }
}
