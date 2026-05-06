import { describe, it, expect } from "vitest"
import { toCsv } from "@/lib/csv"

describe("toCsv", () => {
  it("emits header + rows with no escaping needed", () => {
    const out = toCsv(
      [{ a: "x", b: 1 }, { a: "y", b: 2 }],
      [{ key: "a", header: "Letter" }, { key: "b", header: "Number" }],
    )
    expect(out).toBe(`Letter,Number\nx,1\ny,2`)
  })

  it("escapes commas, quotes, and newlines per RFC 4180", () => {
    const out = toCsv(
      [{ a: 'has "quote"', b: "1,2,3", c: "line\nbreak" }],
      [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }],
    )
    expect(out).toBe(`A,B,C\n"has ""quote""","1,2,3","line\nbreak"`)
  })

  it("renders null/undefined as empty", () => {
    const out = toCsv([{ a: null, b: undefined, c: "ok" }], [
      { key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" },
    ])
    expect(out).toBe("A,B,C\n,,ok")
  })
})
