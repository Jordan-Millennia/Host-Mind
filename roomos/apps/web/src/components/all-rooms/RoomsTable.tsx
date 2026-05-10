import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { formatMoney, formatDate } from "@/lib/format"

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OCCUPIED:         { label: "Occupied",          color: "var(--color-green)" },
  VACANT:           { label: "Vacant",            color: "var(--color-clay)" },
  MOVING_IN:        { label: "Moving In",         color: "var(--color-amber)" },
  MOVING_OUT:       { label: "Moving Out",        color: "var(--color-amber)" },
  NEEDS_FLIP:       { label: "Needs Flip",        color: "var(--color-amber)" },
  WAITING_APPROVAL: { label: "Waiting Approval",  color: "var(--color-amber)" },
  INACTIVE:         { label: "Inactive",          color: "var(--color-ink-3)" },
}

export function RoomsTable({ rows }: { rows: RoomCardData[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm italic text-[color:var(--color-ink-3)] border border-[color:var(--color-hairline)] rounded-md">
        No rooms match the current filters.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-hairline)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
            <th className="text-left px-4 py-3">Property · Room</th>
            <th className="text-left px-4 py-3">Owner</th>
            <th className="text-left px-4 py-3">Member</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Move-in</th>
            <th className="text-left px-4 py-3">Lease end</th>
            <th className="text-right px-4 py-3">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.INACTIVE!
            return (
              <tr
                key={r.roomId}
                className="border-b last:border-b-0 border-[color:var(--color-hairline)] hover:bg-[color:var(--color-paper-2)]"
              >
                <td className="px-4 py-3">
                  <Link href={`/rooms/${r.roomId}`} className="font-semibold hover:text-[color:var(--color-coral-dark)]">
                    {r.propertyAddress}
                  </Link>
                  <span className="text-[color:var(--color-ink-3)]"> · Rm {r.roomNumber ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-[color:var(--color-ink-3)]">{r.ownerName ?? "—"}</td>
                <td className="px-4 py-3">{r.memberName ?? <span className="italic text-[color:var(--color-ink-3)]">Vacant</span>}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                    style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}
                  >
                    {s.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">{formatDate(r.moveInDate)}</td>
                <td className="px-4 py-3 text-xs">{formatDate(r.leaseEndDate)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.daysPastDue && r.daysPastDue >= 1 ? "text-[color:var(--color-clay)] font-semibold" : ""}`}>
                  {formatMoney(r.currentBalance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
