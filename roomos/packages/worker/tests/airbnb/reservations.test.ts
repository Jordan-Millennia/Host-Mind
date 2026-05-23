import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  parseAirbnbBookings,
  parseAirbnbTransactions,
} from "../../src/airbnb/parsers/reservations"

// NOTE: the file is named hosting-transactions.html but is actually the
// /hosting/reservations/all table — it carries BOTH booking and payout data.
const FIXTURE = readFileSync(
  resolve(__dirname, "../fixtures/airbnb/hosting-transactions.html"),
  "utf8",
)

describe("parseAirbnbBookings", () => {
  const bookings = parseAirbnbBookings(FIXTURE)

  it("returns one booking per reservation row (40)", () => {
    expect(bookings.length).toBe(40)
  })

  it("every booking has an HM… confirmation code, a listingTitle, ISO dates and a mapped status", () => {
    const allowed = new Set(["confirmed", "pending", "canceled", "completed", "unknown"])
    for (const b of bookings) {
      expect(b.confirmationCode).toMatch(/^HM[A-Z0-9]{6,}$/)
      expect((b.listingTitle ?? "").length).toBeGreaterThan(0)
      expect(b.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(b.checkOut).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(allowed.has(b.status)).toBe(true)
    }
  })

  it("does not expose the numeric listing id (airbnbListingId is empty)", () => {
    for (const b of bookings) expect(b.airbnbListingId).toBe("")
  })

  it("maps 'Canceled by guest' to status 'canceled'", () => {
    const canceled = bookings.filter((b) => b.status === "canceled")
    expect(canceled.length).toBe(7)
    const known = bookings.find((b) => b.confirmationCode === "HMZESYS9M3")
    expect(known).toBeDefined()
    expect(known!.status).toBe("canceled")
  })

  it("maps 'Confirmed' to status 'confirmed' and captures the full guest name + user id", () => {
    const b = bookings.find((x) => x.confirmationCode === "HMMSBNEPPK")
    expect(b).toBeDefined()
    expect(b!.status).toBe("confirmed")
    expect(b!.guestName).toBe("Gary Glatting")
    expect(b!.guestUserId).toBe("1494374651496566682")
    expect(b!.checkIn).toBe("2026-12-09")
    expect(b!.checkOut).toBe("2026-12-14")
    expect(b!.listingTitle).toBe("Hot Tub, Firepit & Giant Chess at Austin Hideaway")
  })

  it("confirmation codes are unique across the table", () => {
    const codes = new Set(bookings.map((b) => b.confirmationCode))
    expect(codes.size).toBe(bookings.length)
  })

  it("returns an empty array on empty html", () => {
    expect(parseAirbnbBookings("<html><body>nothing</body></html>")).toEqual([])
  })
})

describe("parseAirbnbTransactions", () => {
  const txns = parseAirbnbTransactions(FIXTURE)

  it("returns one transaction per reservation row (40)", () => {
    expect(txns.length).toBe(40)
  })

  it("every transaction has a confirmation code and a numeric amount", () => {
    for (const t of txns) {
      expect(t.confirmationCode).toMatch(/^HM[A-Z0-9]{6,}$/)
      expect(typeof t.grossAmount).toBe("number")
      expect(Number.isNaN(t.grossAmount)).toBe(false)
      expect(t.netAmount).toBe(t.grossAmount)
      expect(t.payoutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it("parses a confirmed payout amount and tags it type 'payout'", () => {
    const t = txns.find((x) => x.confirmationCode === "HMMSBNEPPK")
    expect(t).toBeDefined()
    expect(t!.grossAmount).toBe(1939.19)
    expect(t!.type).toBe("payout")
    expect(t!.payoutDate).toBe("2026-12-14") // checkout date is the best available
  })

  it("tags canceled $0.00 rows as type 'adjustment' with a zero amount", () => {
    const t = txns.find((x) => x.confirmationCode === "HMZESYS9M3")
    expect(t).toBeDefined()
    expect(t!.grossAmount).toBe(0)
    expect(t!.type).toBe("adjustment")
  })

  it("returns an empty array on empty html", () => {
    expect(parseAirbnbTransactions("<html><body>nothing</body></html>")).toEqual([])
  })
})
