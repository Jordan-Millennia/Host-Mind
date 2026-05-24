// Persist a parsed email into RoomOS. MVP scope: maintenance tickets become a
// PropertyFlag (acted on — purely additive, no scraper-dedup hazard). Occupancy
// events (move_in/move_out) are captured in EmailEvent for now; mutating Occupancy
// is the next increment (needs careful member/room matching + dedup vs the vault sync).

import { prisma } from "@roomos/db"
import type { ParsedEmail } from "./types"

export type PersistResult = { status: "PARSED" | "ERROR"; note?: string }

/** Compact address normaliser — mirrors the worker matcher so email + scrape agree. */
export function normalizeAddress(s: string): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .replace(/\bnortheast\b/g, "ne").replace(/\bnorthwest\b/g, "nw")
    .replace(/\bsoutheast\b/g, "se").replace(/\bsouthwest\b/g, "sw")
    .replace(/\bnorth\b/g, "n").replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e").replace(/\bwest\b/g, "w")
    .replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g, "dr").replace(/\broad\b/g, "rd").replace(/\bcourt\b/g, "ct")
    .replace(/\blane\b/g, "ln").replace(/\bcircle\b/g, "cir").replace(/\bplace\b/g, "pl")
    .replace(/[,.]/g, "").replace(/\s+/g, " ").trim()
}

export async function persistParsedEmail(orgId: string, messageId: string, parsed: ParsedEmail): Promise<PersistResult> {
  if (parsed.type === "maintenance") return persistMaintenance(orgId, messageId, parsed)
  // move_in / move_out: the structured data is recorded on the EmailEvent row by the
  // caller; occupancy mutation is deferred to the next increment.
  return { status: "PARSED", note: `${parsed.type} captured (occupancy write deferred)` }
}

async function persistMaintenance(
  orgId: string,
  messageId: string,
  parsed: Extract<ParsedEmail, { type: "maintenance" }>,
): Promise<PersistResult> {
  const want = normalizeAddress(parsed.propertyAddress)
  const properties = await prisma.property.findMany({ where: { orgId }, select: { id: true, address: true } })
  const property = properties.find((p) => normalizeAddress(p.address) === want)
  if (!property) {
    return { status: "PARSED", note: `no property match for "${parsed.propertyAddress}" — flag skipped` }
  }

  // Idempotent per ticket (fall back to messageId when a ticket number is absent).
  const sourceRef = `maintenance-ticket-${parsed.ticketNumber ?? messageId}`
  const roomLabel = parsed.room ? `Room ${parsed.room}` : "property"
  const title = `Maintenance: ${parsed.location ?? "ticket"} — ${roomLabel}`
  const body = [parsed.details, parsed.memberName ? `Reported by ${parsed.memberName}` : null]
    .filter(Boolean)
    .join("\n")

  await prisma.propertyFlag.upsert({
    where: { propertyId_source_sourceRef: { propertyId: property.id, source: "EMAIL", sourceRef } },
    create: { orgId, propertyId: property.id, severity: "WARN", title, body, source: "EMAIL", sourceRef },
    update: { title, body, closedAt: null },
  })
  return { status: "PARSED" }
}
