import { describe, it, expect } from "vitest"
import { ghlStageForRoom, ghlOpportunityName, normalizeOppName } from "../../src/automation/ghl-stages"
import { codeWindow, generatePin } from "../../src/automation/access-window"
import { currentOccupancy, type Occ } from "../../src/automation/occupancy-select"

// All pure — no env, no DB, no network.

describe("ghlStageForRoom", () => {
  it("empty room → VACANT", () => {
    expect(ghlStageForRoom({ platform: null, status: null, endingSoon: false })).toBe("VACANT")
  })

  it("PadSplit occupied → OCCUPIED, Airbnb occupied → AIRBNB", () => {
    expect(ghlStageForRoom({ platform: "PADSPLIT", status: "OCCUPIED", endingSoon: false })).toBe("OCCUPIED")
    expect(ghlStageForRoom({ platform: "AIRBNB", status: "OCCUPIED", endingSoon: false })).toBe("AIRBNB")
  })

  it("occupied + ending within the window → MOVING_OUT regardless of platform", () => {
    expect(ghlStageForRoom({ platform: "AIRBNB", status: "OCCUPIED", endingSoon: true })).toBe("MOVING_OUT")
    expect(ghlStageForRoom({ platform: "PADSPLIT", status: "OCCUPIED", endingSoon: true })).toBe("MOVING_OUT")
  })

  it("arrivals → INCOMING, explicit move-out → MOVING_OUT, flip → TURNOVER", () => {
    expect(ghlStageForRoom({ platform: "AIRBNB", status: "MOVING_IN", endingSoon: false })).toBe("INCOMING")
    expect(ghlStageForRoom({ platform: "PADSPLIT", status: "WAITING_APPROVAL", endingSoon: false })).toBe("INCOMING")
    expect(ghlStageForRoom({ platform: "AIRBNB", status: "MOVING_OUT", endingSoon: false })).toBe("MOVING_OUT")
    expect(ghlStageForRoom({ platform: "PADSPLIT", status: "NEEDS_FLIP", endingSoon: false })).toBe("TURNOVER")
  })

  it("inactive / vacant occupancy → VACANT", () => {
    expect(ghlStageForRoom({ platform: "AIRBNB", status: "INACTIVE", endingSoon: false })).toBe("VACANT")
    expect(ghlStageForRoom({ platform: "PADSPLIT", status: "VACANT", endingSoon: false })).toBe("VACANT")
  })
})

describe("ghlOpportunityName + normalizeOppName", () => {
  it("formats 'Street — Room N', dropping city/state", () => {
    expect(ghlOpportunityName("123 Main St, Orlando, FL", "5")).toBe("123 Main St — Room 5")
  })

  it("omits the room suffix when there is no room number", () => {
    expect(ghlOpportunityName("123 Main St", null)).toBe("123 Main St")
  })

  it("normalization makes dash + case variants match", () => {
    expect(normalizeOppName("123 Main St — Room 5")).toBe(normalizeOppName("123 main st - room 5"))
    expect(normalizeOppName("123 Main St — Room 5")).not.toBe(normalizeOppName("123 Main St — Room 6"))
  })

  it("bridges RoomOS 'Room R5' and GHL 'Room 5'", () => {
    expect(normalizeOppName("8591 Lowell Blvd — Room R5")).toBe(normalizeOppName("8591 Lowell Blvd — Room 5"))
    expect(normalizeOppName("8591 Lowell Blvd — Room R10")).toBe(normalizeOppName("8591 Lowell Blvd — Room 10"))
  })
})

describe("codeWindow + generatePin", () => {
  it("window runs from 1h before move-in to 1h after the checkout day", () => {
    const moveIn = new Date("2026-05-01T00:00:00Z")
    const leaseEnd = new Date("2026-05-10T00:00:00Z")
    const { startMs, endMs } = codeWindow(moveIn, leaseEnd)
    expect(startMs).toBe(moveIn.getTime() - 3_600_000)
    expect(endMs).toBe(leaseEnd.getTime() + 25 * 3_600_000)
    expect(endMs).toBeGreaterThan(startMs)
  })

  it("generatePin returns a 6-digit string", () => {
    for (let i = 0; i < 50; i++) expect(generatePin()).toMatch(/^\d{6}$/)
  })
})

describe("currentOccupancy", () => {
  const occ = (over: Partial<Occ> & { id: string }): Occ => ({
    status: "OCCUPIED",
    moveInDate: null,
    leaseEndDate: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    guestName: "G",
    platform: "PADSPLIT",
    accessCodeId: null,
    accessCodeLockId: null,
    turnoJobId: null,
    ...over,
  })

  it("picks the active stay with the latest move-in", () => {
    const a = occ({ id: "a", moveInDate: new Date("2026-05-01T00:00:00Z") })
    const b = occ({ id: "b", moveInDate: new Date("2026-05-10T00:00:00Z") })
    expect(currentOccupancy([a, b])?.id).toBe("b")
  })

  it("prefers a freshly-created stay with no move-in date over an older dated stay (regression: C2)", () => {
    const older = occ({ id: "old", moveInDate: new Date("2026-05-01T00:00:00Z"), createdAt: new Date("2026-05-01T00:00:00Z") })
    const fresh = occ({ id: "new", moveInDate: null, createdAt: new Date("2026-05-20T00:00:00Z") })
    expect(currentOccupancy([older, fresh])?.id).toBe("new")
  })

  it("ignores ended and inactive stays", () => {
    const ended = occ({ id: "ended", leaseEndDate: new Date("2020-01-01T00:00:00Z") })
    const inactive = occ({ id: "inactive", status: "INACTIVE" })
    expect(currentOccupancy([ended, inactive])).toBeNull()
  })
})
