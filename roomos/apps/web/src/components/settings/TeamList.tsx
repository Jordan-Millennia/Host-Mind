import { setRole } from "@/app/(signed-in)/settings/team/actions"

type TeamUser = { id: string; email: string; role: "ADMIN" | "AGENT" | "OWNER"; clerkUserId: string }

export function TeamList({ users, currentUserId }: { users: TeamUser[]; currentUserId: string }) {
  if (users.length === 0) {
    return <div className="italic text-sm text-[color:var(--color-muted)]">No team users yet.</div>
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId
            const adminStyle = { color: "var(--color-gold-dark)", borderColor: "rgba(184,147,42,0.40)", background: "rgba(184,147,42,0.10)" }
            const otherStyle = { color: "var(--color-muted)", borderColor: "var(--color-rule)", background: "transparent" }
            return (
              <tr key={u.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
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
                    <span className="text-[11px] italic text-[color:var(--color-muted)]">you</span>
                  ) : (
                    <form action={setRole} className="inline-flex gap-2">
                      <input type="hidden" name="teamUserId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="text-sm px-2 py-1 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
                        <option value="AGENT">AGENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <button type="submit" className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
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
