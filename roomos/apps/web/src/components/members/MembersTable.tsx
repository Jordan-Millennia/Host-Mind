import Link from "next/link"
import { formatMoney, formatDaysAgo } from "@/lib/format"
import type { MemberListRow } from "@/lib/members-queries"

const STATUS_LABEL: Record<string, string> = {
  OCCUPIED: "Active",
  MOVING_IN: "Moving in",
  MOVING_OUT: "Moving out",
  VACANT: "Vacant",
  INACTIVE: "Inactive",
  WAITING_APPROVAL: "Pending",
}

function statusTone(status: string | null, balance: number | null): string {
  if (status === "MOVING_OUT") return "border-[color:var(--color-rule)] text-[color:var(--color-muted)]"
  if (status === "MOVING_IN") return "border-[color:var(--color-coral)]/40 text-[color:var(--color-coral)]"
  if (status === "OCCUPIED" && balance != null && balance < 0) {
    return "border-[color:var(--color-coral)] text-[color:var(--color-coral)] bg-[color:var(--color-coral)]/5"
  }
  if (status === "OCCUPIED") return "border-emerald-700/30 text-emerald-800 bg-emerald-700/5"
  return "border-[color:var(--color-rule)] text-[color:var(--color-muted)]"
}

function balanceTone(balance: number | null): string {
  if (balance == null) return "text-[color:var(--color-muted)]"
  if (balance < 0) return "text-[color:var(--color-coral)] font-semibold"
  if (balance > 0) return "text-emerald-800"
  return "text-[color:var(--color-ink)]"
}

export function MembersTable({ rows }: { rows: MemberListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[color:var(--color-rule)] rounded-sm py-16 text-center text-sm text-[color:var(--color-muted)]">
        No members match the current filters.
      </div>
    )
  }
  return (
    <div className="border border-[color:var(--color-rule)] rounded-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-surface)]/60 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
          <tr>
            <Th>Member</Th>
            <Th>Status</Th>
            <Th>Property</Th>
            <Th className="text-right">Room</Th>
            <Th className="text-right">Balance</Th>
            <Th className="text-right">Last paid</Th>
            <Th>Contact</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              className="border-t border-[color:var(--color-rule)]/60 hover:bg-[color:var(--color-surface)]/40"
            >
              <Td>
                <Link
                  href={`/members/${m.id}`}
                  className="font-medium text-[color:var(--color-ink)] hover:text-[color:var(--color-coral)]"
                >
                  {m.name}
                </Link>
              </Td>
              <Td>
                {m.status ? (
                  <span
                    className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusTone(m.status, m.balance)}`}
                  >
                    {STATUS_LABEL[m.status] ?? m.status}
                    {m.status === "OCCUPIED" && m.balance != null && m.balance < 0 ? " · past due" : ""}
                  </span>
                ) : (
                  <span className="text-[color:var(--color-muted)] text-xs">— no active room —</span>
                )}
              </Td>
              <Td>
                {m.property ? (
                  <Link
                    href={`/properties/${m.property.id}`}
                    className="text-[color:var(--color-ink)] hover:text-[color:var(--color-coral)]"
                  >
                    {m.property.address}
                  </Link>
                ) : (
                  <span className="text-[color:var(--color-muted)]">—</span>
                )}
              </Td>
              <Td className="text-right tabular-nums">{m.roomNumber ?? "—"}</Td>
              <Td className={`text-right tabular-nums ${balanceTone(m.balance)}`}>
                {m.balance == null ? "—" : formatMoney(m.balance)}
              </Td>
              <Td className="text-right tabular-nums">
                {m.lastPaidAmount == null ? (
                  <span className="text-[color:var(--color-muted)]">—</span>
                ) : (
                  <span>
                    {formatMoney(m.lastPaidAmount)}
                    {m.lastPaidDate ? (
                      <span className="block text-[10px] text-[color:var(--color-muted)] mt-0.5">
                        {formatDaysAgo(m.lastPaidDate)}
                      </span>
                    ) : null}
                  </span>
                )}
              </Td>
              <Td className="text-[color:var(--color-muted)] text-xs">
                {m.email ?? m.phone ?? "—"}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-medium ${className}`}>{children}</th>
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}
