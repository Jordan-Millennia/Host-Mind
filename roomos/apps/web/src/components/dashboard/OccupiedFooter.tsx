import Link from "next/link"

export function OccupiedFooter({ count, total }: { count: number; total: number }) {
  if (count === 0) return null
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0"
  return (
    <div className="mt-12 p-6 bg-[color:var(--color-paper)] rounded-md border border-[color:rgba(90,122,74,0.18)] flex items-baseline justify-between">
      <div className="flex items-baseline gap-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-green)]">
          Occupied
        </span>
        <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
          {count}
        </span>
        <span className="text-xs text-[color:var(--color-muted)]">
          rooms · <span className="italic text-[color:var(--color-green)]">{pct}% portfolio occupancy</span>
        </span>
      </div>
      <Link
        href="/all-rooms?status=occupied"
        className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-muted)] hover:text-[color:var(--color-ink-2)]"
      >
        Expand ↓
      </Link>
    </div>
  )
}
