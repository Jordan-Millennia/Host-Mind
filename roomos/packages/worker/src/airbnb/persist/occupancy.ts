import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"
import type { AirbnbBookingRow } from "../types"

function statusFor(booking: AirbnbBookingRow, now: Date): OccupancyStatus | null {
  if (booking.status === "canceled") return null
  const today = now.toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  // Leaving today.
  if (booking.checkOut === today) return "MOVING_OUT"
  // Arrived (today or earlier) and not yet checkout day → currently staying.
  if (booking.checkIn <= today && today < booking.checkOut) return "OCCUPIED"
  // Future arrival: only the 24h pre-arrival window is MOVING_IN; anything
  // further out we don't write yet.
  if (booking.checkIn > today) return booking.checkIn === tomorrow ? "MOVING_IN" : null
  // checkOut < today → already past.
  return "INACTIVE"
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

/**
 * Returns the guest member + occupancy ids so the orchestrator can attach a
 * payout to the right member by confirmation code (the guest's member is keyed
 * by `guestUserId` when present, NOT by the synthetic `airbnb-guest:<code>` id,
 * so re-deriving the key downstream would miss most rows). Returns `null` when
 * the booking maps to no occupancy (canceled, or further out than the MOVING_IN
 * window) — those have no member/occupancy and so can carry no payout.
 */
export async function upsertAirbnbOccupancyForBooking(
  input: UpsertAirbnbOccupancyInput,
): Promise<{ memberId: string; occupancyId: string } | null> {
  const status = statusFor(input.booking, new Date())
  if (!status) return null

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
    return { memberId, occupancyId: existing.id }
  }

  // Close any open occupancy on this listing if a new booking starts
  const open = await prisma.occupancy.findFirst({
    where: { listingId: input.listingId, leaseEndDate: null },
    orderBy: { createdAt: "desc" },
  })
  if (open && open.memberId !== memberId) {
    await prisma.occupancy.update({ where: { id: open.id }, data: { leaseEndDate: new Date() } })
  }

  const created = await prisma.occupancy.create({
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
  return { memberId, occupancyId: created.id }
}
