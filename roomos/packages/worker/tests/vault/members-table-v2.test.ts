import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMembersTable } from "../../src/vault/parsers/members-table"

// The Stage 3/4 deep-sweep converged on a 5-column roster:
// | Room | Status | Weekly Rate | Member | Balance |
// with PadSplit financial statuses (ACTIVE / BEHIND / MOVING_OUT / …) and a
// real per-room Balance column. The parser must be HEADER-DRIVEN (locate
// columns by name) so it survives all three roster schemas, and it must
// surface the balance the rent-roll needs.
const V2 = readFileSync(
  join(__dirname, "../fixtures/vault/swept-roster-v2.md"),
  "utf-8",
)

describe("parseMembersTable — converged 5-col SWEEP:roster (Status/Weekly Rate/Member/Balance)", () => {
  it("returns one row per real-member room, skipping vacant/inactive/stub rows", () => {
    const rows = parseMembersTable(V2)
    // rooms 1,3,4,6,7 have members; 2 Vacant, 5 Inactive, R8 stub → skipped
    expect(rows.map((r) => r.roomNumber).sort()).toEqual([
      "R1",
      "R3",
      "R4",
      "R6",
      "R7",
    ])
  })

  it("reads Member by column name (not fixed position)", () => {
    const rows = parseMembersTable(V2)
    expect(rows.find((r) => r.roomNumber === "R1")).toMatchObject({
      name: "Jne Anderson",
      status: "ACTIVE",
    })
  })

  it("captures the per-room Balance column from the converged format", () => {
    const rows = parseMembersTable(V2)
    expect(rows.find((r) => r.roomNumber === "R3")!.balanceText).toBe("$23.85")
    expect(rows.find((r) => r.roomNumber === "R4")!.balanceText).toBe("-$913.79")
  })

  it("passes status text through verbatim (vocab validation is persist's job)", () => {
    const rows = parseMembersTable(V2)
    expect(rows.find((r) => r.roomNumber === "R3")!.status).toBe("BEHIND")
    expect(rows.find((r) => r.roomNumber === "R4")!.status).toBe("MOVING_OUT")
    expect(rows.find((r) => r.roomNumber === "R6")!.status).toBe("MOVING IN")
  })
})
