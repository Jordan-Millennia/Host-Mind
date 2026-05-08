import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMembersTable } from "../../src/vault/parsers/members-table"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseMembersTable", () => {
  it("parses all rows from the Current Members section", () => {
    const rows = parseMembersTable(FIXTURE)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({
      roomNumber: "R1",
      name: "Jeffrey Byrd",
      status: "Active",
      balanceText: "$0",
    })
  })

  it("strips bold markers from status cells", () => {
    const rows = parseMembersTable(FIXTURE)
    const r3 = rows.find((r) => r.roomNumber === "R3")!
    const r4 = rows.find((r) => r.roomNumber === "R4")!
    expect(r3.status).toBe("VACATED")     // not "**VACATED**"
    expect(r4.status).toBe("TERMINATED")
  })

  it("parses balance with cents", () => {
    const rows = parseMembersTable(FIXTURE)
    const r4 = rows.find((r) => r.roomNumber === "R4")!
    expect(r4.balanceText).toBe("$407.90")
  })

  it("returns empty array when there's no Current Members section", () => {
    expect(parseMembersTable("# no table here")).toEqual([])
  })

  it("normalizes room number capitalization", () => {
    const md = `## Current Members\n\n| Room | Name | Status | Balance Due | Notes |\n|--|--|--|--|--|\n| r2 | x | Active | $0 | |\n`
    expect(parseMembersTable(md)[0].roomNumber).toBe("R2")
  })
})
