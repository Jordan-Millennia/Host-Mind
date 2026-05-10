import { formatMoney } from "@/lib/format"

type Props = {
  totalRooms: number
  pastDue: number
  pastDueAmount: string | number
  vacant: number
  movingThisWeek: number
}

export function KpiStrip({ totalRooms, pastDue, pastDueAmount, vacant, movingThisWeek }: Props) {
  const vacancyPct = totalRooms > 0 ? ((vacant / totalRooms) * 100).toFixed(1) : "0.0"

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-10">
      <Tile label="Total Rooms" num={totalRooms.toString()} sub={`across the portfolio`} />
      <Tile
        label="Past Due"
        num={pastDue.toString()}
        sub={`${formatMoney(pastDueAmount)} overdue`}
        accent="due"
      />
      <Tile label="Vacant" num={vacant.toString()} sub={`${vacancyPct}% vacancy`} />
      <Tile label="Moving This Week" num={movingThisWeek.toString()} sub="MOVE-INS + MOVE-OUTS" />
    </div>
  )
}

function Tile({ label, num, sub, accent }: { label: string; num: string; sub: string; accent?: "due" }) {
  const numClass = accent === "due" ? "text-[color:var(--color-clay)]" : "text-[color:var(--color-ink-2)]"
  const tileClass =
    accent === "due"
      ? "border-[color:rgba(196,93,46,0.30)] bg-[color:rgba(196,93,46,0.03)]"
      : "border-[color:var(--color-hairline)] bg-[color:var(--color-paper)]"

  return (
    <div className={`p-7 rounded-md border ${tileClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ink-3)]">
        {label}
      </div>
      <div className={`mt-3 font-[family-name:var(--font-display)] text-4xl font-bold leading-none tracking-tight ${numClass}`}>
        {num}
      </div>
      <div className="mt-2 text-xs text-[color:var(--color-ink-3)]">{sub}</div>
    </div>
  )
}
