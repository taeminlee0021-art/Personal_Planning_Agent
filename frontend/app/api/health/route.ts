const backend = (process.env.BACKEND_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")

export async function GET() {
  try {
    const response = await fetch(`${backend}/health`, { cache: "no-store" })
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    })
  } catch {
    return Response.json(
      { status: "starting" },
      { status: 503, headers: { "cache-control": "no-store" } },
    )
  }
}
