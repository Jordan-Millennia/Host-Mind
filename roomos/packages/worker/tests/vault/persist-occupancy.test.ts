import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertOccupancyForListing, mapStatusText } from "../../src/vault/persist/occupancy"

const ORG_ID = "org-test-2a-occ"

async function seedListing() {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG OCC" } })
  const property = await prisma.property.create({
    data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` },
  })
  const room = await prisma.room.create({ data: { orgId: org.id, propertyId: property.id, roomNumber: "R1" } })
  const listing = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: room.id, platform: "PADSPLIT" },
  })
  const member = await prisma.member.create({
    data: { orgId: org.id, platform: "PADSPLIT", externalMemberId: `m-${Date.now()}`, name: "X" },
  })
  return { listing, member }
}

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

describe("mapStatusText", () => {
  it.each([
    ["Active", "OCCUPIED"],
    ["VACATED", "VACANT"],
    ["TERMINATED", "INACTIVE"],
    ["Moving in", "MOVING_IN"],
    ["Moving out", "MOVING_OUT"],
    ["Inactive", "INACTIVE"],
  ])("maps %s -> %s", (text, enumVal) => {
    expect(mapStatusText(text)).toBe(enumVal)
  })
})

describe("upsertOccupancyForListing", () => {
  it("creates a single OCCUPIED row for an Active member", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID,
      listingId: listing.id,
      memberId: member.id,
      statusText: "Active",
      balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("OCCUPIED")
  })

  it("on TERMINATED, sets currentBalance from the balance text", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID,
      listingId: listing.id,
      memberId: member.id,
      statusText: "TERMINATED",
      balanceText: "$407.90",
    })
    const row = await prisma.occupancy.findFirst({ where: { listingId: listing.id } })
    expect(row?.status).toBe("INACTIVE")
    expect(Number(row?.currentBalance)).toBeCloseTo(407.9)
  })

  it("transitioning Active → VACATED closes the prior occupancy and writes a VACANT row", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: null,
      statusText: "VACATED", balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({
      where: { listingId: listing.id },
      orderBy: { createdAt: "asc" },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].leaseEndDate).not.toBeNull()
    expect(rows[1].status).toBe("VACANT")
  })

  it("re-running the same Active call is a no-op (idempotent)", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
  })
})
