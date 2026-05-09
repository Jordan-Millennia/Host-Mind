import { BedroomCard } from "./BedroomCard"
import type { RoomDetail } from "@/lib/property-queries"

export function BedroomGrid({ rooms }: { rooms: RoomDetail[] }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-[color:var(--color-hairline-2)] border border-[color:var(--color-hairline)] mb-14">
      {rooms.map((r) => <BedroomCard key={r.roomId} room={r} />)}
    </div>
  )
}
