import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { syncAirbnbWithRows } from "../../src/airbnb/sync"
import type { AirbnbListingRow, AirbnbBookingRow, AirbnbTransactionRow } from "../../src/airbnb/types"

const ORG_ID = "org-test-2b-sync"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B SYNC" } })
})

describe("syncAirbnbWithRows (integration)", () => {
  it("end-to-end: 1 listing matches 1 vault property → upserts listing + booking + transaction", async () => {
    // Pre-seed a property + room as if vault sync had run.
    const p = await prisma.property.create({
      data: { orgId: ORG_ID, address: "7728 Linkside Loop, Kissimmee, FL", padsplitPropertyId: "21664" },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: p.id, roomNumber: "R1" } })

    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)

    const listings: AirbnbListingRow[] = [{
      airbnbListingId: "99001", title: "Cozy retreat in Kissimmee", address: "7728 Linkside Loop, Kissimmee, FL",
      listingType: "entire_home", status: "active",
    }]
    const bookings: AirbnbBookingRow[] = [{
      airbnbListingId: "99001", confirmationCode: "HMABCDEF",
      guestName: "Alice", guestUserId: null, checkIn: today, checkOut: future, status: "confirmed",
    }]
    const transactions: AirbnbTransactionRow[] = [{
      confirmationCode: "HMABCDEF", payoutDate: today, grossAmount: 540, netAmount: 487, type: "payout",
    }]

    const result = await syncAirbnbWithRows({ orgId: ORG_ID, listings, bookings, transactions })
    expect(result.errors).toEqual([])
    expect(result.listingsUpserted).toBe(1)
    expect(result.bookingsUpserted).toBe(1)
    expect(result.paymentEventsUpserted).toBe(1)
    expect(result.mappingsAuto).toBe(1)
    expect(result.mappingsAmbiguous).toBe(0)

    const pl = await prisma.platformListing.findUnique({
      where: { platform_externalListingId: { platform: "AIRBNB", externalListingId: "99001" } },
    })
    expect(pl?.roomId).toBe(room.id)
  })

  it("idempotent — second call with same rows produces no new rows", async () => {
    await prisma.property.create({
      data: { orgId: ORG_ID, address: "7728 Linkside Loop", padsplitPropertyId: "21664-2" },
    })
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    const args = {
      orgId: ORG_ID,
      listings: [{ airbnbListingId: "44", title: "x", address: "7728 Linkside Loop", listingType: "entire_home" as const, status: "active" as const }],
      bookings: [{ airbnbListingId: "44", confirmationCode: "ABC", guestName: "g", guestUserId: null, checkIn: today, checkOut: future, status: "confirmed" as const }],
      transactions: [{ confirmationCode: "ABC", payoutDate: today, grossAmount: 1, netAmount: 1, type: "payout" as const }],
    }
    await syncAirbnbWithRows(args)
    const before = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    await syncAirbnbWithRows(args)
    const after = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    expect(after).toBe(before)
  })

  it("writes a SyncRun row with kind=AIRBNB_SYNC and status=SUCCESS", async () => {
    await syncAirbnbWithRows({ orgId: ORG_ID, listings: [], bookings: [], transactions: [] })
    const run = await prisma.syncRun.findFirst({
      where: { orgId: ORG_ID, kind: "AIRBNB_SYNC" },
      orderBy: { startedAt: "desc" },
    })
    expect(run?.status).toBe("SUCCESS")
  })

  it("records a landed payout for a booking whose member is keyed by guestUserId (regression: C1)", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    const listings: AirbnbListingRow[] = [{
      airbnbListingId: "77001", title: "Guest Home", address: "nowhere",
      listingType: "entire_home", status: "active",
    }]
    // guestUserId set → member is keyed by "9999", NOT "airbnb-guest:HMGUEST1".
    const bookings: AirbnbBookingRow[] = [{
      airbnbListingId: "77001", confirmationCode: "HMGUEST1",
      guestName: "Gary", guestUserId: "9999", checkIn: today, checkOut: future, status: "confirmed",
    }]
    const transactions: AirbnbTransactionRow[] = [{
      confirmationCode: "HMGUEST1", payoutDate: today, grossAmount: 600, netAmount: 540, type: "payout",
    }]

    const result = await syncAirbnbWithRows({ orgId: ORG_ID, listings, bookings, transactions })
    expect(result.bookingsUpserted).toBe(1)
    expect(result.paymentEventsUpserted).toBe(1)

    const member = await prisma.member.findFirst({ where: { orgId: ORG_ID, externalMemberId: "9999" } })
    expect(member).not.toBeNull()
    const payments = await prisma.paymentEvent.count({ where: { memberId: member!.id } })
    expect(payments).toBe(1)
  })

  it("does NOT record a payout for a future stay that hasn't started (regression: C2)", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const future = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)
    const listings: AirbnbListingRow[] = [{
      airbnbListingId: "77002", title: "Future Home", address: "nowhere2",
      listingType: "entire_home", status: "active",
    }]
    const bookings: AirbnbBookingRow[] = [{
      airbnbListingId: "77002", confirmationCode: "HMFUTURE1",
      guestName: "Fiona", guestUserId: "8888", checkIn: tomorrow, checkOut: future, status: "confirmed",
    }]
    const transactions: AirbnbTransactionRow[] = [{
      confirmationCode: "HMFUTURE1", payoutDate: future, grossAmount: 600, netAmount: 540, type: "payout",
    }]

    const result = await syncAirbnbWithRows({ orgId: ORG_ID, listings, bookings, transactions })
    expect(result.bookingsUpserted).toBe(1) // MOVING_IN occupancy is created…
    expect(result.paymentEventsUpserted).toBe(0) // …but the payout hasn't been released yet
  })
})
