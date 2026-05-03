import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseListingPage } from "../../src/padsplit/parsers"

const fixture = readFileSync(
  resolve(__dirname, "../fixtures/padsplit-listing-detail.html"),
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

  it("parses an occupied room with member + start date", () => {
    const r = parseListingPage(fixture).rooms[0]!
    expect(r.externalRoomId).toBe("41418")
    expect(r.status).toBe("OCCUPIED")
    expect(r.member?.externalMemberId).toBe("8888")
    expect(r.member?.name).toBe("Marcus T.")
    expect(r.moveInDate).toBe("2025-03-11")
    expect(r.leaseEndDate).toBeNull()
  })

  it("parses a vacant room with no member but a date range", () => {
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
