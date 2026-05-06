const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const

/** Accepts strings, numbers, and Decimal-like objects (Prisma.Decimal coerces
 *  via valueOf when passed to Number()). Returns em-dash for nullish or NaN. */
export function formatMoney(amount: unknown): string {
  if (amount === null || amount === undefined) return "—"
  const n = typeof amount === "number" ? amount : Number(amount as never)
  if (!Number.isFinite(n)) return "—"
  const isWhole = n === Math.trunc(n)
  return isWhole
    ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—"
  // Use UTC to avoid TZ surprises with @db.Date columns.
  const m = MONTHS[d.getUTCMonth()]
  return `${m} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function formatDaysAgo(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—"
  const ms = now.getTime() - d.getTime()
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days <= 0) return "today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}
