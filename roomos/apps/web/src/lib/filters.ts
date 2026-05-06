export type StatusFilter =
  | "all" | "past_due" | "vacant" | "moving" | "needs_flip" | "occupied"

export type SortKey = "address" | "balance" | "move_in" | "lease_end" | "member"

export type RoomFilter = {
  status: StatusFilter
  ownerId: string | null
  propertyId: string | null
  q: string
  sort: SortKey
  page: number  // 1-indexed
}

const STATUS_VALUES: StatusFilter[] = ["all", "past_due", "vacant", "moving", "needs_flip", "occupied"]
const SORT_VALUES: SortKey[] = ["address", "balance", "move_in", "lease_end", "member"]

function pickEnum<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  if (!raw) return fallback
  return (allowed as string[]).includes(raw) ? (raw as T) : fallback
}

export function parseSearchParams(sp: URLSearchParams): RoomFilter {
  const pageRaw = parseInt(sp.get("page") ?? "1", 10)
  return {
    status: pickEnum(sp.get("status"), STATUS_VALUES, "all"),
    ownerId: sp.get("ownerId") || null,
    propertyId: sp.get("propertyId") || null,
    q: sp.get("q") ?? "",
    sort: pickEnum(sp.get("sort"), SORT_VALUES, "address"),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
  }
}

const ACTIVE_OCC_STATUSES = ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] as const
const MOVING_OCC_STATUSES = ["MOVING_IN", "MOVING_OUT"] as const

/** Returns a Prisma-shaped `where` for the rooms table. */
export function buildWhereClause(orgId: string, f: RoomFilter): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId }

  if (f.ownerId) where.property = { ownerId: f.ownerId }
  if (f.propertyId) where.propertyId = f.propertyId

  if (f.q) {
    const ic = { contains: f.q, mode: "insensitive" as const }
    where.OR = [
      { property: { address: ic } },
      { property: { name: ic } },
      { listings: { some: { occupancies: { some: { member: { name: ic } } } } } },
    ]
  }

  switch (f.status) {
    case "past_due":
      where.listings = {
        some: {
          occupancies: {
            some: {
              status: { in: ACTIVE_OCC_STATUSES as unknown as string[] },
              daysPastDue: { gte: 1 },
              currentBalance: { gt: 0 },
            },
          },
        },
      }
      break
    case "vacant":
      where.listings = {
        some: { occupancies: { none: { status: { in: ACTIVE_OCC_STATUSES as unknown as string[] } } } },
      }
      break
    case "moving":
      where.listings = {
        some: { occupancies: { some: { status: { in: MOVING_OCC_STATUSES as unknown as string[] } } } },
      }
      break
    case "needs_flip":
      where.listings = {
        some: { occupancies: { some: { status: "NEEDS_FLIP" } } },
      }
      break
    case "occupied":
      where.listings = {
        some: { occupancies: { some: { status: "OCCUPIED" } } },
      }
      break
    case "all":
    default:
      // no extra clause
  }

  return where
}
