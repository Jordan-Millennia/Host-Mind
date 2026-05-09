import { describe, it, expect, vi, afterEach } from "vitest"
import { formatMoney, formatDate, formatDaysAgo, donutSegments } from "@/lib/format"

describe("formatMoney", () => {
  it("formats decimal-string dollars with thousands separators", () => {
    expect(formatMoney("420.00")).toBe("$420")
    expect(formatMoney("1234.56")).toBe("$1,234.56")
    expect(formatMoney("0.00")).toBe("$0")
  })
  it("returns em-dash for null/undefined", () => {
    expect(formatMoney(null)).toBe("—")
    expect(formatMoney(undefined)).toBe("—")
  })
  it("handles Decimal-like objects (Prisma.Decimal valueOf coercion)", () => {
    // Prisma's Decimal supports `Number(d)` via Symbol.toPrimitive / valueOf.
    // We simulate one with valueOf returning a primitive number.
    const decimalLike = { valueOf: () => 420, toString: () => "420.00" }
    expect(formatMoney(decimalLike)).toBe("$420")
    const decimalLike2 = { valueOf: () => 1234.56, toString: () => "1234.56" }
    expect(formatMoney(decimalLike2)).toBe("$1,234.56")
  })
})

describe("formatDate", () => {
  it("formats Date as 'MMM D, YYYY'", () => {
    expect(formatDate(new Date("2026-04-22T00:00:00Z"))).toBe("Apr 22, 2026")
  })
  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—")
  })
})

describe("formatDaysAgo", () => {
  afterEach(() => vi.useRealTimers())
  it("renders 'today', '1 day ago', '5 days ago'", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"))
    expect(formatDaysAgo(new Date("2026-05-03T08:00:00Z"))).toBe("today")
    expect(formatDaysAgo(new Date("2026-05-02T08:00:00Z"))).toBe("1 day ago")
    expect(formatDaysAgo(new Date("2026-04-28T08:00:00Z"))).toBe("5 days ago")
  })
})

describe("donutSegments", () => {
  it("returns empty array when total is 0", () => {
    expect(donutSegments({ occupied: 0, vacant: 0 })).toEqual([])
  })

  it("splits 4/2 into proportional lengths summing to ~88", () => {
    const seg = donutSegments({ occupied: 4, vacant: 2 })
    const sum = seg.reduce((s, x) => s + x.length, 0)
    expect(sum).toBeCloseTo(2 * Math.PI * 14, 1)
    expect(seg[0].color).toBe("occupied")
    expect(seg[1].color).toBe("vacant")
  })

  it("places moving segment between occupied and vacant", () => {
    const seg = donutSegments({ occupied: 3, moving: 1, vacant: 2 })
    expect(seg.map((s) => s.color)).toEqual(["occupied", "moving", "vacant"])
  })
})
