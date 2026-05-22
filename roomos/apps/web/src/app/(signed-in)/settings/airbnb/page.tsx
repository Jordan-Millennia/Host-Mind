import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { getUnmappedAirbnbListings } from "@/lib/property-queries"
import { confirmMapping, dismissListing } from "./actions"

export default async function AirbnbSettingsPage() {
  const ctx = await requireRole("ADMIN")
  const unmapped = await getUnmappedAirbnbListings(ctx.orgId)
  // Rooms with property labels for the picker.
  const rooms = await prisma.room.findMany({
    where: { orgId: ctx.orgId },
    include: { property: { select: { address: true } } },
    orderBy: [{ property: { address: "asc" } }, { roomNumber: "asc" }],
  })

  return (
    <div className="max-w-[1100px]">
      <h2 className="font-[family-name:var(--font-display)] text-[34px] leading-none font-normal tracking-[-0.02em] text-[color:var(--color-ink)] mb-2">
        Airbnb mapping<span className="italic text-[color:var(--color-coral)]">.</span>
      </h2>
      <p className="text-sm text-[color:var(--color-ink-2)] mb-8 max-w-[68ch]">
        Confirm which RoomOS room each unmapped Airbnb listing belongs to. Listings stay unmapped when the matcher couldn&apos;t infer a unique room — usually because the property has multiple rooms and the listing title didn&apos;t say &ldquo;Room N&rdquo;.
      </p>

      {unmapped.length === 0 ? (
        <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-8 text-center text-sm text-[color:var(--color-ink-3)] rounded-sm">
          No unmapped Airbnb listings.
        </div>
      ) : (
        <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)] text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold">
                <th className="text-left px-5 py-4">Airbnb listing</th>
                <th className="text-left px-5 py-4">Last seen</th>
                <th className="text-left px-5 py-4">Assign to room</th>
                <th className="text-right px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map((u) => (
                <tr key={u.listingId} className="border-b border-[color:var(--color-hairline-2)] last:border-0">
                  <td className="px-5 py-4 font-[family-name:var(--font-display)] italic text-[color:var(--color-ink-2)]">
                    {u.externalListingId || "—"}
                  </td>
                  <td className="px-5 py-4 text-xs text-[color:var(--color-ink-3)]">
                    {u.lastSyncedAt?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <form action={confirmMapping} className="flex gap-2 items-center">
                      <input type="hidden" name="listingId" value={u.listingId} />
                      <select
                        name="roomId"
                        required
                        defaultValue=""
                        className="border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)] text-sm px-3 py-2 rounded-sm"
                      >
                        <option value="">— pick a room —</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.property.address.split(",")[0]} · {r.roomNumber ?? "—"}
                          </option>
                        ))}
                      </select>
                      <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-sm font-medium px-4 py-2 rounded-sm">
                        Confirm
                      </button>
                    </form>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <form action={dismissListing}>
                      <input type="hidden" name="listingId" value={u.listingId} />
                      <button className="text-xs text-[color:var(--color-clay)] hover:underline">
                        Dismiss
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
