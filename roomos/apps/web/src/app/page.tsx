import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect("/rooms")

  return (
    <main className="min-h-screen flex items-center justify-center bg-[color:var(--color-cream)]">
      <div className="text-center max-w-md px-8">
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-gold)] font-semibold">
          CoHost Management
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold mt-4">
          Room<span className="italic text-[color:var(--color-muted)]">OS</span>
        </h1>
        <p className="text-base text-[color:var(--color-muted)] mt-4">
          Internal operator tool. Sign in to continue.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link
            href="/sign-in"
            className="bg-[color:var(--color-gold)] text-[color:var(--color-ink)] px-6 py-3 rounded-md text-xs font-semibold uppercase tracking-[0.12em] hover:bg-[color:var(--color-gold-light)]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
