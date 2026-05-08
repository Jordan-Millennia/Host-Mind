import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMaintenance } from "../../src/vault/parsers/maintenance"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseMaintenance", () => {
  it("returns each row from the Open Maintenance Items table", () => {
    const items = parseMaintenance(FIXTURE)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveProperty("description")
    expect(items[0]).toHaveProperty("status")
    expect(items[0]).toHaveProperty("priority")
  })

  it("strips bold markers from status cell", () => {
    const items = parseMaintenance(FIXTURE)
    expect(items[0].status).not.toContain("**")
  })

  it("returns empty array when there's no maintenance section", () => {
    expect(parseMaintenance("# nothing")).toEqual([])
  })
})
