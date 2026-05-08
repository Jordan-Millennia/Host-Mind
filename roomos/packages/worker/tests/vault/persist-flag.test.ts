import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertFlag } from "../../src/vault/persist/flag"

const ORG_ID = "org-test-2a-flag"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedProperty() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG FLAG" } })
  const property = await prisma.property.create({
    data: { orgId: org.id, address: "x", padsplitPropertyId: `f-${Date.now()}` },
  })
  return property
}

describe("upsertFlag", () => {
  it("creates a new flag with severity + sourceRef", async () => {
    const property = await seedProperty()
    await upsertFlag({
      orgId: ORG_ID,
      propertyId: property.id,
      severity: "DANGER",
      title: "R3 VACANT — relist",
      body: "Katrina moved out",
      rawLine: "🔴 R3 VACANT — Katrina moved out",
    })
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].severity).toBe("DANGER")
    expect(rows[0].source).toBe("VAULT_SYNC")
  })

  it("is idempotent — same rawLine produces no new row", async () => {
    const property = await seedProperty()
    const args = {
      orgId: ORG_ID,
      propertyId: property.id,
      severity: "WARN" as const,
      title: "x",
      body: "y",
      rawLine: "⚠️ x — y",
    }
    await upsertFlag(args)
    await upsertFlag(args)
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(1)
  })

  it("a different rawLine creates a second flag row", async () => {
    const property = await seedProperty()
    await upsertFlag({
      orgId: ORG_ID, propertyId: property.id,
      severity: "WARN", title: "first", body: "", rawLine: "⚠️ first",
    })
    await upsertFlag({
      orgId: ORG_ID, propertyId: property.id,
      severity: "INFO", title: "second", body: "", rawLine: "📋 second",
    })
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(2)
  })
})
