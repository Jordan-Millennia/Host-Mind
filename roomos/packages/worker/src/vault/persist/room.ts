import { prisma } from "@roomos/db"

export async function upsertRoomWithListing(
  orgId: string,
  propertyId: string,
  roomNumber: string,
  padsplitPropertyId: string,
): Promise<{ roomId: string; listingId: string }> {
  let room = await prisma.room.findFirst({
    where: { orgId, propertyId, roomNumber },
  })
  if (!room) {
    room = await prisma.room.create({ data: { orgId, propertyId, roomNumber } })
  }
  // Phase 2B: PlatformListing's lookup key is now (platform, externalListingId).
  // Give every PadSplit listing a stable per-(property, room) external id so it
  // upserts deterministically and so the Airbnb matcher has a comparable key.
  const externalListingId = `${padsplitPropertyId}:${roomNumber}`
  const listing = await prisma.platformListing.upsert({
    where: {
      platform_externalListingId: { platform: "PADSPLIT", externalListingId },
    },
    create: {
      orgId,
      roomId: room.id,
      platform: "PADSPLIT",
      externalListingId,
      isActive: true,
    },
    update: { roomId: room.id, isActive: true },
  })
  return { roomId: room.id, listingId: listing.id }
}
