import type { PropertyDetail } from "@/lib/property-queries"

const SEVERITY_COLOR: Record<string, string> = {
  DANGER: "var(--color-clay)",
  WARN: "var(--color-amber)",
  INFO: "var(--color-slate)",
  OK: "var(--color-green)",
}

export function LiveFlagsCard({ flags }: { flags: PropertyDetail["flags"] }) {
  if (flags.length === 0) {
    return (
      <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5">Live flags</div>
        <div className="text-sm text-[color:var(--color-ink-3)]">No open flags.</div>
      </div>
    )
  }
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5">Live flags</div>
      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <div key={f.id} className="text-sm leading-snug pl-3.5 relative text-[color:var(--color-ink-2)]">
            <span
              className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
              style={{ background: SEVERITY_COLOR[f.severity] ?? SEVERITY_COLOR.INFO }}
            />
            {f.title}
            {f.body ? <span className="block text-[11.5px] text-[color:var(--color-ink-3)] mt-0.5 tracking-[0.02em]">{f.body}</span> : null}
            <span className="block text-[11.5px] text-[color:var(--color-ink-3)] mt-0.5 tracking-[0.02em]">
              flagged {f.openedAt.toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
