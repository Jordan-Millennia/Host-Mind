import { prisma } from "@roomos/db"
import type { Prisma } from "@roomos/db"
import { upsertAirbnbListing } from "./persist/listing"
import { upsertAirbnbOccupancyForBooking } from "./persist/occupancy"
import { upsertAirbnbPayment } from "./persist/payment"
import { matchListingToRoom } from "./matcher"
import { detectAndFlagCrossListings } from "./cross-listing"
import type { AirbnbBookingRow, AirbnbListingRow, AirbnbSyncResult, AirbnbTransactionRow } from "./types"

export type SyncAirbnbRowsInput = {
  orgId: string
  listings: AirbnbListingRow[]
  bookings: AirbnbBookingRow[]
  transactions: AirbnbTransactionRow[]
}

/**
 * The /hosting/reservations table does NOT expose a listing's numeric id, so
 * bookings come off the parser with `airbnbListingId === ""` and carry the
 * listing NAME on `listingTitle` instead. The orchestrator joins bookings→
 * listings by id, so the live scraper must resolve those ids first.
 *
 * This pure helper fills `airbnbListingId` from a normalized-title→id map built
 * off the /hosting/listings page (which DOES expose ids). A booking whose title
 * doesn't match any listing keeps "" and is skipped downstream — better left
 * unassigned than mis-assigned to the wrong room. Bookings that already carry an
 * id (e.g. injected test rows) are passed through untouched.
 */
export function attachListingIdsByTitle(
  listings: AirbnbListingRow[],
  bookings: AirbnbBookingRow[],
): AirbnbBookingRow[] {
  // Build title → distinct listing ids, then keep only titles that resolve to
  // exactly ONE listing. Operators sometimes clone a title across units (e.g.
  // several "Sunny Sarasota Escape" rooms); a colliding title is ambiguous, so we
  // refuse to map it (leave "") rather than pin a booking to an arbitrary room.
  const idsByTitle = new Map<string, Set<string>>()
  for (const l of listings) {
    const key = normalizeTitle(l.title)
    if (!key) continue
    const set = idsByTitle.get(key) ?? new Set<string>()
    set.add(l.airbnbListingId)
    idsByTitle.set(key, set)
  }
  const idByTitle = new Map<string, string>()
  for (const [title, ids] of idsByTitle) {
    if (ids.size === 1) idByTitle.set(title, ids.values().next().value as string)
  }
  return bookings.map((b) => {
    if (b.airbnbListingId) return b
    const id = idByTitle.get(normalizeTitle(b.listingTitle ?? "")) ?? ""
    return { ...b, airbnbListingId: id }
  })
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}

/**
 * Drive one full Airbnb reconciliation from already-parsed rows. The live
 * Playwright job (jobs/airbnb-sync.ts) fetches + parses the pages and calls this;
 * the integration test injects fixture-derived rows directly. Pipeline:
 *   listing → PlatformListing (with room match attempt)
 *   booking → Occupancy (skipped when its listing didn't resolve)
 *   transaction → PaymentEvent (via the occupancy's member)
 *   then a cross-org cross-listing sweep.
 * Every stage is wrapped so one bad row records an error without aborting the run.
 */
export async function syncAirbnbWithRows(input: SyncAirbnbRowsInput): Promise<AirbnbSyncResult> {
  const result: AirbnbSyncResult = {
    listingsParsed: input.listings.length,
    bookingsParsed: input.bookings.length,
    transactionsParsed: input.transactions.length,
    listingsUpserted: 0,
    bookingsUpserted: 0,
    paymentEventsUpserted: 0,
    mappingsAuto: 0,
    mappingsAmbiguous: 0,
    crossListings: 0,
    errors: [],
  }
  const run = await prisma.syncRun.create({
    data: { orgId: input.orgId, kind: "AIRBNB_SYNC", platform: "AIRBNB", status: "RUNNING" },
  })

  try {
    // listing → PlatformListing (with mapping attempt)
    const listingIdByAirbnbId = new Map<string, string>()
    for (const l of input.listings) {
      try {
        const match = await matchListingToRoom(input.orgId, l)
        if (match.roomId) result.mappingsAuto++
        else result.mappingsAmbiguous++
        const id = await upsertAirbnbListing(input.orgId, {
          airbnbListingId: l.airbnbListingId,
          roomId: match.roomId,
          isActive: l.status === "active",
        })
        listingIdByAirbnbId.set(l.airbnbListingId, id)
        result.listingsUpserted++
      } catch (err) {
        result.errors.push({ stage: `listing:${l.airbnbListingId}`, reason: String((err as Error).message) })
      }
    }

    // booking → Occupancy (skip if no listing match). Capture the member +
    // occupancy each booking resolves to, keyed by confirmation code, so the payout
    // pass attaches to the correct member WITHOUT re-deriving its key — the guest
    // member is keyed by `guestUserId` when present, not by `airbnb-guest:<code>`,
    // so re-derivation would miss every booking that exposed a guest profile link.
    const payTargetByCode = new Map<string, { memberId: string; occupancyId: string; checkIn: string }>()
    for (const b of input.bookings) {
      const listingId = listingIdByAirbnbId.get(b.airbnbListingId)
      if (!listingId) continue
      try {
        const target = await upsertAirbnbOccupancyForBooking({ orgId: input.orgId, listingId, booking: b })
        if (target) {
          payTargetByCode.set(b.confirmationCode, { ...target, checkIn: b.checkIn })
          result.bookingsUpserted++
        }
      } catch (err) {
        result.errors.push({ stage: `booking:${b.confirmationCode}`, reason: String((err as Error).message) })
      }
    }

    // transaction → PaymentEvent. Only record payouts whose money has actually
    // landed: Airbnb releases a host payout ~24h after CHECK-IN, so a stay that has
    // started (checkIn <= today) has been paid, while future/arriving bookings have
    // not. Skip non-payout rows (canceled → $0 "adjustment"). The member comes from
    // the booking pass above (keyed by confirmation code), never re-derived.
    const today = new Date().toISOString().slice(0, 10)
    for (const t of input.transactions) {
      if (t.type !== "payout") continue
      const target = payTargetByCode.get(t.confirmationCode)
      if (!target) continue // canceled / future / unmatched booking → no money to record
      if (target.checkIn > today) continue // stay hasn't started → payout not released yet
      try {
        await upsertAirbnbPayment({
          orgId: input.orgId,
          memberId: target.memberId,
          occupancyId: target.occupancyId,
          transaction: t,
        })
        result.paymentEventsUpserted++
      } catch (err) {
        result.errors.push({ stage: `transaction:${t.confirmationCode}`, reason: String((err as Error).message) })
      }
    }

    // Cross-listing detection (runs across the full org, not just touched rooms)
    const cross = await detectAndFlagCrossListings(input.orgId)
    result.crossListings = cross.flagged

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: result.errors.length > 0 ? "PARTIAL" : "SUCCESS",
        itemsSynced: result.listingsUpserted + result.bookingsUpserted + result.paymentEventsUpserted,
        errorsJson: result.errors.length > 0 ? (result.errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    })
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: "FAILED", errorsJson: { fatal: String(err) } },
    })
    throw err
  }
  return result
}
