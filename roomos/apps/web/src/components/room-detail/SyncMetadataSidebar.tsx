import { formatDaysAgo, formatDate } from "@/lib/format"

export function SyncMetadataSidebar({
  lastSyncedAt,
  lastFinancialSyncAt,
}: {
  lastSyncedAt: Date | null
  lastFinancialSyncAt: Date | null
}) {
  return (
    <div className="p-5 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Sync metadata
      </h3>
      <Row label="Last occupancy sync" value={lastSyncedAt ? formatDaysAgo(lastSyncedAt) : "—"} />
      <Row label="Last financial sync" value={lastFinancialSyncAt ? formatDaysAgo(lastFinancialSyncAt) : "—"} />
      <Row label="Last full date" value={formatDate(lastSyncedAt)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0 border-[color:var(--color-rule)] text-xs">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
