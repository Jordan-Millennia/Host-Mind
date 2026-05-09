import type { VaultFlag, VaultFlagSeverity } from "../types"

export function parseFlags(content: string): VaultFlag[] {
  const sectionMatch = content.match(/##\s+Flags & Alerts\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/)
  if (!sectionMatch) return []
  const flags: VaultFlag[] = []
  for (const line of sectionMatch[1]!.split("\n")) {
    const m = line.match(/^>\s+(.+)$/)
    if (!m) continue
    const text = m[1]!.trim()
    if (!text) continue
    const severity = inferSeverity(text)
    const stripped = stripLeadingEmoji(text)
    const [titleRaw, ...bodyParts] = stripped.split(/\s—\s|\s-\s/)
    flags.push({
      severity,
      title: (titleRaw ?? stripped).trim(),
      body: bodyParts.join(" — ").trim(),
      rawLine: text,
    })
  }
  return flags
}

function inferSeverity(text: string): VaultFlagSeverity {
  if (/^🔴/.test(text)) return "DANGER"
  if (/^⚠️/.test(text) || /^💰/.test(text)) return "WARN"
  if (/^✅/.test(text)) return "OK"
  return "INFO"
}

function stripLeadingEmoji(text: string): string {
  // Strip a single emoji (with optional Variation Selector-16) + optional space at the start.
  return text.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]️?\s*/u, "")
}
