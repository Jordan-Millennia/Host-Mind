import { deleteOwner } from "@/app/(signed-in)/settings/owners/actions"

type Owner = { id: string; name: string; email: string | null; _count: { properties: number } }

export function OwnersList({ owners }: { owners: Owner[] }) {
  if (owners.length === 0) {
    return (
      <div className="text-sm italic text-[color:var(--color-muted)] py-4">
        No owners yet. Add one below or upload a CSV.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-right px-4 py-3">Properties</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => (
            <tr key={o.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
              <td className="px-4 py-3 font-medium">{o.name}</td>
              <td className="px-4 py-3 text-[color:var(--color-muted)]">{o.email ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{o._count.properties}</td>
              <td className="px-4 py-3 text-right">
                <form action={deleteOwner}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    disabled={o._count.properties > 0}
                    title={o._count.properties > 0 ? "Reassign properties first" : "Delete owner"}
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-due)] hover:text-[color:var(--color-due)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete
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
