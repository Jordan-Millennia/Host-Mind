import { prisma } from "@roomos/db"

export async function upsertRoomWithListing(
  orgId: string,
  propertyId: string,
  roomNumber: string,
): Promise<{ roomId: string; listingId: string }> {
  let room = await prisma.room.findFirst({
    where: { orgId, propertyId, roomNumber },
  })
  if (!room) {
    room = await prisma.room.create({ data: { orgId, propertyId, roomNumber } })
  }
  let listing = await prisma.platformListing.findUnique({
    where: { roomId_platform: { roomId: room.id, platform: "PADSPLIT" } },
  })
  if (!listing) {
    listing = await prisma.platformListing.create({
      data: {
        orgId,
        roomId: room.id,
        platform: "PADSPLIT",
        isActive: true,
      },
    })
  }
  return { roomId: room.id, listingId: listing.id }
}
