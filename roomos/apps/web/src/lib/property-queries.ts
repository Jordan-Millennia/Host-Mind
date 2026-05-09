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
}

export async function getPropertiesForList(orgId: string): Promise<PropertyRow[]> {
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
