import { requireSignedIn } from "@/lib/auth"
import { getRecentSyncRuns } from "@/lib/room-queries"
import { formatDate, formatDaysAgo } from "@/lib/format"

const STATUS_COLOR: Record<string, string> = {
  RUNNING: "var(--color-amber)",
  SUCCESS: "var(--color-green)",
  PARTIAL: "var(--color-amber)",
  FAILED:  "var(--color-clay)",
}

export default async function ActivityPage() {
  const ctx = await requireSignedIn()
  const runs = await getRecentSyncRuns(ctx.orgId, 50)

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-hairline)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Activity <span className="italic text-[color:var(--color-ink-3)]">— sync history</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-ink-3)]">
            Most recent {runs.length} scrape attempts.
          </p>
        </div>
      </div>

      <div className="border border-[color:var(--color-hairline)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)]">
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
              <th className="text-left px-4 py-3">Started</th>
              <th className="text-left px-4 py-3">Kind</th>
              <th className="text-left px-4 py-3">Platform</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const ms = r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null
              const dur = ms == null ? "running" : ms > 60_000 ? `${Math.round(ms/60_000)}m` : `${Math.round(ms/1000)}s`
              return (
                <tr key={r.id} className="border-b last:border-b-0 border-[color:var(--color-hairline)]">
                  <td className="px-4 py-3">
                    <div>{formatDate(r.startedAt)}</div>
                    <div className="text-[11px] text-[color:var(--color-ink-3)]">{formatDaysAgo(r.startedAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">{r.kind}</td>
                  <td className="px-4 py-3">{r.platform}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                      style={{ color: STATUS_COLOR[r.status], borderColor: `${STATUS_COLOR[r.status]}40`, background: `${STATUS_COLOR[r.status]}10` }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.itemsSynced}</td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-ink-3)]">{dur}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
