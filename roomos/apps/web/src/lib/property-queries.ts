import { prisma } from "@roomos/db"

export type PropertyRow = {
  id: string
  padsplitPropertyId: string | null
  address: string
  city: string | null
  state: string | null
  ownerName: string | null
  status: "ACTIVE" | "ONBOARDING" | "PENDING_APPROVAL"
  occupants: number
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  movingRooms: number
  crossListedRoomCount: number
}

export async function getPropertiesForList(orgId: string): Promise<PropertyRow[]> {
  const crossListed = await getCrossListedRooms(orgId)
  const crossCountByProperty = new Map<string, number>()
  for (const r of crossListed) {
    crossCountByProperty.set(r.propertyId, (crossCountByProperty.get(r.propertyId) ?? 0) + 1)
  }

  const properties = await prisma.property.findMany({
    where: { orgId },
    include: {
      owner: { select: { name: true } },
      rooms: {
        include: {
          listings: {
            where: { isActive: true },
            include: {
              occupancies: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { address: "asc" },
  })

  return properties.map((p) => {
    let occupied = 0
    let vacant = 0
    let moving = 0
    for (const room of p.rooms) {
      const latest = room.listings[0]?.occupancies[0]
      switch (latest?.status) {
        case "OCCUPIED": occupied++; break
        case "MOVING_IN":
        case "MOVING_OUT": moving++; break
        case "VACANT":
        case "INACTIVE":
        case "WAITING_APPROVAL":
        case undefined:
        default: vacant++; break
      }
    }
    return {
      id: p.id,
      padsplitPropertyId: p.padsplitPropertyId,
      address: p.address,
      city: p.city,
      state: p.state,
      ownerName: p.owner?.name ?? null,
      status: "ACTIVE",                     // status logic deferred to Phase 2D
      occupants: occupied,
      totalRooms: p.rooms.length,
      occupiedRooms: occupied,
      vacantRooms: vacant,
      movingRooms: moving,
      crossListedRoomCount: crossCountByProperty.get(p.id) ?? 0,
    }
  })
}

export type RoomDetail = {
  roomId: string
  roomNumber: string
  status: string
  member: { id: string; name: string; email: string | null; firstSeenAt: Date } | null
  weeklyRate: number | null
  balance: number | null
  lastPaymentAt: Date | null
  flagBody: string | null
}

export type PropertyDetail = {
  id: string
  padsplitPropertyId: string | null
  address: string
  city: string | null
  state: string | null
  marketName: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  ownerBillingTerms: string | null
  totalRooms: number
  occupiedCount: number
  vacantCount: number
  pastDueAmount: number
  rooms: RoomDetail[]
  flags: { id: string; severity: string; title: string; body: string | null; openedAt: Date }[]
  lastVaultSyncAt: Date | null
}

export async function getPropertyDetail(orgId: string, propertyId: string): Promise<PropertyDetail | null> {
  const p = await prisma.property.findFirst({
    where: { id: propertyId, orgId },
    include: {
      owner: true,
      rooms: {
        orderBy: { roomNumber: "asc" },
        include: {
          listings: {
            where: { isActive: true },
            include: {
              occupancies: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: { member: true },
              },
            },
          },
        },
      },
      flags: { where: { closedAt: null }, orderBy: { openedAt: "desc" } },
    },
  })
  if (!p) return null

  const lastSync = await prisma.syncRun.findFirst({
    where: { orgId, kind: "VAULT_SYNC", status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
  })

  let occupied = 0
  let vacant = 0
  let pastDue = 0
  const rooms: RoomDetail[] = p.rooms.map((room) => {
    const occ = room.listings[0]?.occupancies[0] ?? null
    if (occ?.status === "OCCUPIED") occupied++
    else vacant++
    if (occ?.currentBalance) pastDue += Number(occ.currentBalance)
    return {
      roomId: room.id,
      roomNumber: room.roomNumber ?? "",
      status: occ?.status ?? "VACANT",
      member: occ?.member ? {
        id: occ.member.id,
        name: occ.member.name,
        email: occ.member.email,
        firstSeenAt: occ.member.firstSeenAt,
      } : null,
      weeklyRate: null,
      balance: occ?.currentBalance ? Number(occ.currentBalance) : null,
      lastPaymentAt: occ?.lastPaymentAt ?? null,
      flagBody: null,
    }
  })

  return {
    id: p.id,
    padsplitPropertyId: p.padsplitPropertyId,
    address: p.address,
    city: p.city,
    state: p.state,
    marketName: p.market,
    ownerName: p.owner?.name ?? null,
    ownerEmail: p.owner?.email ?? null,
    ownerPhone: p.owner?.phone ?? null,
    ownerBillingTerms: p.owner?.billingTerms ?? null,
    totalRooms: p.rooms.length,
    occupiedCount: occupied,
    vacantCount: vacant,
    pastDueAmount: pastDue,
    rooms,
    flags: p.flags.map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      body: f.body,
      openedAt: f.openedAt,
    })),
    lastVaultSyncAt: lastSync?.completedAt ?? null,
  }
}

export type UnmappedAirbnbListing = {
  listingId: string
  externalListingId: string
  candidatePropertyId: string | null
  candidatePropertyAddress: string | null
  lastSyncedAt: Date | null
}

export async function getUnmappedAirbnbListings(orgId: string): Promise<UnmappedAirbnbListing[]> {
  const rows = await prisma.platformListing.findMany({
    where: { orgId, platform: "AIRBNB", roomId: null, isActive: true },
    select: { id: true, externalListingId: true, lastSyncedAt: true },
    orderBy: { lastSyncedAt: "desc" },
  })
  // For Phase 2B v1 we don't surface a candidate property — the operator picks any
  // room in the dropdown on the Settings page. (A future pass can derive a candidate
  // from the matcher's PropertyFlag, keyed `airbnb-unmapped-${externalListingId}`.)
  return rows.map((r) => ({
    listingId: r.id,
    externalListingId: r.externalListingId ?? "",
    candidatePropertyId: null,
    candidatePropertyAddress: null,
    lastSyncedAt: r.lastSyncedAt,
  }))
}

export type CrossListedRoom = {
  roomId: string
  propertyId: string
  propertyAddress: string
  roomNumber: string
  platforms: string[]
}

/** A cross-listed room is one mapped to >1 distinct active platform (e.g. PadSplit
 *  AND Airbnb). Derived from active listings — mirrors the worker's cross-listing
 *  detector, which opens a DANGER PropertyFlag for the same condition. */
export async function getCrossListedRooms(orgId: string): Promise<CrossListedRoom[]> {
  const listings = await prisma.platformListing.findMany({
    where: { orgId, isActive: true, roomId: { not: null } },
    select: {
      platform: true,
      roomId: true,
      room: { select: { roomNumber: true, propertyId: true, property: { select: { address: true } } } },
    },
  })
  const byRoom = new Map<string, CrossListedRoom>()
  for (const l of listings) {
    if (!l.roomId || !l.room?.property) continue
    const key = l.roomId
    const entry = byRoom.get(key) ?? {
      roomId: key,
      propertyId: l.room.propertyId,
      propertyAddress: l.room.property.address,
      roomNumber: l.room.roomNumber ?? "",
      platforms: [],
    }
    if (!entry.platforms.includes(l.platform)) entry.platforms.push(l.platform)
    byRoom.set(key, entry)
  }
  return Array.from(byRoom.values()).filter((r) => r.platforms.length > 1)
}
