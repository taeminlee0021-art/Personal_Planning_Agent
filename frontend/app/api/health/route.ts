const backend = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
const healthUrl = `${backend}/health`
// Render refuses to wake a sleeping free instance for requests relayed through
// another server (it answers 429 with x-render-routing: hibernate-rate-limited and
// never starts the instance). Only the browser can wake it, so a public https
// health URL is handed to the client while the backend is not ready. /health is
// unauthenticated; every /api route still requires the server-side token.
const wakeUrl = healthUrl.startsWith("https://") ? healthUrl : undefined

function starting(upstream?: number, routing?: string | null) {
  return Response.json(
    { status: "starting", upstream: upstream ?? null, routing: routing ?? null, wake_url: wakeUrl ?? null },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}

export async function GET() {
  try {
    const response = await fetch(healthUrl, { cache: "no-store" })
    if (!response.ok) {
      const routing = response.headers.get("x-render-routing")
      console.log(`health upstream status=${response.status} routing=${routing ?? "-"}`)
      return starting(response.status, routing)
    }
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    })
  } catch {
    console.log("health upstream unreachable")
    return starting()
  }
}
