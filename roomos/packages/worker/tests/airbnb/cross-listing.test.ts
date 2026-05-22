import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { detectAndFlagCrossListings } from "../../src/airbnb/cross-listing"

const ORG_ID = "org-test-2b-cross"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedRoomWith(...platforms: Array<"PADSPLIT" | "AIRBNB">) {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B CROSS" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  for (const pl of platforms) {
    await prisma.platformListing.create({
      data: {
        orgId: org.id, roomId: r.id, platform: pl,
        externalListingId: `${pl}-${Date.now()}-${Math.random()}`, isActive: true,
      },
    })
  }
  return { propertyId: p.id, roomId: r.id }
}

describe("detectAndFlagCrossListings", () => {
  it("writes a DANGER flag when a room has both PADSPLIT and AIRBNB active", async () => {
    const { propertyId, roomId } = await seedRoomWith("PADSPLIT", "AIRBNB")
    const result = await detectAndFlagCrossListings(ORG_ID)
    expect(result.flagged).toBe(1)
    const flags = await prisma.propertyFlag.findMany({ where: { propertyId, closedAt: null } })
    expect(flags).toHaveLength(1)
    expect(flags[0]!.severity).toBe("DANGER")
    expect(flags[0]!.sourceRef).toBe(`cross-listing-${roomId}`)
  })

  it("does NOT flag a room with only PADSPLIT", async () => {
    await seedRoomWith("PADSPLIT")
    const result = await detectAndFlagCrossListings(ORG_ID)
    expect(result.flagged).toBe(0)
  })

  it("closes a previously-open cross-listing flag when the condition clears", async () => {
    const { propertyId, roomId } = await seedRoomWith("PADSPLIT", "AIRBNB")
    await detectAndFlagCrossListings(ORG_ID)
    // Deactivate the Airbnb listing
    await prisma.platformListing.updateMany({ where: { roomId, platform: "AIRBNB" }, data: { isActive: false } })
    await detectAndFlagCrossListings(ORG_ID)
    const flags = await prisma.propertyFlag.findMany({ where: { propertyId, sourceRef: `cross-listing-${roomId}` } })
    expect(flags).toHaveLength(1)
    expect(flags[0]!.closedAt).not.toBeNull()
  })

  it("idempotent — repeated runs with the same state produce no duplicates", async () => {
    await seedRoomWith("PADSPLIT", "AIRBNB")
    await detectAndFlagCrossListings(ORG_ID)
    await detectAndFlagCrossListings(ORG_ID)
    const count = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    expect(count).toBe(1)
  })
})
