import { describe, it, expect } from "vitest"
import { attachListingIdsByTitle } from "../../src/airbnb/sync"
import type { AirbnbBookingRow, AirbnbListingRow } from "../../src/airbnb/types"

// attachListingIdsByTitle is the DB-free bridge between the two Airbnb pages:
// the reservations table gives bookings a listing NAME but no numeric id, while
// the listings page gives both. The orchestrator joins by id, so this helper
// must resolve booking.listingTitle → listing.title → airbnbListingId first.

const listing = (airbnbListingId: string, title: string): AirbnbListingRow => ({
  airbnbListingId,
  title,
  address: "",
  listingType: "entire_home",
  status: "active",
})

const booking = (listingTitle: string, airbnbListingId = ""): AirbnbBookingRow => ({
  airbnbListingId,
  listingTitle,
  confirmationCode: "HMTEST01",
  guestName: "Guest",
  guestUserId: null,
  checkIn: "2026-05-12",
  checkOut: "2026-05-15",
  status: "confirmed",
})

describe("attachListingIdsByTitle", () => {
  const listings = [
    listing("111", "Anastasia Island Treehouse"),
    listing("222", "Hot Tub, Firepit & Giant Chess at Austin Hideaway"),
  ]

  it("fills airbnbListingId from an exact title match", () => {
    const [b] = attachListingIdsByTitle(listings, [booking("Anastasia Island Treehouse")])
    expect(b!.airbnbListingId).toBe("111")
  })

  it("normalizes case and collapses whitespace across the two pages", () => {
    const [b] = attachListingIdsByTitle(listings, [
      booking("  hot tub,   firepit & giant chess at AUSTIN hideaway "),
    ])
    expect(b!.airbnbListingId).toBe("222")
  })

  it("leaves airbnbListingId empty when no listing title matches", () => {
    const [b] = attachListingIdsByTitle(listings, [booking("Some Listing Not On The Listings Page")])
    expect(b!.airbnbListingId).toBe("")
  })

  it("refuses to map a title shared by two listings (ambiguous → empty, not arbitrary)", () => {
    // Operators clone titles across units — e.g. several "Sunny Sarasota Escape" rooms.
    const dupes = [listing("501", "Sunny Sarasota Escape"), listing("502", "Sunny Sarasota Escape")]
    const [b] = attachListingIdsByTitle(dupes, [booking("Sunny Sarasota Escape")])
    expect(b!.airbnbListingId).toBe("")
  })

  it("passes through a booking that already carries an id (does not overwrite)", () => {
    const [b] = attachListingIdsByTitle(listings, [booking("Anastasia Island Treehouse", "999")])
    expect(b!.airbnbListingId).toBe("999")
  })

  it("tolerates a missing/empty listingTitle without throwing", () => {
    const b1: AirbnbBookingRow = { ...booking(""), listingTitle: undefined }
    const [out] = attachListingIdsByTitle(listings, [b1])
    expect(out!.airbnbListingId).toBe("")
  })

  it("does not mutate the input bookings", () => {
    const input = [booking("Anastasia Island Treehouse")]
    attachListingIdsByTitle(listings, input)
    expect(input[0]!.airbnbListingId).toBe("")
  })
})
