import type { VaultMaintenanceItem } from "../types"

export function parseMaintenance(content: string): VaultMaintenanceItem[] {
  const sectionMatch = content.match(
    /##\s+Open Maintenance Items\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/,
  )
  if (!sectionMatch) return []
  const lines = sectionMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (lines.length < 3) return []
  const items: VaultMaintenanceItem[] = []
  for (const line of lines.slice(2)) {
    const cells = line.split("|").map((c) => c.trim())
    // Layout: ["", description, status, priority, assigned, opened, ""]
    if (cells.length < 4) continue
    const [, description, status, priority] = cells
    if (!description) continue
    items.push({
      description,
      status: status.replace(/\*\*/g, "").trim(),
      priority,
      raw: line,
    })
  }
  return items
}
