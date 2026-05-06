import { chromium } from "playwright";

async function main() {
  console.log("launching headful chromium...");
  const browser = await chromium.launch({ headless: false, timeout: 20000 });
  console.log("launched OK");
  const page = await browser.newPage();
  await page.goto("https://padsplit.com", { waitUntil: "domcontentloaded", timeout: 15000 });
  console.log("title:", await page.title());
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
  console.log("done");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
