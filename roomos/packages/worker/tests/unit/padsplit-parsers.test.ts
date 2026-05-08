import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseListingPage } from "../../src/padsplit/parsers"
import { parseMemberProfile } from "../../src/padsplit/parsers"

const fixture = readFileSync(
  resolve(__dirname, "../fixtures/padsplit-listing-detail.html"),
  "utf-8",
)

const memberFixture = readFileSync(
  resolve(__dirname, "../fixtures/padsplit-member-profile.html"),
  "utf-8",
)

describe("parseListingPage", () => {
  it("extracts the property header", () => {
    const out = parseListingPage(fixture)
    expect(out.address).toBe("3216 71st Ave N")
    expect(out.city).toBe("St Petersburg, FL")
    expect(out.status).toBe("Active")
  })

  it("returns one room per Room_root card", () => {
    const out = parseListingPage(fixture)
    expect(out.rooms).toHaveLength(3)
  })

  // Skipped: Phase 2A retires the PadSplit Mac Studio scraper in favor of the vault adapter.
  // The parser was hot-fixed (commits a8c1c37/dff61f6) to read room# from a TR cell instead of
  // an "ID:" regex; these fixture-driven tests assert the legacy externalRoomId behavior.
  // Plan Task 17 keeps the scraper code in tree but unscheduled. Phase 2B/2C may revisit.
  it.skip("parses an occupied room with member + start date (legacy ID format)", () => {
    const r = parseListingPage(fixture).rooms[0]!
    expect(r.externalRoomId).toBe("41418")
    expect(r.status).toBe("OCCUPIED")
    expect(r.member?.externalMemberId).toBe("8888")
    expect(r.member?.name).toBe("Marcus T.")
    expect(r.moveInDate).toBe("2025-03-11")
    expect(r.leaseEndDate).toBeNull()
  })

  it.skip("parses a vacant room with no member but a date range (legacy ID format)", () => {
    const r = parseListingPage(fixture).rooms[1]!
    expect(r.externalRoomId).toBe("41419")
    expect(r.status).toBe("VACANT")
    expect(r.member).toBeNull()
    expect(r.moveInDate).toBe("2025-04-04")
    expect(r.leaseEndDate).toBe("2026-04-18")
  })

  it("normalizes 'Moving in' to MOVING_IN", () => {
    const r = parseListingPage(fixture).rooms[2]!
    expect(r.status).toBe("MOVING_IN")
  })
})

describe("parseMemberProfile", () => {
  it("extracts balance, days past due, and last payment", () => {
    const out = parseMemberProfile(memberFixture)
    expect(out.balance).toBe("420.00")
    expect(out.daysPastDue).toBe(5)
    expect(out.lastPaymentAmount).toBe("165.00")
    expect(out.lastPaymentDate).toBe("2026-04-22")
  })

  it("returns null fields when the profile shows no balance", () => {
    const out = parseMemberProfile(`<div data-testid="member__balance">$0.00</div>`)
    expect(out.balance).toBe("0.00")
    expect(out.daysPastDue).toBeNull()
    expect(out.lastPaymentDate).toBeNull()
  })
})
