export default function Home() {
  return (
    <main className="min-h-screen p-12">
      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-gold)] font-semibold">
        Brand smoke test
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold mt-4">
        Cream <span className="italic text-[color:var(--color-muted)]">background,</span> charcoal text.
      </h1>
      <p className="font-[family-name:var(--font-body)] text-base text-[color:var(--color-muted)] mt-4 max-w-prose">
        Body copy is Inter. The display face is Playfair Display. Gold accent is reserved for interaction.
        This page exists only to verify Task 2.
      </p>
      <button className="mt-6 bg-[color:var(--color-gold)] text-[color:var(--color-ink)] px-5 py-2.5 rounded-md text-xs font-semibold uppercase tracking-[0.12em] hover:bg-[color:var(--color-gold-light)]">
        Gold CTA
      </button>
    </main>
  )
}
