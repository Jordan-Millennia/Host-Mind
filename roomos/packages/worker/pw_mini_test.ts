import { chromium } from "playwright";

async function main() {
  console.log("playwright imported, chromium type:", typeof chromium);
  const exe = chromium.executablePath();
  console.log("executablePath:", exe);

  console.log("launching headless...");
  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  console.log("launched headless OK");
  await browser.close();
  console.log("done");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
