import type { Page } from "playwright"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { SELECTORS } from "./selectors"
import { log } from "../log"

/** Restores existing cookies and verifies they still authenticate by checking
 *  for the host nav. Throws if the session expired. */
export async function checkPadsplitSession(): Promise<{ ok: true }> {
  return withPlaywrightSession("padsplit", async ({ page }) => {
    await page.goto(PADSPLIT_URLS.dashboard, { waitUntil: "domcontentloaded" })
    await page.waitForSelector(SELECTORS.hostNav, { timeout: 10_000 })
    log.info("padsplit session is active")
    return { ok: true }
  })
}

/** Launches a HEADFUL browser at the PadSplit login page and waits for the
 *  user to sign in. Resolves when the host nav appears. Cookies persist via
 *  the session helper's storageState mechanism. */
export async function interactiveLogin(opts: { timeoutMs?: number } = {}): Promise<{ ok: true }> {
  const timeout = opts.timeoutMs ?? 5 * 60_000  // 5 min for the human

  return withPlaywrightSession(
    "padsplit",
    async ({ page }: { page: Page }) => {
      await page.goto(PADSPLIT_URLS.dashboard, { waitUntil: "domcontentloaded" })
      log.info("Waiting for you to sign into PadSplit in the open browser window…")
      await page.waitForSelector(SELECTORS.hostNav, { timeout })
      log.info("PadSplit login successful — cookies will be saved on close.")
      return { ok: true }
    },
    { headful: true },
  )
}
