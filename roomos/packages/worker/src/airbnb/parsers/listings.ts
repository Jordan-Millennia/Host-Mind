import { JSDOM } from "jsdom"
import type { AirbnbListingRow } from "../types"

/**
 * Parse the captured /hosting/listings page into structured listing rows.
 *
 * The page is a single real <table> with a <thead>/<tbody>. We map cells by the
 * header column order (Listing | Type | Location | Status | Sync Status) and
 * hook only on STABLE anchors — never hashed/minified class names:
 *   - the numeric Airbnb listing id lives in the row's checkbox `id`
 *     (`checkbox-<id>`), with an href fallback (`.../listings|multicalendar|rooms/<id>`).
 *   - the "Listing" cell holds the title as its first text node and the street
 *     address as its second text node (some listings have no address line).
 */
export function parseHostingListings(html: string): AirbnbListingRow[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const table = doc.querySelector("table")
  if (!table) return []

  const headers = [...table.querySelectorAll("thead th, thead td")].map((c) =>
    (c.textContent ?? "").trim().toLowerCase(),
  )
  const col = (name: string) => headers.findIndex((h) => h === name.toLowerCase())
  const iListing = col("Listing")
  const iType = col("Type")
  const iStatus = col("Status")

  const rows: AirbnbListingRow[] = []
  const bodyRows = [...table.querySelectorAll("tbody tr")]

  for (const tr of bodyRows) {
    const cells = [...tr.querySelectorAll(":scope > td, :scope > th")]
    if (cells.length === 0) continue

    const listingCell = iListing >= 0 ? cells[iListing] : cells[0]
    if (!listingCell) continue

    const airbnbListingId = extractListingId(tr)
    if (!airbnbListingId) continue

    // First text node = title, second text node = address (if any).
    const texts = directTextNodes(listingCell)
    const title = texts[0] ?? ""
    if (!title) continue
    const address = texts[1] ?? ""

    const typeText = iType >= 0 ? (cells[iType]?.textContent ?? "").trim() : ""
    const statusText = iStatus >= 0 ? (cells[iStatus]?.textContent ?? "").trim() : ""

    rows.push({
      airbnbListingId,
      title,
      address,
      listingType: mapListingType(typeText, title, address),
      status: mapStatus(statusText),
    })
  }

  return rows
}

/** Numeric listing id: prefer the row checkbox id, fall back to any href. */
function extractListingId(tr: Element): string | null {
  const checkbox = tr.querySelector("input[id^='checkbox-']")
  if (checkbox) {
    const id = (checkbox.getAttribute("id") ?? "").replace("checkbox-", "")
    if (/^\d{6,}$/.test(id)) return id
  }
  for (const a of tr.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? ""
    const m = href.match(/(?:hosting\/listings|multicalendar|rooms)\/(\d{6,})/)
    if (m) return m[1]!
  }
  return null
}

/** Collect direct (descendant) text nodes in document order, trimmed & collapsed. */
function directTextNodes(el: Element): string[] {
  const out: string[] = []
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const t = (child.textContent ?? "").replace(/\s+/g, " ").trim()
        if (t) out.push(t)
      } else if (child.nodeType === 1) {
        walk(child)
      }
    }
  }
  walk(el)
  return out
}

function mapStatus(text: string): AirbnbListingRow["status"] {
  const t = text.toLowerCase()
  if (t === "listed") return "active"
  if (t === "unlisted") return "unlisted"
  if (t === "snoozed") return "snoozed"
  if (t.includes("progress")) return "in_progress"
  return "unknown"
}

function mapListingType(
  typeText: string,
  title: string,
  address: string,
): AirbnbListingRow["listingType"] {
  const t = typeText.toLowerCase()
  // Room-style listings are flagged by a "(Room N)" suffix in the address/title.
  if (/\(room\s*\d+\)/i.test(address) || /\(room\s*\d+\)/i.test(title)) {
    return "private_room"
  }
  if (t.includes("shared")) return "shared_room"
  if (t.includes("private") || t.includes("room")) return "private_room"
  // The host UI labels whole-home listings simply as "home".
  if (t === "home" || t.includes("entire") || t.includes("home")) return "entire_home"
  return "unknown"
}
