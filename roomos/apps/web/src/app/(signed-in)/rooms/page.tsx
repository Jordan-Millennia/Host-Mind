import { requireSignedIn } from "@/lib/auth"
import { getKpiCounts, getRoomsByStatus } from "@/lib/room-queries"
import { prisma } from "@roomos/db"
import { KpiStrip } from "@/components/dashboard/KpiStrip"
import { StatusSection } from "@/components/dashboard/StatusSection"
import { OccupiedFooter } from "@/components/dashboard/OccupiedFooter"
import { NoDataYet } from "@/components/empty/NoDataYet"

export default async function RoomsPage() {
  const ctx = await requireSignedIn()

  const totalRooms = await prisma.room.count({ where: { orgId: ctx.orgId } })
  if (totalRooms === 0) return <NoDataYet />

  const [kpis, pastDue, vacant, moving, needsFlip] = await Promise.all([
    getKpiCounts(ctx.orgId),
    getRoomsByStatus(ctx.orgId, "past_due", 8),
    getRoomsByStatus(ctx.orgId, "vacant", 8),
    getRoomsByStatus(ctx.orgId, "moving", 8),
    getRoomsByStatus(ctx.orgId, "needs_flip", 8),
  ])

  // Counts for the per-section "View all" affordance
  const [pastDueTotal, vacantTotal, movingTotal, needsFlipTotal, occupiedTotal] = await Promise.all([
    Promise.resolve(kpis.pastDue),
    Promise.resolve(kpis.vacant),
    Promise.resolve(kpis.movingThisWeek),
    prisma.occupancy.count({ where: { orgId: ctx.orgId, status: "NEEDS_FLIP" } }),
    prisma.occupancy.count({ where: { orgId: ctx.orgId, status: "OCCUPIED" } }),
  ])

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-hairline)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Rooms <span className="italic text-[color:var(--color-ink-3)]">at a glance</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-ink-3)]">
            {kpis.totalRooms} rooms across the portfolio
          </p>
        </div>
      </div>

      <KpiStrip
        totalRooms={kpis.totalRooms}
        pastDue={kpis.pastDue}
        pastDueAmount={Number(kpis.pastDueAmount)}
        vacant={kpis.vacant}
        movingThisWeek={kpis.movingThisWeek}
      />

      <StatusSection variant="past_due"   rooms={pastDue}   totalCount={pastDueTotal} />
      <StatusSection variant="vacant"     rooms={vacant}    totalCount={vacantTotal} />
      <StatusSection variant="moving"     rooms={moving}    totalCount={movingTotal} />
      <StatusSection variant="needs_flip" rooms={needsFlip} totalCount={needsFlipTotal} />

      <OccupiedFooter count={occupiedTotal} total={kpis.totalRooms} />
    </main>
  )
}
