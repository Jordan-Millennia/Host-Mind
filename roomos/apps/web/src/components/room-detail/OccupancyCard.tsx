import { formatMoney, formatDate } from "@/lib/format"

type Member = { id: string; name: string; firstSeenAt: Date }
type Occupancy = {
  status: string
  daysPastDue: number | null
  currentBalance: unknown
  lastPaymentAmount: unknown
  lastPaymentAt: Date | null
  moveInDate: Date | null
}

export function OccupancyCard({ member, occupancy }: { member: Member | null; occupancy: Occupancy | null }) {
  if (!member || !occupancy) {
    return (
      <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
          Current occupancy
        </h2>
        <p className="italic text-[color:var(--color-muted)]">No active member.</p>
      </div>
    )
  }

  const initials = member.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  const tenureDays = Math.floor((Date.now() - new Date(member.firstSeenAt).getTime()) / (24 * 60 * 60 * 1000))

  return (
    <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Current occupancy
      </h2>
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-charcoal))" }}
        >
          {initials}
        </div>
        <div>
          <div className="font-bold flex items-center gap-2">
            <span>{member.name}</span>
            {occupancy.daysPastDue && occupancy.daysPastDue >= 1 && (
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-[2px] rounded border"
                style={{ background: "rgba(196,93,46,0.10)", color: "var(--color-due)", borderColor: "rgba(196,93,46,0.40)" }}
              >
                {occupancy.daysPastDue}d past due
              </span>
            )}
          </div>
          <div className="text-xs text-[color:var(--color-muted)] mt-1">
            Member since {formatDate(member.firstSeenAt)} · {tenureDays} days in residence
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        <Stat label="Balance" value={formatMoney(occupancy.currentBalance as string | null)} accent={occupancy.daysPastDue && occupancy.daysPastDue >= 1 ? "due" : undefined} />
        <Stat label="Last paid" value={formatMoney(occupancy.lastPaymentAmount as string | null)} />
        <Stat label="Last payment" value={formatDate(occupancy.lastPaymentAt)} />
        <Stat label="Moved in" value={formatDate(occupancy.moveInDate)} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "due" }) {
  const color = accent === "due" ? "text-[color:var(--color-due)]" : "text-[color:var(--color-charcoal)]"
  return (
    <div className="bg-[color:var(--color-paper-2)] p-3 rounded">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
