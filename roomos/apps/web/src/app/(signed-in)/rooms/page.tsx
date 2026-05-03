import { prisma } from "@roomos/db"
import { requireSignedIn } from "@/lib/auth"
import { NoDataYet } from "@/components/empty/NoDataYet"

export default async function RoomsPage() {
  const ctx = await requireSignedIn()

  const roomCount = await prisma.room.count({ where: { orgId: ctx.orgId } })

  if (roomCount === 0) {
    return <NoDataYet />
  }

  // 1C lights this up — for now, prove the scaffold reads from DB.
  return (
    <main className="p-12">
      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
        {roomCount} rooms found · home view UI lands in 1C
      </p>
    </main>
  )
}
