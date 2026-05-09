import type { PropertyDetail } from "@/lib/property-queries"

export function PropertyHero({ p }: { p: PropertyDetail }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-10 items-end pb-7 border-b border-[color:var(--color-hairline)]">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3.5">
          {[p.city, p.state].filter(Boolean).join(", ")} · Single-family
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[64px] leading-none font-normal tracking-[-0.025em] mb-4">
          {p.address.split(",")[0]}
          <span className="italic text-[color:var(--color-coral)]">.</span>
        </h1>
        <div className="flex gap-4 items-center text-sm text-[color:var(--color-ink-2)]">
          <span>{p.totalRooms} bedrooms</span>
          <span className="w-1 h-1 rounded-full bg-[color:var(--color-ink-3)]" />
          <span>Owner <span className="text-[color:var(--color-ink)] font-medium">{p.ownerName ?? "Unmapped"}</span></span>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-medium rounded-sm">Refresh now</button>
        <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-4 py-2.5 text-sm font-medium rounded-sm">Edit listing</button>
      </div>
    </div>
  )
}
