import Link from "next/link"
import { getSyncStatus, type PillState } from "@/lib/sync-status"

const COLORS: Record<PillState, { bg: string; fg: string; dot: string }> = {
  green: { bg: "rgba(90,122,74,0.10)", fg: "#5A7A4A", dot: "#5A7A4A" },
  amber: { bg: "rgba(212,168,67,0.12)", fg: "#B8932A", dot: "#D4A843" },
  red:   { bg: "rgba(196,93,46,0.10)",  fg: "#C45D2E", dot: "#C45D2E" },
  unknown: { bg: "rgba(107,100,90,0.10)", fg: "#6B645A", dot: "#6B645A" },
}

export async function SyncPill({ orgId }: { orgId: string }) {
  const s = await getSyncStatus(orgId)
  const c = COLORS[s.state]

  return (
    <Link
      href="/activity"
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] hover:opacity-80"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.fg}40` }}
      title={s.message}
    >
      <span className="block w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {s.message}
    </Link>
  )
}
