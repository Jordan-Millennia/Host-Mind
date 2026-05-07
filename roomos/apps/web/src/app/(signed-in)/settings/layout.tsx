import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveContext } from "@/lib/auth"
import { SettingsTabs } from "@/components/settings/SettingsTabs"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveContext()
  if (!ctx) redirect("/sign-in")

  if (ctx.role !== "ADMIN") {
    return (
      <main className="px-7 py-16 max-w-2xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-gold)] font-semibold">
          Restricted
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold mt-4">
          Settings <span className="italic text-[color:var(--color-muted)]">— admin only.</span>
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-3">
          Ask an admin on your team to grant you the ADMIN role to access this page.
        </p>
      </main>
    )
  }

  const hdrs = await headers()
  const path = hdrs.get("x-pathname") ?? "/settings"

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="pb-2 mb-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Settings <span className="italic text-[color:var(--color-muted)]">— configure RoomOS</span>
        </h1>
      </div>
      <SettingsTabs activeHref={path} />
      {children}
    </main>
  )
}
