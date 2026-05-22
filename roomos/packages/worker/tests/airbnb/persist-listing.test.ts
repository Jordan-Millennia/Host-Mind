import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbListing } from "../../src/airbnb/persist/listing"

const ORG_ID = "org-test-2b-listing"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B LISTING" } })
})

describe("upsertAirbnbListing", () => {
  it("creates a new PlatformListing with platform=AIRBNB and the given roomId", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: `t-${Date.now()}` },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: property.id, roomNumber: "R1" } })

    const id = await upsertAirbnbListing(ORG_ID, {
      airbnbListingId: "12345",
      roomId: room.id,
      isActive: true,
    })
    const row = await prisma.platformListing.findUnique({ where: { id } })
    expect(row?.platform).toBe("AIRBNB")
    expect(row?.externalListingId).toBe("12345")
    expect(row?.roomId).toBe(room.id)
    expect(row?.isActive).toBe(true)
  })

  it("accepts a NULL roomId for unmapped listings", async () => {
    const id = await upsertAirbnbListing(ORG_ID, {
      airbnbListingId: "67890",
      roomId: null,
      isActive: true,
    })
    const row = await prisma.platformListing.findUnique({ where: { id } })
    expect(row?.roomId).toBeNull()
  })

  it("is idempotent and updates roomId when Jordan later confirms a mapping", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: `t-${Date.now()}` },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: property.id, roomNumber: "R1" } })

    const a = await upsertAirbnbListing(ORG_ID, { airbnbListingId: "55555", roomId: null, isActive: true })
    const b = await upsertAirbnbListing(ORG_ID, { airbnbListingId: "55555", roomId: room.id, isActive: true })
    expect(b).toBe(a)
    const row = await prisma.platformListing.findUnique({ where: { id: a } })
    expect(row?.roomId).toBe(room.id)
  })
})
