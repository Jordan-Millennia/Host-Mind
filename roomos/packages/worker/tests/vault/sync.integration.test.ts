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

  it("move-out reconciliation: closes occupancy for a member no longer in the roster and marks the room vacant", async () => {
    // First sync establishes the property + its 6 roster rooms.
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const property = await prisma.property.findUnique({
      where: { padsplitPropertyId: "28685" },
    })
    expect(property).not.toBeNull()

    // Simulate a member who WAS occupying a room but is no longer in the
    // roster (moved out). Seed R99 + listing + an OPEN OCCUPIED occupancy.
    const room = await prisma.room.create({
      data: { orgId: ORG_ID, propertyId: property!.id, roomNumber: "R99" },
    })
    const listing = await prisma.platformListing.create({
      data: { orgId: ORG_ID, roomId: room.id, platform: "PADSPLIT" },
    })
    const member = await prisma.member.create({
      data: {
        orgId: ORG_ID,
        platform: "PADSPLIT",
        externalMemberId: `gone-${Date.now()}`,
        name: "Gone Member",
      },
    })
    const stale = await prisma.occupancy.create({
      data: {
        orgId: ORG_ID,
        listingId: listing.id,
        memberId: member.id,
        status: "OCCUPIED",
      },
    })

    // Re-sync: R99 is NOT in the fixture roster → must be reconciled out.
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })

    const closed = await prisma.occupancy.findUnique({ where: { id: stale.id } })
    expect(closed!.leaseEndDate).not.toBeNull() // moved-out occupancy closed

    const open = await prisma.occupancy.findFirst({
      where: { listingId: listing.id, leaseEndDate: null },
      orderBy: { createdAt: "desc" },
    })
    expect(open).not.toBeNull()
    expect(open!.status).toBe("VACANT")
    expect(open!.memberId).toBeNull()

    // The 6 real roster occupancies must remain open and untouched.
    const openRoster = await prisma.occupancy.count({
      where: { orgId: ORG_ID, leaseEndDate: null, memberId: { not: null } },
    })
    expect(openRoster).toBe(6)
  })

  it("move-out reconciliation is idempotent — a second pass adds no rows", async () => {
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const property = await prisma.property.findUnique({
      where: { padsplitPropertyId: "28685" },
    })
    const room = await prisma.room.create({
      data: { orgId: ORG_ID, propertyId: property!.id, roomNumber: "R98" },
    })
    const listing = await prisma.platformListing.create({
      data: { orgId: ORG_ID, roomId: room.id, platform: "PADSPLIT" },
    })
    const member = await prisma.member.create({
      data: {
        orgId: ORG_ID,
        platform: "PADSPLIT",
        externalMemberId: `gone2-${Date.now()}`,
        name: "Gone Member 2",
      },
    })
    await prisma.occupancy.create({
      data: { orgId: ORG_ID, listingId: listing.id, memberId: member.id, status: "OCCUPIED" },
    })
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT }) // reconciles R98 → VACANT
    const after1 = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT }) // must be a no-op
    const after2 = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    expect(after2).toBe(after1)
  })
})
