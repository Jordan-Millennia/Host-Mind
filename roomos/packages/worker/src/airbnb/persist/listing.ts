import { prisma } from "@roomos/db"

export type UpsertAirbnbListingInput = {
  airbnbListingId: string
  roomId: string | null
  isActive: boolean
}

export async function upsertAirbnbListing(orgId: string, input: UpsertAirbnbListingInput): Promise<string> {
  const existing = await prisma.platformListing.findUnique({
    where: { platform_externalListingId: { platform: "AIRBNB", externalListingId: input.airbnbListingId } },
  })
  const data = {
    orgId,
    platform: "AIRBNB" as const,
    externalListingId: input.airbnbListingId,
    roomId: input.roomId,
    isActive: input.isActive,
    lastSyncedAt: new Date(),
  }
  if (existing) {
    await prisma.platformListing.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.platformListing.create({ data })
  return created.id
}
