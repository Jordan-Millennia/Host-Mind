// Debug script: open one PadSplit property page and print raw room card text
// Uses the compiled dist modules so cookies decrypt correctly via keychain.
// Run from packages/worker: node debug-room-cards.mjs

import { createRequire } from "node:module"
import { chromium } from "playwright"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { hasCookies, loadCookies } = require("./dist/cookies.js")

const PROP_ID = "8517"
const PROPERTY_URL = `https://www.padsplit.com/host/listing/${PROP_ID}`

if (!(await hasCookies("padsplit"))) {
  console.error("No padsplit cookies found — run the login flow first")
  process.exit(1)
}

const cookieState = await loadCookies("padsplit")
console.log(`Loaded ${cookieState.cookies.length} cookies`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  storageState: { cookies: cookieState.cookies, origins: cookieState.origins ?? [] },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
})
const page = await context.newPage()

console.log(`Navigating to ${PROPERTY_URL} ...`)
await page.goto(PROPERTY_URL, { waitUntil: "domcontentloaded" })

try {
  await page.waitForSelector(".Room_root__XM73E", { timeout: 15_000 })
  console.log("Room cards selector matched!\n")
} catch {
  console.log("TIMEOUT: .Room_root__XM73E selector found nothing after 15s")
  await page.screenshot({ path: "/tmp/debug-room-page.png", fullPage: true })
  console.log("Screenshot saved: /tmp/debug-room-page.png")
  console.log("Final URL:", page.url())
  console.log("Title:", await page.title())

  // Fallback: look for any Room-like class
  const roomClasses = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[class]"))
      .map(el => el.className)
      .filter(c => /room/i.test(c))
      .slice(0, 20)
  )
  console.log("Classes matching /room/i:", roomClasses)

  await browser.close()
  process.exit(1)
}

const result = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".Room_root__XM73E"))
  return cards.map((card, i) => {
    const allText = (card.textContent ?? "").replace(/\s+/g, " ").trim()
    const statusMatch = allText.match(
      /\b(Occupied|Vacant|Moving in|Moving out|Needs flip|Waiting for approval|Inactive)/i
    )
    const idMatch = allText.match(/\(Room\s+(\d+)\)/i)
    return {
      index: i,
      roomNumber: idMatch ? idMatch[1] : "(none)",
      statusMatch: statusMatch ? statusMatch[1] : "(NO MATCH)",
      rawText: allText.substring(0, 400),
    }
  })
})

console.log(`Found ${result.length} room cards for property ${PROP_ID}:\n`)
for (const r of result) {
  console.log(`  Card [${r.index}]: Room #${r.roomNumber}  |  Status regex match: "${r.statusMatch}"`)
  console.log(`  Raw text: ${r.rawText}`)
  console.log()
}

await browser.close()
console.log("Done.")
