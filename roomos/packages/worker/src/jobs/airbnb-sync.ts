import type { Page } from "playwright"
import { withPlaywrightSession } from "../playwright/session"
import { getOrg } from "../persist"
import { log } from "../log"
import { airbnbSessionExists } from "../airbnb/session"
import { parseHostingListings } from "../airbnb/parsers/listings"
import { parseAirbnbBookings, parseAirbnbTransactions } from "../airbnb/parsers/reservations"
import { attachListingIdsByTitle, syncAirbnbWithRows } from "../airbnb/sync"
import type { AirbnbSyncResult } from "../airbnb/types"

// NOTE on URLs (verified against Jordan's live host account, 2026-05): the spec's
// /hosting/calendar/<id> and /hosting/transactions are both 404 now. Listings live
// at /hosting/listings; bookings AND payouts both come from a single
// /hosting/reservations/all table, so there is no per-listing calendar loop.
const LISTINGS_URL = "https://www.airbnb.com/hosting/listings"
const RESERVATIONS_URL = "https://www.airbnb.com/hosting/reservations/all"

const NAV_TIMEOUT = 60_000
const TABLE_TIMEOUT = 30_000

/** Polite human-ish pause between page loads (2–6 s). */
const jitter = () => new Promise((r) => setTimeout(r, 2000 + Math.random() * 4000))

/** Navigate, wait for the table to render, and return the page HTML. A missing
 *  table is not fatal — we return whatever rendered and let the parser yield []. */
async function fetchTableHtml(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
  try {
    await page.waitForSelector("table tbody tr", { timeout: TABLE_TIMEOUT })
  } catch {
    log.warn({ url }, "airbnb-sync: no table rows rendered before timeout — parsing whatever loaded")
  }
  return page.content()
}

/**
 * Live Airbnb reconciliation. Drives Playwright against the saved (encrypted)
 * host session, scrapes the listings + reservations pages, parses them, resolves
 * each booking's numeric listing id by title, then hands everything to
 * syncAirbnbWithRows. withPlaywrightSession restores the cookie jar before `fn`
 * and persists the refreshed jar afterward, so no manual storage-state handling
 * is needed here.
 *
 * Known v1 limitation: only the first reservations page is captured (~25–40 most
 * recent rows). Full pagination is a follow-up.
 */
export async function processAirbnbSync(): Promise<AirbnbSyncResult | { skipped: true }> {
  if (!(await airbnbSessionExists())) {
    log.warn("Airbnb storage state missing — skipping airbnb-sync. Run 'roomos-worker login --platform airbnb' first.")
    return { skipped: true }
  }
  const org = await getOrg()

  return withPlaywrightSession("airbnb", async ({ page }: { page: Page }) => {
    // 1. /hosting/listings → the only page that exposes numeric listing ids.
    const listingsHtml = await fetchTableHtml(page, LISTINGS_URL)
    // An expired session bounces to /login; bail loudly rather than parsing an
    // empty page as "0 listings / 0 reservations" and silently wiping nothing.
    if (/\/login/.test(page.url())) {
      log.warn("airbnb-sync: session expired (redirected to /login) — skipping. Re-run 'login --platform airbnb'.")
      return { skipped: true }
    }
    const listings = parseHostingListings(listingsHtml)

    // 2. /hosting/reservations/all → one table carrying both bookings and payouts.
    await jitter()
    const reservationsHtml = await fetchTableHtml(page, RESERVATIONS_URL)
    const transactions = parseAirbnbTransactions(reservationsHtml)
    // Bookings arrive with airbnbListingId="" (the table hides it); resolve by title.
    const bookings = attachListingIdsByTitle(listings, parseAirbnbBookings(reservationsHtml))

    // 3. Persist everything.
    const result = await syncAirbnbWithRows({ orgId: org.id, listings, bookings, transactions })
    log.info({ result }, "airbnb-sync: complete")
    return result
  })
}
