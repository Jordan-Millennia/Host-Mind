import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"

export function mapStatusText(text: string): OccupancyStatus | null {
  switch (text.trim().toUpperCase()) {
    // legacy "## Current Members" vocabulary
    case "ACTIVE":      return "OCCUPIED"   // also the converged PadSplit "ACTIVE"
    case "VACATED":     return "VACANT"
    case "TERMINATED":  return "INACTIVE"
    // sweep v1 SWEEP:roster vocabulary
    case "OCCUPIED":    return "OCCUPIED"
    case "VACANT":      return "VACANT"
    case "NEEDS FLIP":  return "VACANT"     // between tenants — no current occupant
    // converged Stage 3/4 PadSplit financial status vocabulary
    case "BEHIND":      return "OCCUPIED"   // behind on payment but STILL occupying
    case "TERMINATION RISK": return "OCCUPIED"
    case "EVICTION":    return "OCCUPIED"   // still physically in the room
    // shared
    case "MOVING IN":
    case "MOVING_IN":   return "MOVING_IN"
    case "MOVING OUT":
    case "MOVING_OUT":  return "MOVING_OUT"
    case "INACTIVE":    return "INACTIVE"
    default:            return null
  }
}

function parseBalance(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, "").trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export type UpsertOccupancyInput = {
  orgId: string
  listingId: string
  memberId: string | null
  statusText: string
  balanceText: string
}

export async function upsertOccupancyForListing(input: UpsertOccupancyInput): Promise<void> {
  const status = mapStatusText(input.statusText)
  if (!status) return

  const current = await prisma.occupancy.findFirst({
    where: { listingId: input.listingId, leaseEndDate: null },
    orderBy: { createdAt: "desc" },
  })

  // Idempotency check: if the current open occupancy already matches what we're about to write, exit.
  if (
    current &&
    current.status === status &&
    current.memberId === input.memberId
  ) {
    return
  }

  // If there's an open occupancy with a different shape, close it.
  if (current) {
    await prisma.occupancy.update({
      where: { id: current.id },
      data: { leaseEndDate: new Date() },
    })
  }

  const balance = parseBalance(input.balanceText)
  await prisma.occupancy.create({
    data: {
      orgId: input.orgId,
      listingId: input.listingId,
      memberId: input.memberId,
      status,
      currentBalance: balance,
      scrapedAt: new Date(),
    },
  })
}
