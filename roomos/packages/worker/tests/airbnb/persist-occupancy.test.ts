import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbOccupancyForBooking } from "../../src/airbnb/persist/occupancy"

const ORG_ID = "org-test-2b-occ"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seed() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B OCC" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  const l = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: r.id, platform: "AIRBNB", externalListingId: `${Date.now()}`, isActive: true },
  })
  return { listing: l }
}

describe("upsertAirbnbOccupancyForBooking", () => {
  it("creates an OCCUPIED occupancy for a confirmed current stay", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await upsertAirbnbOccupancyForBooking({
      orgId: ORG_ID,
      listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "ABC123",
        guestName: "Alice",
        guestUserId: null,
        checkIn: today,
        checkOut: tomorrow,
        status: "confirmed",
      },
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("OCCUPIED")
  })

  it("creates a MOVING_OUT occupancy when checkOut is today", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    await upsertAirbnbOccupancyForBooking({
      orgId: ORG_ID,
      listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "MOV456",
        guestName: "Bob",
        guestUserId: null,
        checkIn: yesterday,
        checkOut: today,
        status: "confirmed",
      },
    })
    const row = await prisma.occupancy.findFirst({ where: { listingId: listing.id } })
    expect(row?.status).toBe("MOVING_OUT")
  })

  it("idempotent on the same confirmation code", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const args = {
      orgId: ORG_ID, listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "DUP789", guestName: "Carol", guestUserId: null,
        checkIn: today, checkOut: tomorrow, status: "confirmed" as const,
      },
    }
    await upsertAirbnbOccupancyForBooking(args)
    await upsertAirbnbOccupancyForBooking(args)
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
  })
})
