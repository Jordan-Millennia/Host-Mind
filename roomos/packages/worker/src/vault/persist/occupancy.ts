import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"

export function mapStatusText(text: string): OccupancyStatus | null {
  switch (text) {
    case "Active":      return "OCCUPIED"
    case "VACATED":
    case "Vacant":      return "VACANT"
    case "TERMINATED":  return "INACTIVE"
    case "Moving in":   return "MOVING_IN"
    case "Moving out":  return "MOVING_OUT"
    case "Inactive":    return "INACTIVE"
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
