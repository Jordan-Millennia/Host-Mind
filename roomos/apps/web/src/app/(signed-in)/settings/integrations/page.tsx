import { prisma } from "@roomos/db"
import { requireRole } from "@/lib/auth"
import { PlatformCard } from "@/components/settings/PlatformCard"
import { ConnectPadsplitCard } from "@/components/settings/ConnectPadsplitCard"

export default async function IntegrationsPage() {
  const ctx = await requireRole("ADMIN")

  const recentListing = await prisma.platformListing.findFirst({
    where: { orgId: ctx.orgId, platform: "PADSPLIT" },
    orderBy: { lastSyncedAt: "desc" },
    select: { sessionStatus: true },
  })
  const status = (recentListing?.sessionStatus ?? "NOT_CONFIGURED") as
    "ACTIVE" | "EXPIRED" | "FAILED" | "NOT_CONFIGURED"

  const heartbeat = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  })
  // eslint-disable-next-line react-compiler/react-compiler -- Date.now() is safe in async Server Components
  const workerOnline = !!heartbeat && Date.now() - heartbeat.lastSeenAt.getTime() < 5 * 60_000

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PlatformCard
        name="PadSplit"
        status={status === "ACTIVE" ? "connected" : "disconnected"}
        description={
          status === "ACTIVE"
            ? "Worker is logged in and syncing rooms, members, and balances on schedule."
            : "Connect to PadSplit by signing in once on the Mac Studio worker. Cookies persist; subsequent syncs are automatic."
        }
      >
        <ConnectPadsplitCard initialStatus={status} workerOnline={workerOnline} />
      </PlatformCard>

      <PlatformCard
        name="Airbnb"
        status="coming_soon"
        description="Reservations, payouts, and guest messaging across all your Airbnb listings. Lands in Phase 2."
        disabled
      />

      <PlatformCard
        name="TurboTenant"
        status="coming_soon"
        description="Long-term tenant leases, rent collection, and maintenance tickets. Lands in Phase 3."
        disabled
      />
    </div>
  )
}
