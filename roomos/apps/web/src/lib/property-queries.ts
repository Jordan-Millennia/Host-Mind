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
