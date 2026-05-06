import { describe, it, expect } from "vitest"
import { parseSearchParams, buildWhereClause, type RoomFilter } from "@/lib/filters"

describe("parseSearchParams", () => {
  it("returns defaults when empty", () => {
    expect(parseSearchParams(new URLSearchParams())).toEqual({
      status: "all",
      ownerId: null,
      propertyId: null,
      q: "",
      sort: "address",
      page: 1,
    })
  })
  it("parses every supported key", () => {
    const sp = new URLSearchParams("status=past_due&ownerId=ow_1&propertyId=pr_2&q=marcus&sort=balance&page=3")
    expect(parseSearchParams(sp)).toEqual({
      status: "past_due",
      ownerId: "ow_1",
      propertyId: "pr_2",
      q: "marcus",
      sort: "balance",
      page: 3,
    })
  })
  it("clamps page below 1", () => {
    const sp = new URLSearchParams("page=0")
    expect(parseSearchParams(sp).page).toBe(1)
  })
  it("rejects unknown sort, falls back to address", () => {
    const sp = new URLSearchParams("sort=ssn")
    expect(parseSearchParams(sp).sort).toBe("address")
  })
})

describe("buildWhereClause", () => {
  it("scopes by orgId always", () => {
    const where = buildWhereClause("org_x", { status: "all", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 } as RoomFilter)
    expect(where.orgId).toBe("org_x")
  })
  it("encodes past_due as occupancy with daysPastDue >= 1 and balance > 0", () => {
    const where = buildWhereClause("org_x", { status: "past_due", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 })
    expect(where.listings).toMatchObject({
      some: {
        occupancies: {
          some: { status: { in: ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] }, daysPastDue: { gte: 1 }, currentBalance: { gt: 0 } },
        },
      },
    })
  })
  it("encodes vacant as listings with no active occupancy", () => {
    const where = buildWhereClause("org_x", { status: "vacant", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 })
    expect(where.listings).toMatchObject({
      some: { occupancies: { none: { status: { in: ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] } } } },
    })
  })
  it("free-text q matches address OR property name OR member name (case-insensitive)", () => {
    const where = buildWhereClause("org_x", { status: "all", ownerId: null, propertyId: null, q: "MARCUS", sort: "address", page: 1 })
    const orClause = where.OR as Array<Record<string, unknown>>
    const first = orClause?.[0]?.property as Record<string, Record<string, unknown>> | undefined
    expect(first?.address?.contains).toBe("MARCUS")
    expect(first?.address?.mode).toBe("insensitive")
  })
})
