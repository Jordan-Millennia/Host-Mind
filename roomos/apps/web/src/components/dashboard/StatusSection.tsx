import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { RoomCard } from "./RoomCard"
import { EmptyShim } from "./EmptyShim"

const STATUS_LABEL: Record<string, { name: string; color: string; chipKey: string }> = {
  past_due:   { name: "Past Due",          color: "var(--color-clay)",      chipKey: "past_due" },
  vacant:     { name: "Vacant",            color: "var(--color-clay)",   chipKey: "vacant" },
  moving:     { name: "Moving This Week",  color: "var(--color-amber)",   chipKey: "moving" },
  needs_flip: { name: "Needs Flip",        color: "var(--color-amber)",     chipKey: "needs_flip" },
}

export function StatusSection({
  variant,
  rooms,
  totalCount,
}: {
  variant: "past_due" | "vacant" | "moving" | "needs_flip"
  rooms: RoomCardData[]
  totalCount: number
}) {
  const meta = STATUS_LABEL[variant]!
  return (
    <section className="mb-9">
      <header className="flex items-baseline gap-4 mb-3">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: meta.color }}
        >
          {meta.name}
        </h2>
        <span className="text-[11px] font-medium text-[color:var(--color-muted)] px-2 py-[2px] rounded-full bg-[color:rgba(26,26,26,0.05)]">
          {totalCount}
        </span>
        <span className="flex-1 h-px bg-[color:var(--color-rule)]" />
        {totalCount > rooms.length && (
          <Link
            href={`/all-rooms?status=${meta.chipKey}`}
            className="text-[11px] font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-coral-dark)]"
          >
            View all →
          </Link>
        )}
      </header>
      {rooms.length === 0 ? (
        <EmptyShim label={meta.name} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rooms.map((r) => (
            <RoomCard key={r.roomId} room={r} variant={variant} />
          ))}
        </div>
      )}
    </section>
  )
}
