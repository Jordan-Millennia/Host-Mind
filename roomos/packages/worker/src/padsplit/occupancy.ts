import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { jitterSleep } from "../jitter"
import { log } from "../log"
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

        // Parse room cards via page.evaluate() to avoid jsdom (incompatible with Node ≥ 24).
        // Room number is embedded in the card heading as "Color (Room N)".
        const parsed = await page.evaluate(() => {
          const STATUS_MAP: Record<string, string> = {
            occupied: "OCCUPIED",
            vacant: "VACANT",
            "moving in": "MOVING_IN",
            "moving out": "MOVING_OUT",
            "needs flip": "NEEDS_FLIP",
            "waiting for approval": "WAITING_APPROVAL",
            inactive: "INACTIVE",
          }
          const MONTHS: Record<string, string> = {
            Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
            Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
          }
          const parseDate = (text: string): string | null => {
            const m = text.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})$/)
            if (!m) return null
            const mm = MONTHS[m[1]!]
            if (!mm) return null
            return `${m[3]}-${mm}-${m[2]!.padStart(2, "0")}`
          }
          const parseDateRange = (text: string) => {
            const m = text.match(
              /([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})\s*[-–]\s*(present|[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/,
            )
            if (!m) return { start: null as string | null, end: null as string | null }
            return { start: parseDate(m[1]!), end: /^present$/i.test(m[2]!) ? null : parseDate(m[2]!) }
          }

          const rooms = Array.from(document.querySelectorAll(".Room_root__XM73E")).map((card) => {
            const allText = card.textContent ?? ""
            const idMatch = allText.match(/\(Room\s+(\d+)\)/i)
            const externalRoomId = idMatch ? idMatch[1]! : ""
            const statusMatch = allText.match(
              /\b(Occupied|Vacant|Moving in|Moving out|Needs flip|Waiting for approval|Inactive)\b/i,
            )
            const occStatus: string = STATUS_MAP[statusMatch ? statusMatch[1]!.toLowerCase() : ""] ?? "INACTIVE"
            const memberLink = card.querySelector('a[href*="/host/member/"]')
            let member: { externalMemberId: string; name: string } | null = null
            if (memberLink) {
              const href = memberLink.getAttribute("href") ?? ""
              const mId = href.match(/\/host\/member\/(\d+)/)
              member = { externalMemberId: mId ? mId[1]! : "", name: memberLink.textContent?.trim() ?? "" }
            }
            const dates = parseDateRange(allText)
            return { externalRoomId, status: occStatus, member, moveInDate: dates.start, leaseEndDate: dates.end }
          })
          return { rooms }
        })

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
            status: card.status as OccupancyStatus,
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
