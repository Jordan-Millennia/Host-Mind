import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { BrandStack } from "./BrandStack"
import { SyncPill } from "./SyncPill"

const NAV = [
  { href: "/rooms", label: "Rooms" },
  { href: "/all-rooms", label: "All Rooms" },
  { href: "/owners", label: "Owners" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
] as const

export function Topbar({ activeHref, orgId }: { activeHref: string; orgId: string }) {
  return (
    <header className="border-b border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <div className="flex items-center justify-between px-7 py-4">
        <BrandStack />
        <nav className="flex gap-7">
          {NAV.map((item) => {
            const active = activeHref === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-[10px] font-semibold uppercase tracking-[0.18em] py-1.5 ${
                  active ? "text-[color:var(--color-charcoal)]" : "text-[color:var(--color-muted)] hover:text-[color:var(--color-charcoal)]"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-[color:var(--color-gold)]" />
                )}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-4">
          <SyncPill orgId={orgId} />
          <UserButton appearance={{ variables: { colorPrimary: "#D4A843" } }} />
        </div>
      </div>
    </header>
  )
}
