import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { SELECTORS } from "./selectors"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { getOrg, startSyncRun, finishSyncRun, upsertDiscovery, type DiscoveredProperty, type DiscoveredRoom } from "../persist"

/** Walk /host/rooms (paginated) and return the unique property→room map. */
async function scrapeRoomsList(): Promise<{ properties: DiscoveredProperty[]; rooms: DiscoveredRoom[] }> {
  return withPlaywrightSession("padsplit", async ({ page }) => {
    await page.goto(PADSPLIT_URLS.rooms, { waitUntil: "domcontentloaded" })
    await page.waitForSelector(SELECTORS.propertyLink, { timeout: 15_000 })

    const propertyMap = new Map<string, DiscoveredProperty>()
    const roomEntries: DiscoveredRoom[] = []

    let pageNum = 0
    for (; pageNum < 20; pageNum++) {
      // Wait for rows to render
      await jitterSleep(1500)

      const rowsOnThisPage = await page.$$eval(
        SELECTORS.propertyLink,
        (links) =>
          links.map((a) => {
            const href = a.getAttribute("href") ?? ""
            const m = href.match(/\/host\/listing\/(\d+)/)
            const externalPropertyId = m ? m[1]! : ""
            const address = (a.textContent ?? "").trim()
            // Walk up to the row to find the rendered "ID: <num>"
            let row: Element | null = a
            for (let i = 0; i < 6 && row; i++) row = row.parentElement
            const rowText = row?.textContent ?? ""
            const idMatch = rowText.match(/ID:\s*(\d+)/)
            const externalRoomId = idMatch ? idMatch[1]! : ""
            return { externalPropertyId, externalRoomId, address }
          }),
      )

      for (const r of rowsOnThisPage) {
        if (!r.externalPropertyId || !r.externalRoomId) continue
        if (!propertyMap.has(r.externalPropertyId)) {
          propertyMap.set(r.externalPropertyId, {
            externalPropertyId: r.externalPropertyId,
            address: r.address,
          })
        }
        roomEntries.push({
          externalPropertyId: r.externalPropertyId,
          externalRoomId: r.externalRoomId,
        })
      }

      // Try to advance to the next page. PadSplit's Material UI pagination
      // exposes a "Next" button; absence means we're done.
      const nextBtn = page.locator('button[aria-label="Go to next page"]')
      const disabled = (await nextBtn.count()) === 0 || (await nextBtn.isDisabled().catch(() => true))
      if (disabled) break
      await nextBtn.click()
      await jitterSleep(2500)
    }

    log.info({ pages: pageNum + 1, properties: propertyMap.size, rooms: roomEntries.length }, "rooms-list scraped")
    return { properties: Array.from(propertyMap.values()), rooms: roomEntries }
  })
}

/** Top-level discovery job: scrape, upsert, write sync_runs. */
export async function runDiscovery(): Promise<{ propertiesAdded: number; roomsAdded: number; listingsAdded: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "DISCOVERY", platform: "PADSPLIT" })

  try {
    const { properties, rooms } = await scrapeRoomsList()
    const result = await upsertDiscovery(org.id, properties, rooms)
    await finishSyncRun(runId, {
      status: "SUCCESS",
      itemsSynced: result.propertiesAdded + result.roomsAdded + result.listingsAdded,
    })
    return result
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
