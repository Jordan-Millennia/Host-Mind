import type { VaultMemberRow, VaultMemberStatusText } from "../types"

const STATUS_VALUES: VaultMemberStatusText[] = [
  "Active",
  "VACATED",
  "TERMINATED",
  "Moving in",
  "Moving out",
  "Inactive",
]

export function parseMembersTable(content: string): VaultMemberRow[] {
  // Find the "## Current Members" heading and capture content until the next ## heading or --- divider.
  const sectionMatch = content.match(/##\s+Current Members\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/)
  if (!sectionMatch) return []
  const tableLines = sectionMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (tableLines.length < 3) return []
  // tableLines[0] is the header row; tableLines[1] is the separator (|----|...).
  const rows: VaultMemberRow[] = []
  for (const line of tableLines.slice(2)) {
    const cells = line.split("|").map((c) => c.trim())
    // Markdown tables produce empty leading/trailing cells from the bracketing |.
    // Expected layout: ["", roomNumber, name, status, balance, notes, ""]
    if (cells.length < 6) continue
    const [, roomNumber, name, statusRaw, balanceText, notes] = cells
    if (!roomNumber || !name) continue
    const status = stripBold(statusRaw)
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

function stripBold(s: string): string {
  return s.replace(/^\*\*(.*?)\*\*$/, "$1").trim()
}
