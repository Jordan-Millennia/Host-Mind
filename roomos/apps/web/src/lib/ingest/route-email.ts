// Email router: raw email → the first parser that claims it, or null (unhandled).
// Add a parser to PARSERS to support a new email type — nothing else changes.

import type { ParsedEmail, RawEmail } from "./types"
import { parsePadsplitMaintenance, parsePadsplitMoveIn, parsePadsplitMoveOut } from "./parsers/padsplit"

const PARSERS: Array<(raw: RawEmail) => ParsedEmail | null> = [
  parsePadsplitMaintenance,
  parsePadsplitMoveIn,
  parsePadsplitMoveOut,
]

export function parseEmail(raw: RawEmail): ParsedEmail | null {
  for (const parser of PARSERS) {
    const parsed = parser(raw)
    if (parsed) return parsed
  }
  return null
}
