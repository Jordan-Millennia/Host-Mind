import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"
import type { AirbnbBookingRow } from "../types"

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function statusFor(booking: AirbnbBookingRow, now: Date): OccupancyStatus | null {
  if (booking.status === "canceled") return null
  const today = now.toISOString().slice(0, 10)
  if (booking.checkIn === today) return "MOVING_IN"
  if (booking.checkOut === today) return "MOVING_OUT"
  if (booking.checkIn < today && booking.checkOut > today) return "OCCUPIED"
  if (booking.checkIn > today) return null   // future booking — don't write yet
  return "INACTIVE"                            // past completed
}

async function upsertGuestMember(orgId: string, booking: AirbnbBookingRow): Promise<string> {
  const externalMemberId = booking.guestUserId ?? `airbnb-guest:${booking.confirmationCode}`
  const existing = await prisma.member.findUnique({
    where: { platform_externalMemberId: { platform: "AIRBNB", externalMemberId } },
  })
  if (existing) return existing.id
  const created = await prisma.member.create({
    data: { orgId, platform: "AIRBNB", externalMemberId, name: booking.guestName },
  })
  return created.id
}

export type UpsertAirbnbOccupancyInput = {
  orgId: string
  listingId: string
  booking: AirbnbBookingRow
}

export async function upsertAirbnbOccupancyForBooking(input: UpsertAirbnbOccupancyInput): Promise<void> {
  const status = statusFor(input.booking, new Date())
  if (!status) return

  // Idempotency: existing occupancy keyed by listing + member with matching dates and status
  const memberId = await upsertGuestMember(input.orgId, input.booking)

  const existing = await prisma.occupancy.findFirst({
    where: {
      listingId: input.listingId,
      memberId,
      moveInDate: new Date(input.booking.checkIn),
    },
  })
  if (existing) {
    if (existing.status !== status) {
      await prisma.occupancy.update({ where: { id: existing.id }, data: { status, leaseEndDate: new Date(input.booking.checkOut) } })
    }
    return
  }

  // Close any open occupancy on this listing if a new booking starts
  const open = await prisma.occupancy.findFirst({
    where: { listingId: input.listingId, leaseEndDate: null },
    orderBy: { createdAt: "desc" },
  })
  if (open && open.memberId !== memberId) {
    await prisma.occupancy.update({ where: { id: open.id }, data: { leaseEndDate: new Date() } })
  }

  await prisma.occupancy.create({
    data: {
      orgId: input.orgId,
      listingId: input.listingId,
      memberId,
      status,
      moveInDate: new Date(input.booking.checkIn),
      leaseEndDate: new Date(input.booking.checkOut),
      scrapedAt: new Date(),
    },
  })
}
