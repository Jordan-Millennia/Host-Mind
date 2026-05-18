import type { VaultMemberRow, VaultMemberStatusText } from "../types"

const STATUS_VALUES: VaultMemberStatusText[] = [
  // legacy "## Current Members" vocabulary
  "Active",
  "VACATED",
  "TERMINATED",
  "Moving in",
  "Moving out",
  "Inactive",
  // deep-sweep SWEEP:roster vocabulary
  "Occupied",
  "Vacant",
  "Needs flip",
]

// Member-cell vacancy placeholders used by the deep-sweep roster.
const VACANT_MEMBER = /^(—\s*vacant\s*—|-\s*vacant\s*-|vacant|—|-|)$/i

export function parseMembersTable(content: string): VaultMemberRow[] {
  // Post-deep-sweep: the roster is the sweep-owned region between
  // <!-- SWEEP:roster --> … <!-- /SWEEP:roster -->, columns:
  // | Room | Status | Rate | Member |. Prefer it when present.
  const fence = content.match(
    /<!--\s*SWEEP:roster\s*-->([\s\S]*?)<!--\s*\/SWEEP:roster\s*-->/,
  )
  if (fence) return parseSweptRoster(fence[1]!)
  // Legacy fallback: "## Current Members" table,
  // columns | Room | Name | Status | Balance Due | Notes |.
  return parseLegacyMembers(content)
}

function parseSweptRoster(body: string): VaultMemberRow[] {
  const tableLines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (tableLines.length < 3) return []
  const rows: VaultMemberRow[] = []
  for (const line of tableLines.slice(2)) {
    // ["", room, status, rate, member, ""]
    const cells = line.split("|").map((c) => c.trim())
    if (cells.length < 6) continue
    const [, roomRaw, statusRaw, , memberRaw] = cells
    if (!roomRaw) continue
    const status = stripBold(statusRaw ?? "")
    if (!STATUS_VALUES.includes(status as VaultMemberStatusText)) continue
    const member = (memberRaw ?? "").trim()
    const name = VACANT_MEMBER.test(member) ? "" : member
    // No member in the room → nothing to upsert into the member/occupancy
    // pipeline. Skip, exactly like the legacy parser's `if (!name) continue`.
    if (!name) continue
    rows.push({
      roomNumber: normalizeRoom(roomRaw),
      name,
      status: status as VaultMemberStatusText,
      // The sweep roster carries no per-room balance; dossier sync owns it.
      balanceText: "",
      notes: "",
    })
  }
  return rows
}

function parseLegacyMembers(content: string): VaultMemberRow[] {
  const sectionMatch = content.match(
    /##\s+Current Members\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/,
  )
  if (!sectionMatch) return []
  const tableLines = sectionMatch[1]!
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (tableLines.length < 3) return []
  const rows: VaultMemberRow[] = []
  for (const line of tableLines.slice(2)) {
    const cells = line.split("|").map((c) => c.trim())
    if (cells.length < 6) continue
    const [, roomNumber, name, statusRaw, balanceText, notes] = cells
    if (!roomNumber || !name) continue
    const status = stripBold(statusRaw ?? "")
    if (!STATUS_VALUES.includes(status as VaultMemberStatusText)) continue
    rows.push({
      roomNumber: roomNumber.toUpperCase(),
      name,
      status: status as VaultMemberStatusText,
      balanceText: balanceText || "$0",
      notes: notes ?? "",
    })
  }
  return rows
}

function normalizeRoom(s: string): string {
  const t = s.trim()
  return /^\d+$/.test(t) ? `R${t}` : t.toUpperCase()
}

function stripBold(s: string): string {
  return s.replace(/^\*\*(.*?)\*\*$/, "$1").trim()
}
