import { headers } from "next/headers"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Topbar } from "@/components/nav/Topbar"

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const hdrs = await headers()
  const path = hdrs.get("x-pathname") ?? hdrs.get("next-url") ?? "/rooms"

  return (
    <div className="min-h-screen bg-[color:var(--color-cream)]">
      <Topbar activeHref={normalize(path)} />
      <div>{children}</div>
    </div>
  )
}

function normalize(p: string): string {
  // Headers can return absolute URLs depending on env; normalize to pathname.
  try {
    if (p.startsWith("http")) return new URL(p).pathname
  } catch {}
  return p
}
