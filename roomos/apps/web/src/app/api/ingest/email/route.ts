import { timingSafeEqual } from "node:crypto"
import { prisma } from "@roomos/db"
import type { Prisma } from "@roomos/db"
import { parseEmail } from "@/lib/ingest/route-email"
import { persistParsedEmail } from "@/lib/ingest/persist"
import type { RawEmail } from "@/lib/ingest/types"

// Real-time email feed. The Apps Script forwarder POSTs raw platform notification
// emails here; we parse, persist, and record an EmailEvent. Prisma → node runtime.
export const runtime = "nodejs"

/** Shared-secret gate (constant-time). 503 until configured — never left open. */
function authorized(req: Request): { ok: boolean; configured: boolean } {
  const secret = process.env.EMAIL_INGEST_SECRET
  if (!secret) return { ok: false, configured: false }
  const provided = req.headers.get("x-ingest-secret") ?? new URL(req.url).searchParams.get("secret") ?? ""
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return { ok: a.length === b.length && timingSafeEqual(a, b), configured: true }
}

function senderDomain(from: string): string {
  return from.match(/@([\w.-]+)/)?.[1] ?? "unknown"
}

export async function POST(req: Request): Promise<Response> {
  const auth = authorized(req)
  if (!auth.configured) return Response.json({ error: "not configured" }, { status: 503 })
  if (!auth.ok) return Response.json({ error: "unauthorized" }, { status: 401 })

  const raw = (await req.json().catch(() => null)) as RawEmail | null
  if (!raw?.messageId) return Response.json({ error: "bad payload" }, { status: 400 })

  // Idempotency: a Gmail message is processed once. A retried POST just acks.
  const seen = await prisma.emailEvent.findUnique({ where: { messageId: raw.messageId } })
  if (seen) return Response.json({ ok: true, deduped: true })

  const org = await prisma.org.findFirst({ select: { id: true } }) // single-org
  if (!org) return Response.json({ error: "no org" }, { status: 500 }) // infra → GAS retries

  const receivedAt = raw.receivedAt ? new Date(raw.receivedAt) : undefined
  const parsed = parseEmail(raw)

  if (!parsed) {
    // No parser claimed it — record for follow-up, ack so GAS doesn't retry forever.
    await prisma.emailEvent.create({
      data: { orgId: org.id, messageId: raw.messageId, source: senderDomain(raw.from), type: "unknown", status: "UNHANDLED", receivedAt },
    })
    return Response.json({ ok: true, handled: false })
  }

  try {
    const result = await persistParsedEmail(org.id, raw.messageId, parsed)
    await prisma.emailEvent.create({
      data: {
        orgId: org.id,
        messageId: raw.messageId,
        source: parsed.source,
        type: parsed.type,
        status: "PARSED",
        parsedJson: { ...parsed, note: result.note } as unknown as Prisma.InputJsonValue,
        receivedAt,
      },
    })
    return Response.json({ ok: true, handled: true, type: parsed.type, note: result.note })
  } catch (err) {
    // Don't record on a transient failure → message id stays unseen, GAS retries.
    return Response.json({ error: "persist failed", detail: String((err as Error).message) }, { status: 500 })
  }
}
