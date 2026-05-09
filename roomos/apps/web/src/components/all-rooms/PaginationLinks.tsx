import Link from "next/link"

export function PaginationLinks({
  page,
  totalPages,
  total,
  pageSize,
  searchParams,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const buildHref = (p: number) => {
    const sp = new URLSearchParams()
    Object.entries(searchParams).forEach(([k, v]) => {
      if (typeof v === "string") sp.set(k, v)
    })
    sp.set("page", String(p))
    return `?${sp.toString()}`
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between mt-4 text-xs text-[color:var(--color-muted)]">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="px-3 py-1 rounded border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
            ← Previous
          </Link>
        ) : (
          <span className="px-3 py-1 rounded border border-[color:var(--color-rule)] opacity-40">← Previous</span>
        )}
        <span className="px-3 py-1 text-[color:var(--color-ink-2)]">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="px-3 py-1 rounded border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
            Next →
          </Link>
        ) : (
          <span className="px-3 py-1 rounded border border-[color:var(--color-rule)] opacity-40">Next →</span>
        )}
      </div>
    </div>
  )
}
