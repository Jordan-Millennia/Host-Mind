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

    // Find or create the PlatformListing. (Phase 2B: lookup key is now
    // (platform, externalListingId); Phase-1B path is retired/dead but must
    // compile against the current schema.)
    const existingListing = await prisma.platformListing.findUnique({
      where: {
        platform_externalListingId: {
          platform: "PADSPLIT" as Platform,
          externalListingId: r.externalRoomId,
        },
      },
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

export async function upsertMember(args: {
  orgId: string
  externalMemberId: string
  name: string
  profileUrl?: string
}): Promise<{ id: string }> {
  return prisma.member.upsert({
    where: {
      platform_externalMemberId: { platform: "PADSPLIT" as Platform, externalMemberId: args.externalMemberId },
    },
    create: {
      orgId: args.orgId,
      platform: "PADSPLIT",
      externalMemberId: args.externalMemberId,
      name: args.name,
      profileUrl: args.profileUrl,
    },
    update: { name: args.name, profileUrl: args.profileUrl },
    select: { id: true },
  })
}

export async function upsertOccupancy(args: {
  orgId: string
  listingId: string
  memberId: string | null
  status: OccupancyStatus
  moveInDate: string | null
  leaseEndDate: string | null
}): Promise<void> {
  // Always maintain exactly one current-state row per listing.
  // Find any existing row (regardless of status) and update it in place,
  // or create one if none exists yet.
  const existing = await prisma.occupancy.findFirst({
    where: { orgId: args.orgId, listingId: args.listingId },
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    await prisma.occupancy.update({
      where: { id: existing.id },
      data: {
        memberId: args.memberId,
        status: args.status,
        moveInDate: args.moveInDate ? new Date(args.moveInDate) : null,
        leaseEndDate: args.leaseEndDate ? new Date(args.leaseEndDate) : null,
        scrapedAt: new Date(),
      },
    })
  } else {
    await prisma.occupancy.create({
      data: {
        orgId: args.orgId,
        listingId: args.listingId,
        memberId: args.memberId,
        status: args.status,
        moveInDate: args.moveInDate ? new Date(args.moveInDate) : null,
        leaseEndDate: args.leaseEndDate ? new Date(args.leaseEndDate) : null,
        scrapedAt: new Date(),
      },
    })
  }
}

export async function updateOccupancyFinancials(args: {
  occupancyId: string
  balance: string | null
  daysPastDue: number | null
  lastPaymentAmount: string | null
  lastPaymentAt: string | null
}): Promise<void> {
  await prisma.occupancy.update({
    where: { id: args.occupancyId },
    data: {
      currentBalance: args.balance ?? null,
      daysPastDue: args.daysPastDue,
      lastPaymentAmount: args.lastPaymentAmount ?? null,
      lastPaymentAt: args.lastPaymentAt ? new Date(args.lastPaymentAt) : null,
      lastFinancialSyncAt: new Date(),
    },
  })
}

export async function recordPaymentEvent(args: {
  orgId: string
  memberId: string
  occupancyId: string | null
  amount: string
  eventDate: string
  externalEventId: string  // hash of (memberId, amount, eventDate, source)
}): Promise<void> {
  await prisma.paymentEvent.upsert({
    where: {
      memberId_externalEventId: { memberId: args.memberId, externalEventId: args.externalEventId },
    },
    create: {
      orgId: args.orgId,
      memberId: args.memberId,
      occupancyId: args.occupancyId,
      amount: args.amount,
      eventType: "PAYMENT",
      eventDate: new Date(args.eventDate),
      source: "PADSPLIT_SCRAPE",
      externalEventId: args.externalEventId,
    },
    update: {},
  })
}
