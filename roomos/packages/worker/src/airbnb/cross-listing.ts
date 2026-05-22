import { prisma } from "@roomos/db"

export type CrossListingResult = { flagged: number; closed: number }

export async function detectAndFlagCrossListings(orgId: string): Promise<CrossListingResult> {
  // Step 1: Find every room with >1 distinct active platform.
  const activeListings = await prisma.platformListing.findMany({
    where: { orgId, isActive: true, roomId: { not: null } },
    select: { roomId: true, platform: true, room: { select: { propertyId: true } } },
  })
  const byRoom = new Map<string, { platforms: Set<string>; propertyId: string }>()
  for (const l of activeListings) {
    if (!l.roomId || !l.room) continue
    const entry = byRoom.get(l.roomId) ?? { platforms: new Set(), propertyId: l.room.propertyId }
    entry.platforms.add(l.platform)
    byRoom.set(l.roomId, entry)
  }

  const crossListedRoomIds = new Set<string>()
  for (const [roomId, entry] of byRoom.entries()) {
    if (entry.platforms.size > 1) crossListedRoomIds.add(roomId)
  }

  // Step 2: Open a DANGER flag for any cross-listed room (idempotent via upsert).
  let flagged = 0
  for (const roomId of crossListedRoomIds) {
    const entry = byRoom.get(roomId)!
    const sourceRef = `cross-listing-${roomId}`
    await prisma.propertyFlag.upsert({
      where: { propertyId_source_sourceRef: { propertyId: entry.propertyId, source: "MANUAL", sourceRef } },
      create: {
        orgId, propertyId: entry.propertyId, roomId,
        severity: "DANGER",
        title: "Cross-listed room — risk of double-booking",
        body: `This room is active on both PadSplit and Airbnb. Confirm bookings cannot overlap.`,
        source: "MANUAL", sourceRef,
      },
      update: { closedAt: null }, // re-open if it had been auto-closed before
    })
    flagged++
  }

  // Step 3: Auto-close any cross-listing flag whose room is no longer cross-listed.
  const openFlags = await prisma.propertyFlag.findMany({
    where: { orgId, source: "MANUAL", sourceRef: { startsWith: "cross-listing-" }, closedAt: null },
  })
  let closed = 0
  for (const f of openFlags) {
    const roomId = f.sourceRef?.replace("cross-listing-", "")
    if (roomId && !crossListedRoomIds.has(roomId)) {
      await prisma.propertyFlag.update({ where: { id: f.id }, data: { closedAt: new Date() } })
      closed++
    }
  }

  return { flagged, closed }
}
