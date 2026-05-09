"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { connectPadsplit, runDiscoveryNow } from "@/app/(signed-in)/settings/integrations/actions"

type Status = "ACTIVE" | "EXPIRED" | "FAILED" | "NOT_CONFIGURED"

export function ConnectPadsplitCard({
  initialStatus,
  workerOnline,
}: {
  initialStatus: Status
  workerOnline: boolean
}) {
  const [status] = useState<Status>(initialStatus)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  async function handleConnect() {
    setMessage(null)
    start(async () => {
      const res = await connectPadsplit()
      if (!res.ok) {
        setMessage(res.error)
        return
      }
      setMessage("Look at your Mac — the PadSplit login window is opening. We'll detect the new session automatically.")
      const startedAt = Date.now()
      const interval = setInterval(() => {
        router.refresh()
        if (Date.now() - startedAt > 3 * 60_000) {
          clearInterval(interval)
        }
      }, 5_000)
    })
  }

  async function handleDiscovery() {
    setMessage(null)
    start(async () => {
      const res = await runDiscoveryNow()
      if (!res.ok) { setMessage(res.error); return }
      setMessage("Discovery scrape queued. The dashboard will populate within a few minutes.")
    })
  }

  const buttonClass =
    "text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md " +
    "bg-[color:var(--color-coral)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-coral-light)] disabled:opacity-50 disabled:cursor-not-allowed"

  if (!workerOnline) {
    return (
      <div className="text-sm text-[color:var(--color-clay)] italic">
        Worker offline. Start the Mac Studio worker (see <code>roomos/packages/worker/DEPLOYMENT-1B.md</code>) before connecting PadSplit.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleConnect} disabled={pending} className={buttonClass}>
          {status === "ACTIVE" ? "Reconnect PadSplit" : "Connect PadSplit"}
        </button>
        {status === "ACTIVE" && (
          <button onClick={handleDiscovery} disabled={pending} className={buttonClass}>
            Run discovery now
          </button>
        )}
      </div>
      {message && (
        <p className="text-xs text-[color:var(--color-muted)]">{message}</p>
      )}
    </div>
  )
}
