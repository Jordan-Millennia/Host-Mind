import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Topbar } from "@/components/nav/Topbar"
import { resolveContext } from "@/lib/auth"

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveContext()
  if (!ctx) redirect("/sign-in")

  const hdrs = await headers()
  const path = hdrs.get("x-pathname") ?? "/rooms"

  return (
    <div className="min-h-screen bg-[color:var(--color-cream)]">
      <Topbar activeHref={normalize(path)} orgId={ctx.orgId} />
      <div>{children}</div>
    </div>
  )
}

function normalize(p: string): string {
  try { if (p.startsWith("http")) return new URL(p).pathname } catch {}
  return p
}
