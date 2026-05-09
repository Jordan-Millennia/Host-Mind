import type { PropertyDetail } from "@/lib/property-queries"
import { formatMoney } from "@/lib/format"

export function PropertyKpiStrip({ p }: { p: PropertyDetail }) {
  return (
    <div className="grid grid-cols-4 border-y border-[color:var(--color-hairline)] my-12">
      <Kpi label="Occupancy" value={`${p.occupiedCount}`} sub={`/${p.totalRooms} · ${p.vacantCount} vacant`} />
      <Kpi label="Earnings · MTD" value={formatMoney(0)} sub="wired in Phase 2C" />
      <Kpi label="Past due" value={formatMoney(p.pastDueAmount)} sub={p.pastDueAmount > 0 ? "Action required" : "—"} danger={p.pastDueAmount > 0} />
      <Kpi label="Open flags" value={`${p.flags.length}`} sub={p.flags[0]?.title ?? "—"} />
    </div>
  )
}

function Kpi({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <div className="px-7 py-6 border-r border-[color:var(--color-hairline-2)] last:border-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)] font-medium mb-2">{label}</div>
      <div
        className="font-[family-name:var(--font-display)] text-[34px] font-normal tracking-[-0.02em] leading-none"
        style={{ color: danger ? "var(--color-clay)" : "var(--color-ink)" }}
      >
        {value}
      </div>
      <div className="text-xs text-[color:var(--color-ink-3)] mt-1.5">{sub}</div>
    </div>
  )
}
