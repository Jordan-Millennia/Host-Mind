import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { hasCookies, loadCookies, saveCookies } from "../cookies"
import { log } from "../log"
import { BROWSER_DEFAULTS } from "./stealth-config"

const SHOT_DIR = resolve(homedir(), "Library", "Application Support", "RoomOS", "screenshots")
mkdirSync(SHOT_DIR, { recursive: true })

export type SessionFn<T> = (ctx: { browser: Browser; context: BrowserContext; page: Page }) => Promise<T>

export type SessionOptions = {
  /** Show the browser window (interactive login). Default: false (headless). */
  headful?: boolean
}

/** Launches Chromium, restores `<platform>.json` cookies if present, runs `fn`,
 *  persists cookies on success, captures screenshot on failure. */
export async function withPlaywrightSession<T>(
  platform: string,
  fn: SessionFn<T>,
  opts: SessionOptions = {},
): Promise<T> {
  const cookieState = (await hasCookies(platform)) ? await loadCookies(platform) : null
  const headless = !opts.headful

  log.debug({ platform, headless, hasCookies: !!cookieState }, "launching browser")
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    ...BROWSER_DEFAULTS,
    storageState: cookieState ? { cookies: cookieState.cookies as never, origins: cookieState.origins as never } : undefined,
  })
  const page = await context.newPage()

  try {
    const result = await fn({ browser, context, page })
    const state = await context.storageState()
    await saveCookies(platform, { cookies: state.cookies as never, origins: state.origins as never })
    return result
  } catch (err) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const shotPath = resolve(SHOT_DIR, `${platform}_err_${ts}.png`)
    try {
      await page.screenshot({ path: shotPath, fullPage: true })
      log.error({ err: (err as Error).message, screenshot: shotPath }, "session failed")
      ;(err as Error & { screenshotPath?: string }).screenshotPath = shotPath
    } catch {
      log.error({ err: (err as Error).message }, "session failed (screenshot also failed)")
    }
    throw err
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
