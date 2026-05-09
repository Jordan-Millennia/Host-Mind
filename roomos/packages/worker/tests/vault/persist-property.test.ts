import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertProperty } from "../../src/vault/persist/property"

const ORG_ID = "org-test-2a"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2A" } })
})

describe("upsertProperty", () => {
  it("creates a new property when padsplitPropertyId is unseen", async () => {
    const id = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "11111",
      address: "1 Test Lane",
      city: "Jacksonville",
      state: "FL",
      market: "Jacksonville",
      vaultFilePath: "/v/1.md",
    })
    const row = await prisma.property.findUnique({ where: { id } })
    expect(row?.padsplitPropertyId).toBe("11111")
    expect(row?.address).toBe("1 Test Lane")
  })

  it("updates the same property on second call (idempotent)", async () => {
    const id1 = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "22222",
      address: "First Address",
      vaultFilePath: "/v/2.md",
    })
    const id2 = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "22222",
      address: "Second Address",
      vaultFilePath: "/v/2.md",
    })
    expect(id2).toBe(id1)
    const row = await prisma.property.findUnique({ where: { id: id1 } })
    expect(row?.address).toBe("Second Address")
  })

  it("derives city from comma-separated address when city is not provided", async () => {
    const id = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "33333",
      address: "5 Sample Ave, Tampa, FL 33602",
      vaultFilePath: "/v/3.md",
    })
    const row = await prisma.property.findUnique({ where: { id } })
    expect(row?.city).toBe("Tampa")
  })
})
