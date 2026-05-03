import { prisma } from "@roomos/db"
import type { Platform, OccupancyStatus, SyncKind, SyncRunStatus } from "@roomos/db"
import { log } from "./log"

/** Returns the singleton CoHost Management org, or throws if it's not seeded. */
export async function getOrg(): Promise<{ id: string }> {
  const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
  if (!org) throw new Error("CoHost Management org not seeded")
  return { id: org.id }
}

export type DiscoveredProperty = {
  externalPropertyId: string
  address: string
  city?: string
}

export type DiscoveredRoom = {
  externalPropertyId: string
  externalRoomId: string
  roomNumber?: string
}

/** Idempotently upserts properties + rooms + listings from a discovery run. */
export async function upsertDiscovery(
  orgId: string,
  properties: DiscoveredProperty[],
  rooms: DiscoveredRoom[],
): Promise<{ propertiesAdded: number; roomsAdded: number; listingsAdded: number }> {
  let propertiesAdded = 0
  let roomsAdded = 0
  let listingsAdded = 0

  // External-id → internal id map for properties
  const propertyIdMap = new Map<string, string>()

  for (const p of properties) {
    const ext = `padsplit:${p.externalPropertyId}`
    const existing = await prisma.property.findFirst({
      where: { orgId, name: ext },
    })
    if (existing) {
      propertyIdMap.set(p.externalPropertyId, existing.id)
      continue
    }
    const created = await prisma.property.create({
      data: { orgId, name: ext, address: p.address, city: p.city ?? null },
    })
    propertyIdMap.set(p.externalPropertyId, created.id)
    propertiesAdded++
  }

  for (const r of rooms) {
    const propertyId = propertyIdMap.get(r.externalPropertyId)
    if (!propertyId) {
      log.warn({ r }, "skipping room — property not found")
      continue
    }

    // Find or create the Room (by org + property + roomNumber).
    let room = await prisma.room.findFirst({
      where: { orgId, propertyId, roomNumber: r.externalRoomId },
    })
    if (!room) {
      room = await prisma.room.create({
        data: { orgId, propertyId, roomNumber: r.externalRoomId },
      })
      roomsAdded++
    }

    // Find or create the PlatformListing.
    const existingListing = await prisma.platformListing.findUnique({
      where: { roomId_platform: { roomId: room.id, platform: "PADSPLIT" as Platform } },
    })
    if (!existingListing) {
      await prisma.platformListing.create({
        data: {
          orgId,
          roomId: room.id,
          platform: "PADSPLIT",
          externalListingId: r.externalRoomId,
          externalPropertyId: r.externalPropertyId,
          isActive: true,
        },
      })
      listingsAdded++
    }
  }

  return { propertiesAdded, roomsAdded, listingsAdded }
}

/** Records a sync_runs row at start; returns the id so the caller can update it on finish. */
export async function startSyncRun(opts: { orgId: string; kind: SyncKind; platform: Platform }): Promise<string> {
  const run = await prisma.syncRun.create({
    data: { orgId: opts.orgId, kind: opts.kind, platform: opts.platform, status: "RUNNING" },
  })
  return run.id
}

export async function finishSyncRun(
  id: string,
  outcome: { status: SyncRunStatus; itemsSynced?: number; errors?: unknown; screenshots?: unknown },
): Promise<void> {
  await prisma.syncRun.update({
    where: { id },
    data: {
      completedAt: new Date(),
      status: outcome.status,
      itemsSynced: outcome.itemsSynced ?? 0,
      errorsJson: (outcome.errors as object | null | undefined) ?? undefined,
      screenshotsJson: (outcome.screenshots as object | null | undefined) ?? undefined,
    },
  })
}

export type ParsedRoomState = {
  externalRoomId: string
  status: OccupancyStatus
  externalMemberId: string | null
  memberName: string | null
  moveInDate: string | null
  leaseEndDate: string | null
}
