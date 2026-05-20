import { requireSignedIn } from "@/lib/auth"
import { getMemberById } from "@/lib/members-queries"
import { formatMoney, formatDate, formatDaysAgo } from "@/lib/format"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const ctx = await requireSignedIn()
  const { memberId } = await params
  const member = await getMemberById(ctx.orgId, memberId)
  if (!member) notFound()

  const pastDue = member.current?.balance != null && member.current.balance < 0
  const initials = member.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div className="max-w-[1200px] mx-auto px-10 pt-14 pb-20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3">
        <Link href="/members" className="hover:text-[color:var(--color-coral)]">
          ← Members
        </Link>
        {member.current?.property ? (
          <>
            {" · "}
            <Link
              href={`/properties/${member.current.property.id}`}
              className="hover:text-[color:var(--color-coral)]"
            >
              {member.current.property.address}
            </Link>
          </>
        ) : null}
      </div>

      <div className="flex items-start gap-6 pb-7 border-b border-[color:var(--color-hairline)] mb-8">
        <div className="h-20 w-20 rounded-full bg-[color:var(--color-surface)] border border-[color:var(--color-rule)] flex items-center justify-center text-2xl font-medium text-[color:var(--color-ink)] shrink-0">
          {initials || "—"}
        </div>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-[44px] leading-none font-normal tracking-[-0.02em] text-[color:var(--color-ink)]">
            {member.name}
            <span className="italic text-[color:var(--color-coral)]">.</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[color:var(--color-muted)]">
            {member.current ? (
              <span>
                {STATUS_LABEL[member.current.status] ?? member.current.status}
                {member.current.roomNumber ? ` · Room ${member.current.roomNumber}` : ""}
                {member.current.since ? ` · since ${formatDate(member.current.since)}` : ""}
              </span>
            ) : (
              <span>No active occupancy</span>
            )}
            {pastDue ? (
              <span className="inline-flex items-center gap-1.5 border border-[color:var(--color-coral)] bg-[color:var(--color-coral)]/5 text-[color:var(--color-coral)] rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]">
                Past due
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
        <Stat label="Balance" value={member.current?.balance == null ? "—" : formatMoney(member.current.balance)} pastDue={pastDue} />
        <Stat label="Status" value={member.current ? STATUS_LABEL[member.current.status] ?? member.current.status : "Inactive"} />
        <Stat label="Room" value={member.current?.roomNumber ?? "—"} />
        <Stat label="First seen" value={formatDaysAgo(member.firstSeenAt)} />
      </div>

      <section className="mb-12">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-medium mb-4">Contact</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
          <Row label="Email" value={member.email ?? "—"} />
          <Row label="Phone" value={member.phone ?? "—"} />
          <Row
            label="Vault dossier"
            value={
              member.dossierPath ? (
                <code className="text-xs text-[color:var(--color-muted)]">{member.dossierPath}</code>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-medium mb-4">
          Occupancy history <span className="italic text-[color:var(--color-muted)] text-base">— {member.history.length} record{member.history.length === 1 ? "" : "s"}</span>
        </h2>
        {member.history.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No occupancy records yet.</p>
        ) : (
          <div className="border border-[color:var(--color-rule)] rounded-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-surface)]/60 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Property</th>
                  <th className="px-4 py-3 text-left font-medium">Room</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 text-left font-medium">Started</th>
                  <th className="px-4 py-3 text-left font-medium">Ended</th>
                </tr>
              </thead>
              <tbody>
                {member.history.map((h) => (
                  <tr key={h.id} className="border-t border-[color:var(--color-rule)]/60">
                    <td className="px-4 py-3">{h.propertyAddress}</td>
                    <td className="px-4 py-3">{h.roomNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs">{STATUS_LABEL[h.status] ?? h.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {h.balance == null ? "—" : formatMoney(h.balance)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{formatDate(h.leaseStartedAt)}</td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">
                      {h.leaseEndedAt ? formatDate(h.leaseEndedAt) : <span className="italic">open</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  OCCUPIED: "Active",
  MOVING_IN: "Moving in",
  MOVING_OUT: "Moving out",
  VACANT: "Vacant",
  INACTIVE: "Inactive",
  WAITING_APPROVAL: "Pending",
}

function Stat({ label, value, pastDue }: { label: string; value: React.ReactNode; pastDue?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)] mb-1.5">
        {label}
      </div>
      <div
        className={`text-2xl tabular-nums ${pastDue ? "text-[color:var(--color-coral)] font-semibold" : "text-[color:var(--color-ink)]"}`}
      >
        {value}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="w-32 shrink-0 text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
        {label}
      </div>
      <div className="text-sm text-[color:var(--color-ink)] break-all">{value}</div>
    </div>
  )
}
