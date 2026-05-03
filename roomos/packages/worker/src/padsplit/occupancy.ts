import { prisma } from "@roomos/db"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { parseListingPage } from "./parsers"
import {
  getOrg,
  startSyncRun,
  finishSyncRun,
  upsertMember,
  upsertOccupancy,
} from "../persist"

/** Walks every active PadSplit property page, parses room cards, upserts
 *  member + occupancy rows. Spaced over a long window via jitter. */
export async function runOccupancy(): Promise<{ propertiesScraped: number; roomsUpdated: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "OCCUPANCY", platform: "PADSPLIT" })

  // Pull the list of active PadSplit listings from our own DB.
  const listings = await prisma.platformListing.findMany({
    where: { orgId: org.id, platform: "PADSPLIT", isActive: true },
    select: {
      id: true,
      externalListingId: true,
      externalPropertyId: true,
    },
  })

  // Group by property — one fetch per property page.
  const byProperty = new Map<string, { listingId: string; externalRoomId: string }[]>()
  for (const l of listings) {
    if (!l.externalPropertyId || !l.externalListingId) continue
    if (!byProperty.has(l.externalPropertyId)) byProperty.set(l.externalPropertyId, [])
    byProperty.get(l.externalPropertyId)!.push({ listingId: l.id, externalRoomId: l.externalListingId })
  }

  let propertiesScraped = 0
  let roomsUpdated = 0

  try {
    await withPlaywrightSession("padsplit", async ({ page }) => {
      for (const [propId, listingsForProp] of byProperty) {
        await page.goto(PADSPLIT_URLS.property(propId), { waitUntil: "domcontentloaded" })
        await page.waitForSelector(".Room_root__XM73E", { timeout: 15_000 })
        const html = await page.content()
        const parsed = parseListingPage(html)

        for (const card of parsed.rooms) {
          const target = listingsForProp.find((l) => l.externalRoomId === card.externalRoomId)
          if (!target) continue

          let memberId: string | null = null
          if (card.member) {
            const m = await upsertMember({
              orgId: org.id,
              externalMemberId: card.member.externalMemberId,
              name: card.member.name,
              profileUrl: PADSPLIT_URLS.member(card.member.externalMemberId),
            })
            memberId = m.id
          }

          await upsertOccupancy({
            orgId: org.id,
            listingId: target.listingId,
            memberId,
            status: card.status,
            moveInDate: card.moveInDate,
            leaseEndDate: card.leaseEndDate,
          })

          await prisma.platformListing.update({
            where: { id: target.listingId },
            data: { lastSyncedAt: new Date() },
          })

          roomsUpdated++
        }

        propertiesScraped++
        await jitterSleep(5000)
      }
    })

    await finishSyncRun(runId, { status: "SUCCESS", itemsSynced: roomsUpdated })
    log.info({ propertiesScraped, roomsUpdated }, "occupancy sync complete")
    return { propertiesScraped, roomsUpdated }
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message, propertiesScraped, roomsUpdated },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
