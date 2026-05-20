import { requireSignedIn } from "@/lib/auth"
import { getMembersForList, type MemberListFilter } from "@/lib/members-queries"
import { MembersTable } from "@/components/members/MembersTable"
import Link from "next/link"
import type { OccupancyStatus } from "@roomos/db"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const VALID_STATUS: OccupancyStatus[] = [
  "OCCUPIED",
  "MOVING_IN",
  "MOVING_OUT",
  "VACANT",
  "INACTIVE",
]
const VALID_SORT: NonNullable<MemberListFilter["sort"]>[] = [
  "balance-asc",
  "balance-desc",
  "name-asc",
  "name-desc",
  "recent",
]

export default async function MembersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const ctx = await requireSignedIn()
  const sp = await searchParams
  const search = typeof sp.q === "string" ? sp.q : undefined
  const status = typeof sp.status === "string" && VALID_STATUS.includes(sp.status as OccupancyStatus)
    ? (sp.status as OccupancyStatus)
    : undefined
  const sort = typeof sp.sort === "string" && VALID_SORT.includes(sp.sort as MemberListFilter["sort"] & string)
    ? (sp.sort as MemberListFilter["sort"])
    : undefined
  const all = sp.all === "1"
  const pageNum = typeof sp.page === "string" ? Math.max(1, parseInt(sp.page, 10) || 1) : 1

  const { rows, total, page, totalPages } = await getMembersForList(ctx.orgId, {
    search,
    status,
    sort,
    activeOnly: !all,
    page: pageNum,
  })

  return (
    <div className="max-w-[1440px] mx-auto px-10 pt-14 pb-20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3">
        CoHost Management · People
      </div>
      <div className="flex items-end justify-between gap-6 pb-7 border-b border-[color:var(--color-hairline)] mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[56px] leading-none font-normal tracking-[-0.02em] text-[color:var(--color-ink)]">
            Members<span className="italic text-[color:var(--color-coral)]">.</span>
          </h1>
          <p className="mt-3 text-sm text-[color:var(--color-muted)]">
            {total} {all ? "members" : "active members"}
            {search ? ` matching “${search}”` : ""}
            {status ? ` · ${status.toLowerCase()}` : ""}
          </p>
        </div>
      </div>

      <FilterBar current={{ search, status, sort, all }} />

      <MembersTable rows={rows} />

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-xs text-[color:var(--color-muted)]">
          <span>
            Page {page} of {totalPages} · {total} {all ? "members" : "active members"}
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <PageLink page={page - 1} sp={sp} label="← Previous" />
            ) : null}
            {page < totalPages ? (
              <PageLink page={page + 1} sp={sp} label="Next →" />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterBar({
  current,
}: {
  current: { search?: string; status?: OccupancyStatus; sort?: MemberListFilter["sort"]; all: boolean }
}) {
  return (
    <form
      method="get"
      className="mb-6 flex flex-wrap items-end gap-3 text-sm"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          Search name
        </span>
        <input
          name="q"
          defaultValue={current.search ?? ""}
          placeholder="e.g. Nicole"
          className="border border-[color:var(--color-rule)] rounded-sm bg-[color:var(--color-surface)] px-3 py-2 text-sm w-64"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          Status
        </span>
        <select
          name="status"
          defaultValue={current.status ?? ""}
          className="border border-[color:var(--color-rule)] rounded-sm bg-[color:var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {VALID_STATUS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          Sort
        </span>
        <select
          name="sort"
          defaultValue={current.sort ?? "balance-asc"}
          className="border border-[color:var(--color-rule)] rounded-sm bg-[color:var(--color-surface)] px-3 py-2 text-sm"
        >
          <option value="balance-asc">Most past due first</option>
          <option value="balance-desc">Largest credit first</option>
          <option value="name-asc">Name A→Z</option>
          <option value="name-desc">Name Z→A</option>
          <option value="recent">Recently added</option>
        </select>
      </label>
      <label className="flex items-center gap-2 mb-2">
        <input type="checkbox" name="all" value="1" defaultChecked={current.all} />
        <span className="text-xs text-[color:var(--color-muted)]">Include past members</span>
      </label>
      <button
        type="submit"
        className="ml-auto bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-5 py-2.5 text-sm font-medium rounded-sm"
      >
        Apply
      </button>
    </form>
  )
}

function PageLink({
  page,
  sp,
  label,
}: {
  page: number
  sp: Record<string, string | string[] | undefined>
  label: string
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "page") params.set(k, v)
  }
  params.set("page", String(page))
  return (
    <Link
      href={`/members?${params.toString()}`}
      className="text-[color:var(--color-ink)] hover:text-[color:var(--color-coral)]"
    >
      {label}
    </Link>
  )
}
