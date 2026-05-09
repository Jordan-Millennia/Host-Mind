import type { PropertyDetail } from "@/lib/property-queries"
import { LiveFlagsCard } from "./LiveFlagsCard"

export function PropertyDetailRail({ p }: { p: PropertyDetail }) {
  return (
    <aside className="space-y-4">
      <RailCard label={<>Property <span className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-1.5 py-0.5 rounded-sm text-[10px] tracking-[0.04em]">PadSplit</span></>}>
        <DetailRow k="PadSplit ID" v={p.padsplitPropertyId ?? "—"} mono />
        <DetailRow k="Status" v="Active" />
        <DetailRow k="Market" v={p.marketName ?? "—"} />
      </RailCard>

      <RailCard label="Owner">
        <div className="font-[family-name:var(--font-display)] text-[19px] mb-1">{p.ownerName ?? "Unmapped"}</div>
        {p.ownerEmail ? <div className="text-[12.5px] text-[color:var(--color-ink-2)] leading-relaxed">{p.ownerEmail}</div> : null}
        {p.ownerPhone ? <div className="text-[12.5px] text-[color:var(--color-ink-2)]">{p.ownerPhone}</div> : null}
      </RailCard>

      <LiveFlagsCard flags={p.flags} />

      <RailCard label="Sync history">
        <DetailRow k="Vault" v={p.lastVaultSyncAt ? relativeTime(p.lastVaultSyncAt) : "never"} />
        <DetailRow k="Airbnb" v="N/A (Phase 2B)" />
        <DetailRow k="REI Hub" v="N/A (Phase 2C)" />
      </RailCard>
    </aside>
  )
}

function RailCard({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5 flex items-center justify-between">{label}</div>
      {children}
    </div>
  )
}

function DetailRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 text-sm border-b border-[color:var(--color-hairline-2)] last:border-0">
      <span className="text-[color:var(--color-ink-3)]">{k}</span>
      <span className={`text-[color:var(--color-ink)] font-medium ${mono ? "font-[family-name:var(--font-display)] italic font-normal" : ""}`}>{v}</span>
    </div>
  )
}

function relativeTime(d: Date): string {
  const minutes = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return d.toLocaleDateString()
}
