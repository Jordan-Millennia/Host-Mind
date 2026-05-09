import { requireSignedIn } from "@/lib/auth"
import { getPropertiesForList } from "@/lib/property-queries"
import { PropertiesTable } from "@/components/properties/PropertiesTable"

export default async function PropertiesPage() {
  const ctx = await requireSignedIn()
  const rows = await getPropertiesForList(ctx.orgId)

  return (
    <div className="max-w-[1440px] mx-auto px-10 pt-14 pb-20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3">
        CoHost Management · Portfolio
      </div>
      <div className="flex items-end justify-between gap-6 pb-7 border-b border-[color:var(--color-hairline)] mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[56px] leading-none font-normal tracking-[-0.02em] text-[color:var(--color-ink)]">
          Properties<span className="italic text-[color:var(--color-coral)]">.</span>
        </h1>
        <div className="flex gap-2.5">
          <button className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-medium rounded-sm">
            Booking settings
          </button>
          <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-4 py-2.5 text-sm font-medium rounded-sm">
            ＋ New listing
          </button>
        </div>
      </div>
      <PropertiesTable rows={rows} />
    </div>
  )
}
