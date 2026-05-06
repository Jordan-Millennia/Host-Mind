import { describe, it, expect, vi, afterEach } from "vitest"
import { formatMoney, formatDate, formatDaysAgo } from "@/lib/format"

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
