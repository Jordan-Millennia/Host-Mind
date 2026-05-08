import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePropertyFile } from "../../src/vault/parsers/property-file"

const FIXTURE_PATH = join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md")
const FIXTURE = readFileSync(FIXTURE_PATH, "utf-8")

describe("parsePropertyFile", () => {
  it("composes the four sub-parsers into one VaultPropertyFile", () => {
    const f = parsePropertyFile(FIXTURE, FIXTURE_PATH)
    expect(f.padsplitPropertyId).toBe("28685")
    expect(f.address).toContain("1311 Morgana")
    expect(f.members).toHaveLength(6)
    expect(f.flagsAndAlerts.length).toBeGreaterThanOrEqual(4)
    expect(f.maintenanceItems.length).toBeGreaterThan(0)
    expect(f.filePath).toBe(FIXTURE_PATH)
  })

  it("throws if frontmatter has no padsplit-property-id", () => {
    const noPadId = `---\naddress: "x"\n---\n# x`
    expect(() => parsePropertyFile(noPadId, "/x.md")).toThrow(/padsplit-property-id/i)
  })
})
