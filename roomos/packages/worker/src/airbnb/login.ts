import type { Page } from "playwright"
import { withPlaywrightSession } from "../playwright/session"
import { airbnbSessionExists } from "./session"
import { log } from "../log"

const LOGIN_URL = "https://www.airbnb.com/login"
const HOST_DASHBOARD_URL = "https://www.airbnb.com/hosting"

/** Login is complete once the URL settles anywhere under /hosting. */
const HOST_DASHBOARD_READY_RE = /\/hosting(\/|$)/

/** Restores the saved Airbnb cookies and verifies they still authenticate by
 *  navigating to the hosting dashboard and confirming the URL stays on /hosting
 *  (an expired session bounces back to /login). Throws if the session expired. */
export async function checkAirbnbSession(): Promise<{ ok: true }> {
  if (!(await airbnbSessionExists())) {
    throw new Error("No saved Airbnb session. Run 'roomos-worker login --platform airbnb' first.")
  }
  return withPlaywrightSession("airbnb", async ({ page }: { page: Page }) => {
    await page.goto(HOST_DASHBOARD_URL, { waitUntil: "domcontentloaded" })
    await page.waitForURL(HOST_DASHBOARD_READY_RE, { timeout: 15_000 })
    log.info("airbnb session is active")
    return { ok: true }
  })
}

/**
 * Launches a HEADFUL Chromium at airbnb.com/login and waits for the user to
 * sign in (and complete any MFA / device verification). Resolves once the URL
 * lands on /hosting (= login complete). Cookies + storage_state persist via the
 * shared session helper's encrypted storageState mechanism (AES-256-GCM keyed
 * from the macOS Keychain — see ./session.ts), the same jar used for PadSplit.
 *
 * Idempotent: re-running while already signed in goes straight to /hosting and
 * refreshes the saved storage_state.
 */
export async function interactiveLogin(opts: { timeoutMs?: number } = {}): Promise<{ ok: true }> {
  const timeout = opts.timeoutMs ?? 10 * 60_000 // 10 min for the human + MFA

  return withPlaywrightSession(
    "airbnb",
    async ({ page }: { page: Page }) => {
      await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" })
      log.info("Waiting for you to sign into Airbnb in the open browser window (complete any MFA)…")
      await page.waitForURL(HOST_DASHBOARD_READY_RE, { timeout })
      log.info("Airbnb login successful — storage_state will be saved on close.")
      return { ok: true }
    },
    { headful: true },
  )
}
