type Listing = { platform: string; externalListingId: string | null; isActive: boolean; sessionStatus: string }

const ALL_PLATFORMS = ["PADSPLIT", "AIRBNB", "TURBOTENANT"] as const

export function PlatformsSidebar({ listings }: { listings: Listing[] }) {
  return (
    <div className="p-5 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mb-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Listings on this room
      </h3>
      {ALL_PLATFORMS.map((p) => {
        const found = listings.find((l) => l.platform === p)
        const active = !!found?.isActive
        return (
          <div
            key={p}
            className={`flex items-center justify-between py-2 border-b last:border-b-0 border-[color:var(--color-rule)] ${active ? "" : "opacity-50"}`}
          >
            <span className="text-sm font-medium">{labelOf(p)}</span>
            <span className="text-[10px] text-[color:var(--color-muted)]">
              {active ? `Active · ID ${found?.externalListingId ?? "—"}` : "Not listed"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function labelOf(p: string) {
  return p === "PADSPLIT" ? "PadSplit" : p === "AIRBNB" ? "Airbnb" : "TurboTenant"
}
