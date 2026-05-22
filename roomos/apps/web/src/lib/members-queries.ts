import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"

export type MemberListRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  dossierPath: string | null
  /** OCCUPIED / VACANT / MOVING_IN / MOVING_OUT / INACTIVE / null (no open occupancy) */
  status: OccupancyStatus | null
  property: { id: string; address: string } | null
  roomNumber: string | null
  /** Latest balance from the open occupancy. Negative = past due owed. */
  balance: number | null
  occupancySince: Date | null
  /** Most recent PaymentEvent (any type) — null if member has never paid in-system. */
  lastPaidDate: Date | null
  lastPaidAmount: number | null
}

export type MemberListResult = {
  rows: MemberListRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type MemberListFilter = {
  /** Free-text search against member name (case-insensitive contains). */
  search?: string
  /** Restrict to one occupancy status. */
  status?: OccupancyStatus
  /** Default true = only members with an open (active) occupancy. */
  activeOnly?: boolean
  /** Sort key. Default "balance-asc" (most past-due first). */
  sort?: "balance-asc" | "balance-desc" | "name-asc" | "name-desc" | "recent"
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 50

export async function getMembersForList(
  orgId: string,
  f: MemberListFilter = {},
): Promise<MemberListResult> {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.max(1, Math.min(200, f.pageSize ?? DEFAULT_PAGE_SIZE))
  const activeOnly = f.activeOnly ?? true

  const openOccupancyFilter = activeOnly
    ? { occupancies: { some: { leaseEndDate: null, ...(f.status ? { status: f.status } : {}) } } }
    : {}

  const where = {
    orgId,
    ...openOccupancyFilter,
    ...(f.search ? { name: { contains: f.search, mode: "insensitive" as const } } : {}),
  }

  const total = await prisma.member.count({ where })

  const members = await prisma.member.findMany({
    where,
    orderBy: orderByFromSort(f.sort),
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      occupancies: {
        where: { leaseEndDate: null, ...(f.status ? { status: f.status } : {}) },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          listing: {
            include: {
              room: {
                include: { property: { select: { id: true, address: true } } },
              },
            },
          },
        },
      },
      paymentEvents: {
        orderBy: { eventDate: "desc" },
        take: 1,
        select: { eventDate: true, amount: true },
      },
    },
  })

  const rows: MemberListRow[] = members.map((m) => {
    const occ = m.occupancies[0]
    const lastPay = m.paymentEvents[0]
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      dossierPath: m.memberDossierPath,
      status: occ?.status ?? null,
      property: occ?.listing.room?.property
        ? { id: occ.listing.room.property.id, address: occ.listing.room.property.address }
        : null,
      roomNumber: occ?.listing.room?.roomNumber ?? null,
      balance: occ?.currentBalance == null ? null : Number(occ.currentBalance),
      occupancySince: occ?.scrapedAt ?? null,
      lastPaidDate: lastPay?.eventDate ?? null,
      lastPaidAmount: lastPay?.amount == null ? null : Number(lastPay.amount),
    }
  })

  // Prisma can't directly orderBy a related-record's currentBalance. When the
  // user asked for a balance sort, re-sort in-memory after fetch (page is
  // ≤200 rows so this is cheap and predictable).
  if (f.sort === "balance-asc" || f.sort === "balance-desc") {
    const dir = f.sort === "balance-asc" ? 1 : -1
    rows.sort((a, b) => {
      const av = a.balance ?? Number.POSITIVE_INFINITY * dir // nulls last
      const bv = b.balance ?? Number.POSITIVE_INFINITY * dir
      return (av - bv) * dir
    })
  }

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

function orderByFromSort(sort?: MemberListFilter["sort"]) {
  switch (sort) {
    case "name-asc":  return { name: "asc" as const }
    case "name-desc": return { name: "desc" as const }
    case "recent":    return { firstSeenAt: "desc" as const }
    // balance sorts: prisma can't order by the included occupancy's balance,
    // so seed with a stable secondary sort (name) and re-sort in-memory above.
    case "balance-asc":
    case "balance-desc":
    default:          return { name: "asc" as const }
  }
}

export type MemberDetail = {
  id: string
  name: string
  email: string | null
  phone: string | null
  dossierPath: string | null
  firstSeenAt: Date
  current: {
    status: OccupancyStatus
    property: { id: string; address: string }
    roomNumber: string | null
    balance: number | null
    since: Date | null
  } | null
  history: Array<{
    id: string
    status: OccupancyStatus
    propertyAddress: string
    roomNumber: string | null
    balance: number | null
    leaseStartedAt: Date | null
    leaseEndedAt: Date | null
  }>
  payments: Array<{
    id: string
    eventDate: Date
    amount: number
    eventType: string
  }>
}

export async function getMemberById(
  orgId: string,
  memberId: string,
): Promise<MemberDetail | null> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      occupancies: {
        orderBy: { createdAt: "desc" },
        include: {
          listing: {
            include: {
              room: {
                include: { property: { select: { id: true, address: true } } },
              },
            },
          },
        },
      },
      paymentEvents: {
        orderBy: { eventDate: "desc" },
        select: { id: true, eventDate: true, amount: true, eventType: true },
      },
    },
  })
  if (!member) return null

  const open = member.occupancies.find((o) => o.leaseEndDate == null)
  const openRoom = open?.listing.room ?? null
  const current = open && openRoom
    ? {
        status: open.status,
        property: {
          id: openRoom.property.id,
          address: openRoom.property.address,
        },
        roomNumber: openRoom.roomNumber,
        balance: open.currentBalance == null ? null : Number(open.currentBalance),
        since: open.scrapedAt,
      }
    : null

  const history = member.occupancies.map((o) => ({
    id: o.id,
    status: o.status,
    propertyAddress: o.listing.room?.property.address ?? "(unmapped listing)",
    roomNumber: o.listing.room?.roomNumber ?? null,
    balance: o.currentBalance == null ? null : Number(o.currentBalance),
    leaseStartedAt: o.scrapedAt,
    leaseEndedAt: o.leaseEndDate,
  }))

  const payments = member.paymentEvents.map((p) => ({
    id: p.id,
    eventDate: p.eventDate,
    amount: Number(p.amount),
    eventType: p.eventType,
  }))

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    phone: member.phone,
    dossierPath: member.memberDossierPath,
    firstSeenAt: member.firstSeenAt,
    current,
    history,
    payments,
  }
}
