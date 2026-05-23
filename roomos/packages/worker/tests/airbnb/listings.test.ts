import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseHostingListings } from "../../src/airbnb/parsers/listings"

const FIXTURE = readFileSync(
  resolve(__dirname, "../fixtures/airbnb/hosting-listings.html"),
  "utf8",
)

describe("parseHostingListings", () => {
  const rows = parseHostingListings(FIXTURE)

  it("returns one row per listing in the real /hosting/listings table (19)", () => {
    expect(rows.length).toBe(19)
  })

  it("every row has a numeric airbnbListingId and a non-empty title", () => {
    for (const r of rows) {
      expect(r.airbnbListingId).toMatch(/^\d+$/)
      expect(r.title.length).toBeGreaterThan(0)
    }
  })

  it("airbnbListingIds are unique", () => {
    const ids = new Set(rows.map((r) => r.airbnbListingId))
    expect(ids.size).toBe(rows.length)
  })

  it("parses the known Anastasia Island Treehouse listing with the right id, title and address", () => {
    const r = rows.find((x) => x.airbnbListingId === "1395837419104939164")
    expect(r).toBeDefined()
    expect(r!.title).toBe("Anastasia Island Treehouse")
    expect(r!.address).toBe("503 Arricola Avenue, St. Augustine, FL,")
  })

  it("maps Listed → active and Unlisted → unlisted", () => {
    const listed = rows.find((x) => x.airbnbListingId === "1395837419104939164")
    expect(listed!.status).toBe("active")
    // Sunny Sarasota Escape rooms are Unlisted in the fixture
    const unlisted = rows.find((x) => x.title === "Sunny Sarasota Escape")
    expect(unlisted).toBeDefined()
    expect(unlisted!.status).toBe("unlisted")
  })

  it("maps the 'home' type to entire_home", () => {
    const r = rows.find((x) => x.airbnbListingId === "1395837419104939164")
    expect(r!.listingType).toBe("entire_home")
  })

  it("captures room-style addresses verbatim (masked street + (Room N) suffix)", () => {
    const roomRow = rows.find((x) => /\(Room 8\)/.test(x.address))
    expect(roomRow).toBeDefined()
    expect(roomRow!.title).toBe("Sunny Sarasota Escape")
    expect(roomRow!.address).toContain("733 Tarpon Avenue (Room 8)")
  })

  it("tolerates listings with no address (address may be empty for some rows)", () => {
    // ST. Sylvan Historic Bungalow has only a title, no address line
    const r = rows.find((x) => x.title === "ST. Sylvan Historic Bungalow")
    expect(r).toBeDefined()
    expect(r!.address).toBe("")
  })

  it("returns an empty array when there is no listings table", () => {
    expect(parseHostingListings("<html><body>no listings</body></html>")).toEqual([])
  })
})
