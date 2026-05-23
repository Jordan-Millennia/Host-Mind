import { JSDOM } from "jsdom"
import type { AirbnbBookingRow, AirbnbTransactionRow } from "../types"

/**
 * The captured file `hosting-transactions.html` is actually the
 * /hosting/reservations/all table — a single real <table> that carries BOTH
 * booking and payout data. One parse pass yields both shapes.
 *
 * Header order (verified): Status | Guests | Contact | Check-in | Checkout |
 * Booked | Listing | Confirmation Code | Total Payout | Actions. We map cells
 * by header NAME (the column count differs from the stale plan), and hook only
 * on stable anchors — the guest /users/profile/<id> link and visible text —
 * never on hashed class names.
 *
 * The reservations table does NOT expose the listing's numeric id, so
 * `airbnbListingId` is left "" and the listing NAME is carried on `listingTitle`
 * for a later bookings→listings join by title.
 */

type ResRow = {
  confirmationCode: string
  listingTitle: string
  guestName: string
  guestUserId: string | null
  checkIn: string
  checkOut: string
  status: AirbnbBookingRow["status"]
  amount: number
  isCanceled: boolean
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

function parseReservationRows(html: string): ResRow[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const table = doc.querySelector("table")
  if (!table) return []

  const headers = [...table.querySelectorAll("thead th, thead td")].map((c) =>
    (c.textContent ?? "").trim().toLowerCase(),
  )
  const col = (name: string) => headers.findIndex((h) => h === name.toLowerCase())
  const iStatus = col("Status")
  const iGuests = col("Guests")
  const iCheckin = col("Check-in")
  const iCheckout = col("Checkout")
  const iListing = col("Listing")
  const iCode = col("Confirmation Code")
  const iPayout = col("Total Payout")

  const out: ResRow[] = []
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = [...tr.querySelectorAll(":scope > td, :scope > th")]
    if (cells.length === 0) continue

    const cellText = (i: number) => (i >= 0 ? (cells[i]?.textContent ?? "").trim() : "")

    const confirmationCode = cellText(iCode).match(/HM[A-Z0-9]{6,}/)?.[0] ?? ""
    if (!confirmationCode) continue // no join key → not a real reservation row

    const guestCell = iGuests >= 0 ? cells[iGuests] : undefined
    const guestName = guestCell ? firstTextNode(guestCell) : ""
    const guestHref = guestCell?.querySelector("a[href]")?.getAttribute("href") ?? ""
    const guestUserId = guestHref.match(/\/users\/profile\/(\d+)/)?.[1] ?? null

    const statusText = cellText(iStatus)
    const isCanceled = /cancel/i.test(statusText)

    out.push({
      confirmationCode,
      listingTitle: cellText(iListing),
      guestName,
      guestUserId,
      checkIn: toISO(cellText(iCheckin)),
      checkOut: toISO(cellText(iCheckout)),
      status: mapStatus(statusText),
      amount: parseMoney(cellText(iPayout)),
      isCanceled,
    })
  }
  return out
}

export function parseAirbnbBookings(html: string): AirbnbBookingRow[] {
  return parseReservationRows(html).map((r) => ({
    airbnbListingId: "", // not exposed in the reservations table — join via listingTitle
    listingTitle: r.listingTitle,
    confirmationCode: r.confirmationCode,
    guestName: r.guestName,
    guestUserId: r.guestUserId,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
  }))
}

export function parseAirbnbTransactions(html: string): AirbnbTransactionRow[] {
  return parseReservationRows(html).map((r) => ({
    confirmationCode: r.confirmationCode,
    listingTitle: r.listingTitle,
    // Checkout is the best available date for when the payout lands.
    payoutDate: r.checkOut,
    grossAmount: r.amount,
    netAmount: r.amount, // no separate Airbnb fee column is shown — gross == net
    type: r.isCanceled ? "adjustment" : "payout",
  }))
}

/** First non-empty text node in document order (the guest's full visible name). */
function firstTextNode(el: Element): string {
  const walk = (node: Node): string => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const t = (child.textContent ?? "").replace(/\s+/g, " ").trim()
        if (t) return t
      } else if (child.nodeType === 1) {
        const t = walk(child)
        if (t) return t
      }
    }
    return ""
  }
  return walk(el)
}

/** "May 17, 2026" → "2026-05-17". Returns "" if unparseable. */
function toISO(text: string): string {
  const m = text.match(/([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return ""
  const month = MONTHS[m[1]!.toLowerCase()]
  if (!month) return ""
  return `${m[3]}-${month}-${m[2]!.padStart(2, "0")}`
}

/** "$1,939.19" → 1939.19; "$0.00" → 0; "" → 0. */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, "")
  if (!cleaned) return 0
  const n = Number.parseFloat(cleaned)
  return Number.isNaN(n) ? 0 : n
}

function mapStatus(text: string): AirbnbBookingRow["status"] {
  const t = text.toLowerCase()
  if (t.includes("cancel")) return "canceled"
  if (t.includes("currently hosting") || t.includes("confirmed") || t.includes("review guest")) {
    return "confirmed"
  }
  if (t.includes("completed") || t.includes("past")) return "completed"
  if (t.includes("pending") || t.includes("request")) return "pending"
  return "unknown"
}
