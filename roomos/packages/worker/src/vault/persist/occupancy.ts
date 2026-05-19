import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"

export function mapStatusText(text: string): OccupancyStatus | null {
  switch (text.trim().toUpperCase()) {
    case "ACTIVE":           return "OCCUPIED"
    case "VACATED":          return "VACANT"
    case "TERMINATED":       return "INACTIVE"
    case "OCCUPIED":         return "OCCUPIED"
    case "VACANT":           return "VACANT"
    case "NEEDS FLIP":       return "VACANT"
    case "BEHIND":           return "OCCUPIED"
    case "TERMINATION RISK": return "OCCUPIED"
    case "EVICTION":         return "OCCUPIED"
    case "MOVING IN":
    case "MOVING_IN":        return "MOVING_IN"
    case "MOVING OUT":
    case "MOVING_OUT":       return "MOVING_OUT"
    case "INACTIVE":         return "INACTIVE"
    default:                  return null
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

  const balance = parseBalance(input.balanceText)

  if (
    current &&
    current.status === status &&
    current.memberId === input.memberId
  ) {
    const storedBalance = current.currentBalance == null ? null : Number(current.currentBalance)
    // DEBUG: log whenever idempotency fires so we can see values in stderr
    process.stderr.write(
      JSON.stringify({ debug: "idempotency", listing: input.listingId, balance, storedBalance, willUpdate: balance !== storedBalance }) + "\n"
    )
    if (balance !== storedBalance) {
      await prisma.occupancy.update({
        where: { id: current.id },
        data: { currentBalance: balance, scrapedAt: new Date() },
      })
    }
    return
  }

  if (current) {
    await prisma.occupancy.update({
      where: { id: current.id },
      data: { leaseEndDate: new Date() },
    })
  }

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
