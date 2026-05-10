import { setRole } from "@/app/(signed-in)/settings/team/actions"

type TeamUser = { id: string; email: string; role: "ADMIN" | "AGENT" | "OWNER"; clerkUserId: string }

export function TeamList({ users, currentUserId }: { users: TeamUser[]; currentUserId: string }) {
  if (users.length === 0) {
    return <div className="italic text-sm text-[color:var(--color-ink-3)]">No team users yet.</div>
  }

  return (
    <div className="border border-[color:var(--color-hairline)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-ink-3)]">
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId
            const adminStyle = { color: "var(--color-coral-dark)", borderColor: "rgba(184,147,42,0.40)", background: "rgba(184,147,42,0.10)" }
            const otherStyle = { color: "var(--color-ink-3)", borderColor: "var(--color-hairline)", background: "transparent" }
            return (
              <tr key={u.id} className="border-b last:border-b-0 border-[color:var(--color-hairline)]">
                <td className="px-4 py-3 font-medium">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                    style={u.role === "ADMIN" ? adminStyle : otherStyle}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {isSelf ? (
                    <span className="text-[11px] italic text-[color:var(--color-ink-3)]">you</span>
                  ) : (
                    <form action={setRole} className="inline-flex gap-2">
                      <input type="hidden" name="teamUserId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="text-sm px-2 py-1 rounded-md border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)]">
                        <option value="AGENT">AGENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <button type="submit" className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-hairline)] hover:border-[color:var(--color-hairline-hi)]">
                        Update
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
