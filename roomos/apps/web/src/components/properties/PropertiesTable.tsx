// roomos/apps/web/src/components/properties/PropertiesTable.tsx
import Link from "next/link"
import type { PropertyRow } from "@/lib/property-queries"
import { OccupancyDonut } from "./OccupancyDonut"
import { CrossListingBadge } from "./CrossListingBadge"

export function PropertiesTable({ rows }: { rows: PropertyRow[] }) {
  return (
    <div className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)]">
            <Th width="78px">ID</Th>
            <Th>Address</Th>
            <Th width="120px">Status</Th>
            <Th width="110px">Occupants</Th>
            <Th width="230px">Room statuses</Th>
            <Th width="160px">Booking approvals</Th>
            <Th width="120px">Stay rewards</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[color:var(--color-hairline-2)] last:border-0 hover:bg-[color:var(--color-paper-2)] cursor-pointer"
            >
              <td className="px-5 py-5 italic text-[color:var(--color-ink-3)] font-[family-name:var(--font-display)]">
                {r.padsplitPropertyId ?? "—"}
              </td>
              <td className="px-5 py-5">
                <div className="flex items-center gap-2 -mb-0.5">
                  <Link
                    href={`/properties/${r.id}`}
                    className="font-medium text-[color:var(--color-ink)]"
                  >
                    {r.address.split(",")[0]}
                  </Link>
                  <CrossListingBadge count={r.crossListedRoomCount} />
                </div>
                <div className="text-xs text-[color:var(--color-ink-3)] tracking-wide">
                  {[r.city, r.state].filter(Boolean).join(", ")}
                  {r.ownerName ? <span className="text-[color:var(--color-ink-2)]"> · {r.ownerName}</span> : null}
                </div>
              </td>
              <td className="px-5 py-5">
                <Pill kind={r.status} />
              </td>
              <td className="px-5 py-5 font-[family-name:var(--font-display)] text-2xl text-[color:var(--color-ink)]">
                {r.occupants}
              </td>
              <td className="px-5 py-5">
                <div className="flex items-center gap-3">
                  <OccupancyDonut occupied={r.occupiedRooms} vacant={r.vacantRooms} moving={r.movingRooms} />
                  <span className="text-sm text-[color:var(--color-ink-2)]">
                    <strong className="text-[color:var(--color-ink)] font-medium">{r.occupiedRooms}</strong> of {r.totalRooms} occupied
                  </span>
                </div>
              </td>
              <td className="px-5 py-5"><Toggle on label="Enabled" /></td>
              <td className="px-5 py-5"><Toggle on={false} label="Off" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="text-left text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold px-5 py-4"
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  )
}

function Pill({ kind }: { kind: PropertyRow["status"] }) {
  const map = {
    ACTIVE:           { bg: "var(--color-green-bg)", fg: "var(--color-green)", label: "Active" },
    ONBOARDING:       { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Onboarding" },
    PENDING_APPROVAL: { bg: "var(--color-slate-bg)", fg: "var(--color-slate)", label: "Pending approval" },
  }[kind]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm"
      style={{ background: map.bg, color: map.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: map.fg }} />
      {map.label}
    </span>
  )
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="relative w-8 h-[18px] rounded-full transition-colors"
        style={{ background: on ? "var(--color-coral)" : "var(--color-hairline)" }}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 bg-[color:var(--color-surface)] rounded-full transition-all"
          style={{ left: on ? "16px" : "2px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
        />
      </span>
      <span className="text-xs text-[color:var(--color-ink-3)]">{label}</span>
    </div>
  )
}
