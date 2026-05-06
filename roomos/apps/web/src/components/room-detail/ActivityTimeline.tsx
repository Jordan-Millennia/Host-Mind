import { formatDate, formatDaysAgo } from "@/lib/format"

type Item =
  | { kind: "payment"; date: Date; amount: string }
  | { kind: "scrape"; date: Date; status: string; itemsSynced: number }
  | { kind: "moved_in"; date: Date; memberName: string }

export function ActivityTimeline({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
          Activity timeline
        </h2>
        <p className="italic text-[color:var(--color-muted)]">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mt-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Activity timeline
      </h2>
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 pb-3 last:pb-0 border-b last:border-b-0 border-[color:var(--color-rule)]">
            <span className={`block w-2 h-2 rounded-full mt-[6px] ${dotClass(it)}`} />
            <div className="flex-1 text-sm">
              <div className="text-[color:var(--color-charcoal)]">{label(it)}</div>
              <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
                {formatDate(it.date)} · {formatDaysAgo(it.date)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function dotClass(it: Item): string {
  switch (it.kind) {
    case "payment":  return "bg-[color:var(--color-occupied)]"
    case "scrape":   return "bg-[color:var(--color-moving)]"
    case "moved_in": return "bg-[color:var(--color-gold)]"
  }
}

function label(it: Item): string {
  switch (it.kind) {
    case "payment":  return `Payment received: $${it.amount}`
    case "scrape":   return `Synced — ${it.itemsSynced} items, ${it.status.toLowerCase()}`
    case "moved_in": return `${it.memberName} moved in`
  }
}
