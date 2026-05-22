import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbPayment } from "../../src/airbnb/persist/payment"

const ORG_ID = "org-test-2b-pay"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedWithBooking() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B PAY" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  const l = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: r.id, platform: "AIRBNB", externalListingId: `${Date.now()}`, isActive: true },
  })
  const m = await prisma.member.create({
    data: { orgId: org.id, platform: "AIRBNB", externalMemberId: `airbnb-guest:CODE${Date.now()}`, name: "Guest" },
  })
  const occ = await prisma.occupancy.create({
    data: { orgId: org.id, listingId: l.id, memberId: m.id, status: "OCCUPIED" },
  })
  return { memberId: m.id, occupancyId: occ.id }
}

describe("upsertAirbnbPayment", () => {
  it("creates a PaymentEvent keyed by Airbnb confirmation code", async () => {
    const { memberId, occupancyId } = await seedWithBooking()
    await upsertAirbnbPayment({
      orgId: ORG_ID,
      memberId,
      occupancyId,
      transaction: { confirmationCode: "ABC1", payoutDate: "2026-05-08", grossAmount: 240, netAmount: 215, type: "payout" },
    })
    const rows = await prisma.paymentEvent.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(Number(rows[0]!.amount)).toBeCloseTo(215)
    expect(rows[0]!.source).toBe("AIRBNB_SCRAPE")
  })

  it("idempotent on the same confirmation code", async () => {
    const { memberId, occupancyId } = await seedWithBooking()
    const args = {
      orgId: ORG_ID, memberId, occupancyId,
      transaction: { confirmationCode: "DUP1", payoutDate: "2026-05-08", grossAmount: 240, netAmount: 215, type: "payout" as const },
    }
    await upsertAirbnbPayment(args)
    await upsertAirbnbPayment(args)
    const rows = await prisma.paymentEvent.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
  })
})
