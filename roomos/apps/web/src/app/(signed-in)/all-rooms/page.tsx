import { requireSignedIn } from "@/lib/auth"
import { parseSearchParams } from "@/lib/filters"
import { getAllRoomsFiltered, getFilterOptions } from "@/lib/room-queries"
import { ExportButton } from "@/components/all-rooms/ExportButton"
import { FilterBar } from "@/components/all-rooms/FilterBar"
import { RoomsTable } from "@/components/all-rooms/RoomsTable"
import { PaginationLinks } from "@/components/all-rooms/PaginationLinks"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AllRoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireSignedIn()
  const sp = await searchParams
  const usp = new URLSearchParams()
  Object.entries(sp).forEach(([k, v]) => { if (typeof v === "string") usp.set(k, v) })

  const filter = parseSearchParams(usp)
  const [{ rows, total, page, pageSize, totalPages }, options] = await Promise.all([
    getAllRoomsFiltered(ctx.orgId, filter),
    getFilterOptions(ctx.orgId),
  ])

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-rule)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            All Rooms <span className="italic text-[color:var(--color-muted)]">— full portfolio</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">{total} rooms matching current filters</p>
        </div>
        <ExportButton />
      </div>

      <FilterBar owners={options.owners} properties={options.properties} />

      <RoomsTable rows={rows} />

      <PaginationLinks
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        searchParams={sp}
      />
    </main>
  )
}
