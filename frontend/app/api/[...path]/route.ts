import type { NextRequest } from "next/server"

const backend = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
const internalToken = process.env.APP_INTERNAL_TOKEN?.trim()

type Context = { params: Promise<{ path: string[] }> }

async function forward(request: NextRequest, context: Context) {
  const { path } = await context.params
  const target = `${backend}/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": request.headers.get("content-type") || "application/json" } : {}),
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body,
      cache: "no-store",
    })
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    })
  } catch {
    return Response.json(
      { error: { code: "backend_unavailable", message: "백엔드 서버에 연결할 수 없습니다." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }
}

export const GET = forward
export const POST = forward
export const PUT = forward
export const DELETE = forward
