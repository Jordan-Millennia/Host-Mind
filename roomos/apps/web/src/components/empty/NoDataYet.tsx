import Link from "next/link"

export function NoDataYet() {
  return (
    <section className="max-w-2xl mx-auto py-24 text-center px-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--color-coral)]">
        First-time setup
      </p>
      <h1 className="mt-6 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.1] tracking-[-0.02em]">
        No rooms <span className="italic text-[color:var(--color-muted)]">— yet.</span>
      </h1>
      <p className="mt-6 text-base leading-relaxed text-[color:var(--color-muted)] max-w-md mx-auto">
        RoomOS hasn&apos;t been connected to PadSplit yet. Once you log in once on this Mac, the scraper
        will discover all 70 properties and populate this view.
      </p>
      <div className="mt-10 flex justify-center gap-3">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 bg-[color:var(--color-coral)] text-[color:var(--color-ink)] px-6 py-3 rounded-md text-xs font-semibold uppercase tracking-[0.12em] hover:bg-[color:var(--color-coral-soft)]"
        >
          Connect PadSplit
          <span aria-hidden>→</span>
        </Link>
      </div>
      <p className="mt-12 text-[11px] text-[color:var(--color-muted)] italic">
        The &quot;Connect PadSplit&quot; flow lands in Phase 1D.
      </p>
    </section>
  )
}
