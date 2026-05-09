import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrontmatter } from "../../src/vault/parsers/frontmatter"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseFrontmatter", () => {
  it("parses all known fields from a property file", () => {
    const fm = parseFrontmatter(FIXTURE)
    expect(fm.address).toBe("1311 Morgana Rd, Jacksonville, FL 32205")
    expect(fm.market).toBe("Jacksonville")
    expect(fm.state).toBe("FL")
    expect(fm.rooms).toBe(5)
    expect(fm.platform).toBe("PadSplit")
    expect(fm.padsplitPropertyId).toBe("28685")
    expect(fm.lastUpdated).toBe("2026-04-26")
  })

  it("returns nulls for fields absent from frontmatter", () => {
    const fm = parseFrontmatter(`---\naddress: "x"\n---\n`)
    expect(fm.market).toBeNull()
    expect(fm.rooms).toBeNull()
    expect(fm.padsplitPropertyId).toBeNull()
  })

  it("throws if there's no frontmatter block", () => {
    expect(() => parseFrontmatter("# no frontmatter")).toThrow(/frontmatter/i)
  })

  it("normalizes padsplit-property-id to a string even when YAML emits a number", () => {
    const fm = parseFrontmatter(`---\naddress: "x"\npadsplit-property-id: 12345\n---\n`)
    expect(fm.padsplitPropertyId).toBe("12345")
  })
})
