import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertRoomWithListing } from "../../src/vault/persist/room"

const ORG_ID = "org-test-2a-room"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG ROOM" } })
})

describe("upsertRoomWithListing", () => {
  it("creates a Room and an active PADSPLIT PlatformListing in one call", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: "99001" },
    })
    const { roomId, listingId } = await upsertRoomWithListing(ORG_ID, property.id, "R1", "99001")
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    const listing = await prisma.platformListing.findUnique({ where: { id: listingId } })
    expect(room?.roomNumber).toBe("R1")
    expect(listing?.platform).toBe("PADSPLIT")
    expect(listing?.isActive).toBe(true)
    // Phase 2B: a stable per-(property, room) external id is now set.
    expect(listing?.externalListingId).toBe("99001:R1")
  })

  it("is idempotent — second call returns the same IDs", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: "99002" },
    })
    const a = await upsertRoomWithListing(ORG_ID, property.id, "R1", "99002")
    const b = await upsertRoomWithListing(ORG_ID, property.id, "R1", "99002")
    expect(b.roomId).toBe(a.roomId)
    expect(b.listingId).toBe(a.listingId)
  })
})
