import { JSDOM } from "jsdom"
import type { OccupancyStatus } from "@roomos/db"

// Map PadSplit's status text to our enum values
const STATUS_MAP: Record<string, OccupancyStatus> = {
  occupied: "OCCUPIED",
  vacant: "VACANT",
  "moving in": "MOVING_IN",
  "moving out": "MOVING_OUT",
  "needs flip": "NEEDS_FLIP",
  "waiting for approval": "WAITING_APPROVAL",
  inactive: "INACTIVE",
}

export type ParsedRoomCard = {
  externalRoomId: string
  status: OccupancyStatus
  member: { externalMemberId: string; name: string } | null
  moveInDate: string | null  // ISO YYYY-MM-DD
  leaseEndDate: string | null
}

export type ParsedListingPage = {
  address: string
  city: string
  status: string
  rooms: ParsedRoomCard[]
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
}

function parseDate(text: string): string | null {
  // "Mar 11, 2025" → "2025-03-11"
  const m = text.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (!m) return null
  const [, mon, day, year] = m
  const mm = MONTHS[mon!]
  if (!mm) return null
  return `${year}-${mm}-${day!.padStart(2, "0")}`
}

function parseDateRange(text: string): { start: string | null; end: string | null } {
  const m = text.match(
    /([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})\s*[-–]\s*(present|[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/,
  )
  if (!m) return { start: null, end: null }
  return {
    start: parseDate(m[1]!),
    end: /^present$/i.test(m[2]!) ? null : parseDate(m[2]!),
  }
}

export function parseListingPage(html: string): ParsedListingPage {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const address = doc.querySelector('[data-testid="hero__property-address-txt"]')?.textContent?.trim() ?? ""
  const city = doc.querySelector('[data-testid="hero__property-city-txt"]')?.textContent?.trim() ?? ""
  const status = doc.querySelector('[data-testid="property-status__status"]')?.textContent?.trim() ?? ""

  const cards = Array.from(doc.querySelectorAll(".Room_root__XM73E"))
  const rooms: ParsedRoomCard[] = cards.map((card) => {
    const allText = card.textContent ?? ""

    const idMatch = allText.match(/ID:\s*(\d+)/)
    const externalRoomId = idMatch ? idMatch[1]! : ""

    const statusMatch = allText.match(
      /\b(Occupied|Vacant|Moving in|Moving out|Needs flip|Waiting for approval|Inactive)\b/i,
    )
    const statusKey = statusMatch ? statusMatch[1]!.toLowerCase() : ""
    const occStatus = STATUS_MAP[statusKey] ?? "INACTIVE"

    const memberLink = card.querySelector('a[href*="/host/member/"]')
    let member: ParsedRoomCard["member"] = null
    if (memberLink) {
      const href = memberLink.getAttribute("href") ?? ""
      const idMatch = href.match(/\/host\/member\/(\d+)/)
      member = {
        externalMemberId: idMatch ? idMatch[1]! : "",
        name: memberLink.textContent?.trim() ?? "",
      }
    }

    const dates = parseDateRange(allText)
    return {
      externalRoomId,
      status: occStatus,
      member,
      moveInDate: dates.start,
      leaseEndDate: dates.end,
    }
  })

  return { address, city, status, rooms }
}

export type ParsedMemberProfile = {
  balance: string | null            // decimal string, e.g. "420.00"
  daysPastDue: number | null
  lastPaymentAmount: string | null  // decimal string
  lastPaymentDate: string | null    // ISO YYYY-MM-DD
}

export function parseMemberProfile(html: string): ParsedMemberProfile {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const balanceText = doc.querySelector('[data-testid="member__balance"]')?.textContent?.trim() ?? ""
  const balance = balanceText.replace(/[^0-9.]/g, "") || null

  const daysText = doc.querySelector('[data-testid="member__days-past-due"]')?.textContent?.trim() ?? ""
  const daysMatch = daysText.match(/(\d+)/)
  const daysPastDue = daysMatch ? parseInt(daysMatch[1]!, 10) : null

  const lastText = doc.querySelector('[data-testid="member__last-payment"]')?.textContent?.trim() ?? ""
  const amtMatch = lastText.match(/\$([\d.]+)/)
  const lastPaymentAmount = amtMatch ? amtMatch[1]! : null
  const dateMatch = lastText.match(/on\s+([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/)
  const lastPaymentDate = dateMatch ? parseDate(dateMatch[1]!) : null

  return { balance, daysPastDue, lastPaymentAmount, lastPaymentDate }
}
