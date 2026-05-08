import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { syncVault } from "../../src/vault/sync"
import { join } from "node:path"

const ORG_ID = "org-test-2a-sync"
const FIXTURE_VAULT = join(__dirname, "../fixtures/vault")

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG SYNC" } })
})

describe("syncVault (integration, fixture vault)", () => {
  it("end-to-end: parses 1311 Morgana fixture and writes property + 6 rooms + 6 occupancies + flags", async () => {
    const result = await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    expect(result.errors).toEqual([])
    expect(result.propertiesUpserted).toBe(1)
    expect(result.roomsUpserted).toBe(6)
    expect(result.occupanciesUpserted).toBe(6)
    expect(result.flagsUpserted).toBeGreaterThanOrEqual(4)

    const property = await prisma.property.findUnique({ where: { padsplitPropertyId: "28685" } })
    expect(property).not.toBeNull()
    const rooms = await prisma.room.findMany({ where: { propertyId: property!.id } })
    expect(rooms.map((r) => r.roomNumber).sort()).toEqual(["R1", "R2", "R3", "R4", "R5", "R6"])
  })

  it("running twice is idempotent — second run produces 0 new rows", async () => {
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const before = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    const flagsBefore = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const after = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    const flagsAfter = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    expect(after).toBe(before)
    expect(flagsAfter).toBe(flagsBefore)
  })

  it("writes a SyncRun row with kind=VAULT_SYNC and status=SUCCESS", async () => {
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const run = await prisma.syncRun.findFirst({
      where: { orgId: ORG_ID, kind: "VAULT_SYNC" },
      orderBy: { startedAt: "desc" },
    })
    expect(run?.status).toBe("SUCCESS")
    expect(run?.itemsSynced).toBeGreaterThan(0)
  })
})
