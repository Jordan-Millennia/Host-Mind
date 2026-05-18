import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMembersTable } from "../../src/vault/parsers/members-table"

// Post-deep-sweep format: the roster lives inside a <!-- SWEEP:roster --> fence
// with columns | Room | Status | Rate | Member | (NOT the legacy
// | Room | Name | Status | Balance | Notes | layout).
//
// Contract (must match the legacy parser the Phase-2A sync pipeline expects):
// one row per OCCUPIED room with a real member. Vacant / Needs-flip rooms
// have no member, so they are skipped — exactly like the legacy parser's
// `if (!name) continue`. (Vacant-room visibility is a separate concern.)
const SWEPT = readFileSync(
  join(__dirname, "../fixtures/rosters/swept-roster.md"),
  "utf-8",
)

describe("parseMembersTable — SWEEP:roster fenced format", () => {
  it("returns one row per occupied room, skipping vacant/needs-flip rooms", () => {
    const rows = parseMembersTable(SWEPT)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.roomNumber).sort()).toEqual(["R3", "R4", "R5"])
  })

  it("maps the Member column to name and Status column to status", () => {
    const rows = parseMembersTable(SWEPT)
    const r3 = rows.find((r) => r.roomNumber === "R3")!
    expect(r3).toMatchObject({
      roomNumber: "R3",
      name: "Megan Walker Godwin",
      status: "Occupied",
    })
  })

  it("normalizes bare numeric room numbers to R-prefixed", () => {
    const rows = parseMembersTable(SWEPT)
    expect(rows.every((r) => /^R\d+$/.test(r.roomNumber))).toBe(true)
  })

  it("carries no balance from the roster (dossier sync owns balance)", () => {
    const rows = parseMembersTable(SWEPT)
    expect(rows.every((r) => r.balanceText === "")).toBe(true)
  })

  it("recognizes the sweep 'Occupied' status vocabulary", () => {
    const rows = parseMembersTable(SWEPT)
    expect(rows.filter((r) => r.status === "Occupied")).toHaveLength(3)
  })
})
