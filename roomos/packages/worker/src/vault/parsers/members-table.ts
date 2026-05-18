import type { VaultMemberRow, VaultMemberStatusText } from "../types"

// Member-cell vacancy / stub placeholders. A row whose member cell matches
// has no occupant, so it is skipped (the member/occupancy pipeline must
// never receive an empty-name member — preserves the Phase-2A contract).
const NO_MEMBER = /^(—\s*vacant\s*—|-\s*vacant\s*-|vacant|—|-|_stub_|tbd|)$/i

/**
 * Parse the property roster, whichever of the three known schemas it is in:
 *   - legacy   "## Current Members": | Room | Name   | Status | Balance Due | Notes |
 *   - sweep v1 SWEEP:roster fence:   | Room | Status | Rate   | Member |
 *   - sweep v2 SWEEP:roster fence:   | Room | Status | Weekly Rate | Member | Balance |
 *
 * Header-driven: columns are located by NAME, not fixed position, so the
 * parser survives roster-schema drift. Status text is passed through
 * verbatim — vocabulary validation belongs to persist (mapStatusText), so a
 * new status value can never again silently drop every row.
 */
export function parseMembersTable(content: string): VaultMemberRow[] {
  const fence = content.match(
    /<!--\s*SWEEP:roster\s*-->([\s\S]*?)<!--\s*\/SWEEP:roster\s*-->/,
  )
  let table: string
  if (fence) {
    table = fence[1]!
  } else {
    const section = content.match(
      /##\s+Current Members\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/,
    )
    if (!section) return []
    table = section[1]!
  }

  const lines = table
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (lines.length < 3) return []

  const header = splitRow(lines[0]!).map((h) => h.toLowerCase())
  const roomIdx = header.findIndex((h) => /^room$/.test(h))
  const statusIdx = header.findIndex((h) => /^status$/.test(h))
  const memberIdx = header.findIndex((h) => /^(member|name)$/.test(h))
  const balanceIdx = header.findIndex((h) => /^balance(\s*due)?$/.test(h))
  // Unknown schema (no Room or no member column) → nothing to extract.
  if (roomIdx === -1 || memberIdx === -1) return []

  const rows: VaultMemberRow[] = []
  for (const line of lines.slice(2)) {
    const cells = splitRow(line)
    const roomRaw = cells[roomIdx] ?? ""
    const memberRaw = (cells[memberIdx] ?? "").trim()
    if (!roomRaw || NO_MEMBER.test(memberRaw)) continue
    const status =
      statusIdx >= 0 ? stripBold(cells[statusIdx] ?? "") : ""
    const balanceRaw =
      balanceIdx >= 0 ? (cells[balanceIdx] ?? "").trim() : ""
    const balanceText = balanceRaw === "—" || balanceRaw === "-" ? "" : balanceRaw
    rows.push({
      roomNumber: normalizeRoom(roomRaw),
      name: memberRaw,
      status: status as VaultMemberStatusText,
      balanceText,
      notes: "",
    })
  }
  return rows
}

// Split a markdown table row into cells, trimming each and dropping ONLY the
// empty cells produced by the bracketing leading/trailing "|". Internal empty
// cells are preserved so positional column indices stay aligned.
function splitRow(line: string): string[] {
  const parts = line.split("|").map((c) => c.trim())
  if (parts.length && parts[0] === "") parts.shift()
  if (parts.length && parts[parts.length - 1] === "") parts.pop()
  return parts
}

function normalizeRoom(s: string): string {
  const t = s.trim()
  return /^\d+$/.test(t) ? `R${t}` : t.toUpperCase()
}

function stripBold(s: string): string {
  return s.replace(/^\*\*(.*?)\*\*$/, "$1").trim()
}
