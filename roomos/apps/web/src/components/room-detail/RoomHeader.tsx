import Link from "next/link"

export function RoomHeader({
  address, roomNumber, market, ownerName, externalRoomId,
}: {
  address: string
  roomNumber: string | null
  market: string | null
  ownerName: string | null
  externalRoomId: string | null
}) {
  const padsplitUrl = externalRoomId ? `https://www.padsplit.com/host/listing/${externalRoomId}` : null

  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <p className="text-xs text-[color:var(--color-muted)] mb-2">
          <Link href="/rooms" className="hover:text-[color:var(--color-coral-dark)]">← All rooms</Link>
          {" · "}
          {address}
          {" · "}
          Room {roomNumber ?? "—"}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Room {roomNumber ?? "—"} <span className="italic text-[color:var(--color-muted)]">at</span> {address}
        </h1>
        <div className="mt-2 flex gap-4 text-xs text-[color:var(--color-muted)]">
          <span><strong className="text-[color:var(--color-ink-2)]">Owner:</strong> {ownerName ?? "Unmapped"}</span>
          <span><strong className="text-[color:var(--color-ink-2)]">Market:</strong> {market ?? "—"}</span>
          {externalRoomId && <span className="px-2 py-0 bg-[color:var(--color-paper-2)] rounded text-[10px] font-medium">PadSplit ID {externalRoomId}</span>}
        </div>
      </div>
      <div className="flex gap-2">
        {padsplitUrl && (
          <a
            href={padsplitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[8px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
          >
            Open in PadSplit ↗
          </a>
        )}
      </div>
    </div>
  )
}
