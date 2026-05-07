import Link from "next/link"

const TABS = [
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/owners",       label: "Owners" },
  { href: "/settings/team",         label: "Team" },
] as const

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  return (
    <nav className="flex gap-7 border-b border-[color:var(--color-rule)] mb-7">
      {TABS.map((t) => {
        const active = activeHref.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative py-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              active ? "text-[color:var(--color-charcoal)]" : "text-[color:var(--color-muted)] hover:text-[color:var(--color-charcoal)]"
            }`}
          >
            {t.label}
            {active && <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[color:var(--color-gold)]" />}
          </Link>
        )
      })}
    </nav>
  )
}
