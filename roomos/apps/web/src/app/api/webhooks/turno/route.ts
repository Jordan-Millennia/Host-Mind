import { prisma } from "@roomos/db"

// Turno fires this when a cleaning job changes state. On completion we mark the
// room clean: clear the room's cached GHL stage so the worker's next reconcile
// pushes VACANT, and post an internal heads-up. Prisma needs the node runtime.
export const runtime = "nodejs"

/** Shared-secret gate. A data-mutating webhook is never left open. */
function authorized(req: Request): { ok: boolean; configured: boolean } {
  const secret = process.env.TURNO_WEBHOOK_SECRET
  if (!secret) return { ok: false, configured: false }
  const provided = req.headers.get("x-turno-secret") ?? new URL(req.url).searchParams.get("secret")
  return { ok: provided === secret, configured: true }
}

async function notify(message: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  }).catch(() => {})
}

export async function POST(req: Request): Promise<Response> {
  const auth = authorized(req)
  if (!auth.configured) return Response.json({ error: "webhook not configured" }, { status: 503 })
  if (!auth.ok) return Response.json({ error: "unauthorized" }, { status: 401 })

  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!payload) return Response.json({ error: "bad payload" }, { status: 400 })

  // Be liberal about Turno's payload shape: accept top-level or nested job objects.
  const job = (payload.project ?? payload.job ?? payload) as Record<string, unknown>
  const status = String(job.status ?? payload.status ?? payload.event ?? "").toLowerCase()
  const jobId = String(job.id ?? payload.id ?? payload.project_id ?? "")

  if (!jobId) return Response.json({ error: "missing job id" }, { status: 400 })
  // Only act on completion-like states; ack everything else so Turno stops retrying.
  if (!/complete|done|finished/.test(status)) return Response.json({ ok: true, ignored: status })

  const occupancy = await prisma.occupancy.findFirst({
    where: { turnoJobId: jobId },
    select: { id: true, listing: { select: { room: { select: { id: true, roomNumber: true, property: { select: { address: true } } } } } } },
  })
  const room = occupancy?.listing.room
  if (!room) return Response.json({ ok: true, matched: false })

  // Clear the cached GHL stage → the worker's next reconcile recomputes + pushes
  // VACANT (the stay has ended, so the room maps to VACANT). DB is source of truth.
  await prisma.room.update({ where: { id: room.id }, data: { ghlStageId: null, ghlSyncedAt: null } })

  const label = room.roomNumber ? `${room.property.address.split(",")[0]} — Room ${room.roomNumber}` : room.property.address
  await notify(`🧹 ${label} is clean and ready (Turno job ${jobId} complete).`)

  return Response.json({ ok: true, matched: true, roomId: room.id })
}
