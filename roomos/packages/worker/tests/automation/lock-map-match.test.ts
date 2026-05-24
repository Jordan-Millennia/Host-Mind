import { describe, it, expect } from "vitest"
import { parseLockAlias, scoreRoomMatch, bestRoomMatch, CONFIDENT_THRESHOLD, type RoomLite } from "../../src/automation/lock-map-match"

// Aliases below are the real shapes observed in Jordan's TTLock accounts.

describe("parseLockAlias", () => {
  it("extracts room number from 'Room N' and strips noise", () => {
    const p = parseLockAlias("733 tarpon room 2 new lock")
    expect(p.roomNumber).toBe("2")
    expect(p.isCommon).toBe(false)
    expect(p.nameTokens).toContain("733")
    expect(p.nameTokens).toContain("tarpon")
    expect(p.nameTokens).not.toContain("new")
    expect(p.nameTokens).not.toContain("lock")
  })

  it("treats front/back/garage doors with no room number as common (unmappable)", () => {
    expect(parseLockAlias("2380 Bay St Front Door").isCommon).toBe(true)
    expect(parseLockAlias("Garage Door mathewson").isCommon).toBe(true)
    expect(parseLockAlias("6205 janice back door").isCommon).toBe(true)
  })

  it("reads a trailing bare number as the room (e.g. 'renshaw 5', 'trout 7')", () => {
    expect(parseLockAlias("renshaw 5").roomNumber).toBe("5")
    expect(parseLockAlias("trout 7").roomNumber).toBe("7")
    expect(parseLockAlias("Renshaw Unit 2").roomNumber).toBe("2")
  })
})

describe("scoreRoomMatch / bestRoomMatch", () => {
  const rooms: RoomLite[] = [
    { id: "r-bay-6", address: "2380 Bay St, Tampa, FL", roomNumber: "6" },
    { id: "r-bay-2", address: "2380 Bay St, Tampa, FL", roomNumber: "2" },
    { id: "r-renshaw-5", address: "412 Renshaw Ave, Orlando, FL", roomNumber: "5" },
    { id: "r-84th-4", address: "8578 W 84th St, Hialeah, FL", roomNumber: "R4" },
  ]

  it("confidently matches a full street-address alias to the right room", () => {
    const m = bestRoomMatch("2380 Bay St Room 6", rooms)
    expect(m?.roomId).toBe("r-bay-6")
    expect(m!.score).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD)
  })

  it("respects the room-number gate (same property, wrong room → different room)", () => {
    expect(bestRoomMatch("2380 Bay St Room 2", rooms)?.roomId).toBe("r-bay-2")
  })

  it("matches a nickname alias with no street number", () => {
    const m = bestRoomMatch("renshaw 5", rooms)
    expect(m?.roomId).toBe("r-renshaw-5")
  })

  it("normalizes RoomOS 'R4' room numbers against an alias 'room 4'", () => {
    expect(bestRoomMatch("8578 w 84th room 4", rooms)?.roomId).toBe("r-84th-4")
  })

  it("does NOT match when the property tokens don't overlap, even if the room number does", () => {
    // room 6 exists (r-bay-6) but this alias is a different property
    expect(bestRoomMatch("9999 Nowhere Ln Room 6", rooms)).toBeNull()
  })

  it("returns null for common-area / front-door locks", () => {
    expect(bestRoomMatch("2380 Bay St Front Door", rooms)).toBeNull()
    expect(bestRoomMatch("Garage Door mathewson", rooms)).toBeNull()
  })
})
