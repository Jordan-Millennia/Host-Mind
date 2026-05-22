export function CrossListingBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      title={`${count} room${count === 1 ? "" : "s"} listed on both PadSplit and Airbnb`}
      className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm align-middle"
      style={{ background: "var(--color-clay-bg)", color: "var(--color-clay)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-clay)" }} />
      {count} cross-listed
    </span>
  )
}
