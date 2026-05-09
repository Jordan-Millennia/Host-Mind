import { prisma, OccupancyStatus } from "@roomos/db"
import type { RoomFilter } from "./filters"
import { buildWhereClause } from "./filters"

const ACTIVE_OCC_STATUSES: OccupancyStatus[] = [
  OccupancyStatus.OCCUPIED,
  OccupancyStatus.MOVING_IN,
  OccupancyStatus.MOVING_OUT,
]

export type RoomCardData = {
  roomId: string
  propertyAddress: string
  propertyCity: string | null
  ownerName: string | null
  roomNumber: string | null
  externalRoomId: string | null
  status: "OCCUPIED" | "MOVING_IN" | "MOVING_OUT" | "VACANT" | "NEEDS_FLIP" | "WAITING_APPROVAL" | "INACTIVE"
  memberName: string | null
  memberMonthsTenure: number | null
  currentBalance: string | null
  daysPastDue: number | null
  moveInDate: Date | null
  leaseEndDate: Date | null
  vacantSinceDays: number | null
  lastSyncedAt: Date | null
}

/** Top-of-page KPI counts. */
export async function getKpiCounts(orgId: string) {
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [totalRooms, pastDue, vacant, movingThisWeek] = await Promise.all([
    prisma.room.count({ where: { orgId } }),
    prisma.occupancy.count({
      where: {
        orgId,
        status: { in: ACTIVE_OCC_STATUSES },
        daysPastDue: { gte: 1 },
        currentBalance: { gt: 0 },
      },
    }),
    prisma.room.count({
      where: {
        orgId,
        listings: { some: { occupancies: { none: { status: { in: ACTIVE_OCC_STATUSES } } } } },
      },
    }),
    prisma.occupancy.count({
      where: {
        orgId,
        status: { in: [OccupancyStatus.MOVING_IN, OccupancyStatus.MOVING_OUT] },
        OR: [
          { moveInDate: { gte: now, lte: weekFromNow } },
          { leaseEndDate: { gte: now, lte: weekFromNow } },
        ],
      },
    }),
  ])

  const balanceAggregate = await prisma.occupancy.aggregate({
    _sum: { currentBalance: true },
    where: {
      orgId,
      status: { in: ACTIVE_OCC_STATUSES },
      daysPastDue: { gte: 1 },
      currentBalance: { gt: 0 },
    },
  })

  return {
    totalRooms,
    pastDue,
    pastDueAmount: balanceAggregate._sum?.currentBalance ?? "0",
    vacant,
    movingThisWeek,
  }
}

/** Rooms grouped by status for the home view. Each section caps at `limit`. */
export async function getRoomsByStatus(
  orgId: string,
  status: "past_due" | "vacant" | "moving" | "needs_flip",
  limit = 8,
): Promise<RoomCardData[]> {
  const filter: RoomFilter = { status, ownerId: null, propertyId: null, q: "", sort: "address", page: 1 }
  const where = buildWhereClause(orgId, filter)
  const rooms = await prisma.room.findMany({
    where,
    take: limit,
    orderBy: [{ property: { address: "asc" } }, { roomNumber: "asc" }],
    include: {
      property: { include: { owner: true } },
      listings: {
        where: { platform: "PADSPLIT" },
        include: {
          occupancies: { orderBy: { createdAt: "desc" }, take: 1, include: { member: true } },
        },
      },
    },
  })
  return rooms.map(toRoomCardData)
}

/** Paginated, fully-filterable result for the All Rooms table. */
export async function getAllRoomsFiltered(orgId: string, f: RoomFilter, pageSize = 50) {
  const where = buildWhereClause(orgId, f)
  const orderBy = sortToOrderBy(f.sort)
  const [rows, total] = await Promise.all([
    prisma.room.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * pageSize,
      take: pageSize,
      include: {
        property: { include: { owner: true } },
        listings: {
          where: { platform: "PADSPLIT" },
          include: {
            occupancies: { orderBy: { createdAt: "desc" }, take: 1, include: { member: true } },
          },
        },
      },
    }),
    prisma.room.count({ where }),
  ])
  return {
    rows: rows.map(toRoomCardData),
    total,
    page: f.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

function sortToOrderBy(sort: RoomFilter["sort"]) {
  const byAddress = [{ property: { address: "asc" as const } }]
  switch (sort) {
    case "address": return [...byAddress, { roomNumber: "asc" as const }]
    default: return byAddress
  }
}

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (30 * 24 * 60 * 60 * 1000)))
}

interface RoomRow {
  id: string
  roomNumber: string | null
  property: { address: string; city: string | null; owner: { name: string | null } | null }
  listings: Array<{
    externalListingId: string | null
    lastSyncedAt: Date | null
    occupancies: Array<{
      status: string
      memberId: string | null
      moveInDate: Date | null
      leaseEndDate: Date | null
      daysPastDue: number | null
      currentBalance: { toString(): string } | null
      member: { name: string } | null
    }>
  }>
}

function toRoomCardData(r: RoomRow): RoomCardData {
  const listing = r.listings[0]
  const occupancy = listing?.occupancies?.[0]
  const owner = r.property.owner
  const status = (occupancy?.status ?? "VACANT") as RoomCardData["status"]
  const now = new Date()

  return {
    roomId: r.id,
    propertyAddress: r.property.address,
    propertyCity: r.property.city,
    ownerName: owner?.name ?? null,
    roomNumber: r.roomNumber,
    externalRoomId: listing?.externalListingId ?? null,
    status,
    memberName: occupancy?.member?.name ?? null,
    memberMonthsTenure:
      occupancy?.member && occupancy.moveInDate ? monthsBetween(occupancy.moveInDate, now) : null,
    currentBalance: occupancy?.currentBalance ? occupancy.currentBalance.toString() : null,
    daysPastDue: occupancy?.daysPastDue ?? null,
    moveInDate: occupancy?.moveInDate ?? null,
    leaseEndDate: occupancy?.leaseEndDate ?? null,
    vacantSinceDays: !occupancy && listing?.lastSyncedAt
      ? Math.floor((now.getTime() - listing.lastSyncedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    lastSyncedAt: listing?.lastSyncedAt ?? null,
  }
}

/** Single-room view payload. */
export async function getRoomDetail(orgId: string, roomId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, orgId },
    include: {
      property: { include: { owner: true } },
      listings: {
        include: {
          occupancies: { orderBy: { createdAt: "desc" }, take: 5, include: { member: true } },
        },
      },
    },
  })
  if (!room) return null

  const padsplit = room.listings.find((l) => l.platform === "PADSPLIT")
  const memberId = padsplit?.occupancies[0]?.memberId

  const paymentEvents = memberId
    ? await prisma.paymentEvent.findMany({
        where: { orgId, memberId },
        orderBy: { eventDate: "desc" },
        take: 10,
      })
    : []

  const recentSyncs = await prisma.syncRun.findMany({
    where: { orgId, platform: "PADSPLIT" },
    orderBy: { startedAt: "desc" },
    take: 5,
  })

  return { room, paymentEvents, recentSyncs }
}

/** Recent sync_runs (for the activity panel & sync-pill click target). */
export async function getRecentSyncRuns(orgId: string, take = 20) {
  return prisma.syncRun.findMany({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    take,
  })
}

/** Lookup data for the FilterBar dropdowns. */
export async function getFilterOptions(orgId: string) {
  const [owners, properties] = await Promise.all([
    prisma.owner.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.property.findMany({ where: { orgId }, orderBy: { address: "asc" }, select: { id: true, address: true } }),
  ])
  return { owners, properties }
}
