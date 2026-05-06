import { notFound } from "next/navigation"
import { requireSignedIn } from "@/lib/auth"
import { getRoomDetail } from "@/lib/room-queries"
import { RoomHeader } from "@/components/room-detail/RoomHeader"
import { OccupancyCard } from "@/components/room-detail/OccupancyCard"
import { ActivityTimeline } from "@/components/room-detail/ActivityTimeline"
import { PlatformsSidebar } from "@/components/room-detail/PlatformsSidebar"
import { SyncMetadataSidebar } from "@/components/room-detail/SyncMetadataSidebar"

export default async function RoomDetailPage({ params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireSignedIn()
  const { roomId } = await params

  const data = await getRoomDetail(ctx.orgId, roomId)
  if (!data) notFound()

  const { room, paymentEvents, recentSyncs } = data
  const padsplit = room.listings.find((l) => l.platform === "PADSPLIT")
  const occupancy = padsplit?.occupancies[0] ?? null
  const member = occupancy?.member ?? null

  const items = [
    ...paymentEvents.map((p) => ({ kind: "payment" as const, date: p.eventDate, amount: p.amount.toString() })),
    ...recentSyncs.slice(0, 3).map((s) => ({
      kind: "scrape" as const, date: s.startedAt, status: s.status, itemsSynced: s.itemsSynced,
    })),
    ...(occupancy?.moveInDate && member
      ? [{ kind: "moved_in" as const, date: occupancy.moveInDate, memberName: member.name }]
      : []),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 12)

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <RoomHeader
        address={room.property.address}
        roomNumber={room.roomNumber}
        market={room.property.market}
        ownerName={room.property.owner?.name ?? null}
        externalRoomId={padsplit?.externalListingId ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div>
          <OccupancyCard member={member} occupancy={occupancy} />
          <ActivityTimeline items={items} />
        </div>
        <div>
          <PlatformsSidebar listings={room.listings} />
          <SyncMetadataSidebar
            lastSyncedAt={padsplit?.lastSyncedAt ?? null}
            lastFinancialSyncAt={occupancy?.lastFinancialSyncAt ?? null}
          />
        </div>
      </div>
    </main>
  )
}
