import { assignPropertyOwner } from "@/app/(signed-in)/settings/owners/actions"

type Property = { id: string; address: string; city: string | null }
type Owner = { id: string; name: string }

export function UnmappedProperties({ properties, owners }: { properties: Property[]; owners: Owner[] }) {
  if (properties.length === 0) {
    return (
      <div className="text-sm italic text-[color:var(--color-muted)] py-4">
        Every property is mapped to an owner — nice.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Property</th>
            <th className="text-left px-4 py-3">City</th>
            <th className="text-left px-4 py-3">Assign owner</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
              <td className="px-4 py-3 font-medium">{p.address}</td>
              <td className="px-4 py-3 text-[color:var(--color-muted)]">{p.city ?? "—"}</td>
              <td className="px-4 py-3">
                <form action={assignPropertyOwner} className="flex gap-2">
                  <input type="hidden" name="propertyId" value={p.id} />
                  <select
                    name="ownerId"
                    defaultValue=""
                    className="text-sm px-2 py-1 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]"
                  >
                    <option value="">— select —</option>
                    {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button
                    type="submit"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
                  >
                    Assign
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
