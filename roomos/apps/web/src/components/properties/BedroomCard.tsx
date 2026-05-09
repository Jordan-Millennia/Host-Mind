import type { RoomDetail } from "@/lib/property-queries"
import { formatMoney } from "@/lib/format"

export function BedroomCard({ room }: { room: RoomDetail }) {
  const isTerminated = room.status === "INACTIVE" && (room.balance ?? 0) > 0
  return (
    <div
      className="bg-[color:var(--color-surface)] p-6 cursor-pointer hover:bg-[color:var(--color-paper-2)] transition-colors"
      style={isTerminated ? { background: "linear-gradient(135deg, var(--color-surface) 0%, var(--color-clay-bg) 380%)" } : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="italic text-[color:var(--color-ink-3)] font-[family-name:var(--font-display)]">{room.roomNumber}</span>
          <span className="text-sm font-semibold text-[color:var(--color-ink)] tracking-[-0.005em]">
            {/* Names like "Pearl" / "Sage" come from a future palette mapping; for now just the room number. */}
          </span>
        </div>
        <StatusPill status={room.status} />
      </div>

      <div className="flex gap-4 items-center mb-3.5">
        <div className="w-9 h-9 rounded-full bg-[color:var(--color-paper-2)] border border-[color:var(--color-hairline)] grid place-items-center text-sm font-medium font-[family-name:var(--font-display)] text-[color:var(--color-ink-2)]">
          {room.member ? initials(room.member.name) : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[color:var(--color-ink)]">{room.member?.name ?? "Vacant"}</div>
          <div className="text-xs text-[color:var(--color-ink-3)]">
            {room.member ? `since ${room.member.firstSeenAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "needs relisting"}
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-3.5 border-t border-[color:var(--color-hairline-2)]">
        <Fin label="Weekly" value={room.weeklyRate ? formatMoney(room.weeklyRate) : "—"} />
        <Fin label="Balance" value={formatMoney(room.balance ?? 0)} danger={isTerminated} />
        <Fin label="Last paid" value={room.lastPaymentAt ? room.lastPaymentAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} />
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    OCCUPIED:        { bg: "var(--color-green-bg)", fg: "var(--color-green)", label: "Occupied" },
    VACANT:          { bg: "var(--color-clay-bg)", fg: "var(--color-clay)", label: "Vacant" },
    INACTIVE:        { bg: "var(--color-ink)", fg: "var(--color-paper)", label: "Terminated" },
    MOVING_IN:       { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Moving in" },
    MOVING_OUT:      { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Moving out" },
    WAITING_APPROVAL:{ bg: "var(--color-slate-bg)", fg: "var(--color-slate)", label: "Pending" },
  }
  const c = map[status] ?? map["VACANT"]!
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-sm" style={{ background: c.bg, color: c.fg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {c.label}
    </span>
  )
}

function Fin({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex-1">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)] font-medium mb-1">{label}</div>
      <div
        className="font-[family-name:var(--font-display)] text-[17px] tracking-[-0.005em]"
        style={{ color: danger ? "var(--color-clay)" : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase()
}
