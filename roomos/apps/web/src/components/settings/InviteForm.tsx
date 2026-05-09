"use client"

import { useState, useTransition } from "react"
import { createInvitation, revokeInvitation } from "@/app/(signed-in)/settings/team/actions"

type Pending = { id: string; email: string; role: string; createdAt: Date }

export function InviteForm({ pending }: { pending: Pending[] }) {
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    setIssued(null)
    start(async () => {
      const res = await createInvitation(fd)
      if (!res.ok) { setError(res.error); return }
      setIssued({ email: String(fd.get("email") ?? ""), url: res.inviteUrl })
      ;(e.target as HTMLFormElement).reset()
    })
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2 items-center">
        <input
          name="email"
          type="email"
          placeholder="teammate@cohostmgmt.net"
          required
          className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[220px]"
        />
        <select name="role" defaultValue="AGENT" className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
          <option value="AGENT">AGENT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-coral)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-coral-soft)] disabled:opacity-50"
        >
          {submitting ? "Generating…" : "Generate invite link"}
        </button>
      </form>

      {error && <p className="text-sm text-[color:var(--color-clay)]">{error}</p>}

      {issued && (
        <div className="p-4 rounded-md border border-[color:var(--color-rule-hi)] bg-[color:var(--color-paper-2)]">
          <p className="text-xs text-[color:var(--color-muted)] mb-2">
            Share this link with <strong>{issued.email}</strong>. It expires in 14 days.
          </p>
          <div className="flex gap-2 items-center">
            <code className="text-xs flex-1 px-3 py-2 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded break-all">
              {issued.url}
            </code>
            <button
              onClick={() => copy(issued.url)}
              className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[8px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
            Pending invitations ({pending.length})
          </h3>
          <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
            <table className="w-full text-sm">
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
                    <td className="px-4 py-2">{p.email}</td>
                    <td className="px-4 py-2 text-[color:var(--color-muted)]">{p.role}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-clay)] hover:text-[color:var(--color-clay)]">
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
