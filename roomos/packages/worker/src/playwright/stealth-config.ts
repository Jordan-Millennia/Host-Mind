// Note: deliberately NO puppeteer-extra-stealth. We rely on the residential IP
// and real Mac fingerprint. Importing stealth would be a tell — a real human's
// Chrome doesn't ship those overrides.
export const BROWSER_DEFAULTS = {
  viewport: { width: 1440, height: 900 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  locale: "en-US",
  timezoneId: "America/New_York",
} as const
