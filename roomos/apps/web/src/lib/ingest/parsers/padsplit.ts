// Pure parsers for PadSplit notification emails. Each takes the raw email and
// returns structured fields or null (not this type). Patterns verified against
// real messages in Jordan's inbox (read-only sample, 2026-05). No I/O, no DB —
// unit-tested with fixtures.

import type { ParsedEmail, RawEmail } from "../types"

const clean = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * maintenance@padsplit.com
 * Subject: "PadSplit Maintenance Ticket from Anthony Williams at 8591 Lowell Boulevard, Westminster"
 * Body:    "Anthony submitted a ticket for 8591 Lowell Boulevard, Westminster. Member's Room: 10
 *           Location: Kitchen Details: Waiting for garbage disposal part Ticket number: 415107"
 */
export function parsePadsplitMaintenance(raw: RawEmail): Extract<ParsedEmail, { type: "maintenance" }> | null {
  if (!/maintenance@padsplit\.com/i.test(raw.from)) return null
  if (!/maintenance ticket/i.test(raw.subject)) return null

  const subjMatch = raw.subject.match(/from\s+(.+?)\s+at\s+(.+)$/i)
  const memberName = clean(subjMatch?.[1] ?? "")
  const propertyAddress = clean(subjMatch?.[2] ?? raw.body.match(/ticket for\s+(.+?)\.\s/i)?.[1] ?? "")
  if (!memberName || !propertyAddress) return null

  const room = clean(raw.body.match(/Member'?s Room:\s*([^\n]+?)(?:\s+Location:|\s*$)/i)?.[1] ?? "") || null
  const location = clean(raw.body.match(/Location:\s*([^\n]+?)(?:\s+Details:|\s*$)/i)?.[1] ?? "") || null
  const details = clean(raw.body.match(/Details:\s*([\s\S]+?)(?:\s+Ticket number:|\s*$)/i)?.[1] ?? "") || null
  const ticketNumber = clean(raw.body.match(/Ticket number:\s*(\d+)/i)?.[1] ?? "") || null

  return { source: "padsplit", type: "maintenance", memberName, propertyAddress, room, location, details, ticketNumber }
}

/**
 * support@padsplit.com — Subject: "A member is moving in tomorrow!"
 * Body: "Brian Shaw will be moving into 5 at 11068 West 62nd Place, Arvada tomorrow."
 */
export function parsePadsplitMoveIn(raw: RawEmail): Extract<ParsedEmail, { type: "move_in" }> | null {
  if (!/@padsplit\.com/i.test(raw.from)) return null
  if (!/moving in/i.test(raw.subject)) return null
  const m = raw.body.match(/([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)*)\s+will be moving into\s+(\S+)\s+at\s+(.+?)\s+tomorrow/i)
  if (!m) return null
  return { source: "padsplit", type: "move_in", memberName: clean(m[1]!), room: clean(m[2]!) || null, propertyAddress: clean(m[3]!) }
}

/**
 * support@padsplit.com — Subject: "Move-out confirmed"
 * Body: "Member Ajay Jenkins has confirmed that they are moved out of 8060 Stuart Place, Westminster Room 3."
 */
export function parsePadsplitMoveOut(raw: RawEmail): Extract<ParsedEmail, { type: "move_out" }> | null {
  if (!/@padsplit\.com/i.test(raw.from)) return null
  if (!/move-?out confirmed/i.test(raw.subject) && !/moved out of/i.test(raw.body)) return null
  const m = raw.body.match(/Member\s+(.+?)\s+has confirmed that they are moved out of\s+(.+?)\s+Room\s+(\S+?)[.\s]/i)
  if (!m) return null
  return { source: "padsplit", type: "move_out", memberName: clean(m[1]!), propertyAddress: clean(m[2]!), room: clean(m[3]!) || null }
}
