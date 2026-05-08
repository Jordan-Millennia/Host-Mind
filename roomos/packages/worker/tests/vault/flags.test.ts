import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFlags } from "../../src/vault/parsers/flags"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseFlags", () => {
  it("extracts all blockquote lines under ## Flags & Alerts", () => {
    const flags = parseFlags(FIXTURE)
    expect(flags.length).toBeGreaterThanOrEqual(4)
  })

  it("infers DANGER from 🔴", () => {
    const flags = parseFlags(FIXTURE)
    const danger = flags.find((f) => f.title.includes("R3 VACANT"))
    expect(danger?.severity).toBe("DANGER")
  })

  it("infers WARN from ⚠️", () => {
    const flags = parseFlags(FIXTURE)
    const warn = flags.find((f) => f.title.includes("Kendra Shuck"))
    expect(warn?.severity).toBe("WARN")
  })

  it("infers OK from ✅", () => {
    const flags = parseFlags(FIXTURE)
    const ok = flags.find((f) => f.title.includes("Water leak"))
    expect(ok?.severity).toBe("OK")
  })

  it("captures the raw line for dedup hashing", () => {
    const flags = parseFlags(FIXTURE)
    expect(flags[0].rawLine.length).toBeGreaterThan(0)
  })

  it("returns empty array if there's no Flags & Alerts section", () => {
    expect(parseFlags("# nothing here")).toEqual([])
  })
})
