import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { formatMoney, formatDate } from "@/lib/format"

const STRIPE: Record<string, string> = {
  OCCUPIED: "var(--color-green)",
  VACANT: "var(--color-clay)",
  MOVING_IN: "var(--color-amber)",
  MOVING_OUT: "var(--color-amber)",
  NEEDS_FLIP: "var(--color-amber)",
  WAITING_APPROVAL: "var(--color-amber)",
  INACTIVE: "var(--color-muted)",
}

export function RoomCard({ room, variant }: { room: RoomCardData; variant: "past_due" | "vacant" | "moving" | "needs_flip" | "occupied" }) {
  return (
    <Link
      href={`/rooms/${room.roomId}`}
      className="block relative p-5 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded-md hover:border-[color:var(--color-rule-hi)] transition-colors"
    >
      <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: STRIPE[room.status] ?? "var(--color-muted)" }} />
      <div className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight leading-tight">
        {room.propertyAddress}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
        Room {room.roomNumber ?? "—"} · {room.propertyCity ?? "—"}
      </div>

      {variant === "past_due" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">{room.memberName ?? "—"}</span>
            <Pill kind="due">{room.daysPastDue}d past due</Pill>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-[color:var(--color-muted)]">
              {room.memberMonthsTenure != null ? `Member ${room.memberMonthsTenure}mo` : "—"}
            </span>
            <span className="text-sm font-semibold tabular-nums text-[color:var(--color-clay)]">
              {formatMoney(room.currentBalance)}
            </span>
          </div>
        </>
      )}

      {variant === "vacant" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="italic text-[color:var(--color-muted)]">Empty</span>
            <Pill kind="vacant">Vacant</Pill>
          </div>
          <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
            Last sync: {formatDate(room.lastSyncedAt)}
          </div>
        </>
      )}

      {variant === "moving" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">
              {room.status === "MOVING_IN" ? "→ " : "← "}
              {room.memberName ?? "—"}
            </span>
            <Pill kind="moving">{formatDate(room.status === "MOVING_IN" ? room.moveInDate : room.leaseEndDate)}</Pill>
          </div>
          <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
            {room.status === "MOVING_IN" ? "Arriving" : "Departing"}
          </div>
        </>
      )}

      {variant === "needs_flip" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="italic text-[color:var(--color-muted)]">Needs flip</span>
            <Pill kind="flip">Awaiting</Pill>
          </div>
        </>
      )}

      {variant === "occupied" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">{room.memberName ?? "—"}</span>
            <Pill kind="occupied">Occupied</Pill>
          </div>
        </>
      )}
    </Link>
  )
}

function Pill({ kind, children }: { kind: "due" | "vacant" | "moving" | "flip" | "occupied"; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    due:      { bg: "rgba(196,93,46,0.10)",  fg: "var(--color-clay)" },
    vacant:   { bg: "rgba(163,61,61,0.10)",  fg: "var(--color-clay)" },
    moving:   { bg: "rgba(63,94,122,0.10)",  fg: "var(--color-amber)" },
    flip:     { bg: "rgba(139,111,92,0.10)", fg: "var(--color-amber)" },
    occupied: { bg: "rgba(90,122,74,0.10)",  fg: "var(--color-green)" },
  }
  const c = colors[kind]!
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-[3px] rounded border"
      style={{ background: c.bg, color: c.fg, borderColor: `${c.fg}40` }}
    >
      {children}
    </span>
  )
}
