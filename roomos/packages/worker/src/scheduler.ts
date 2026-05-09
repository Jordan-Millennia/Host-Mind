import { queue, startWorker } from "./queue"
import { processDiscovery } from "./jobs/padsplit-discovery"
import { processOccupancy } from "./jobs/padsplit-occupancy"
import { processFinancials } from "./jobs/padsplit-financials"
import { processInteractiveLogin } from "./jobs/padsplit-interactive-login"
import { processVaultSync } from "./jobs/vault-sync"
import { log } from "./log"
import { postHeartbeat } from "./http"

const REPEAT = {
  // Phase 2A: vault-sync replaces PadSplit occupancy + financial scrapers.
  vaultSync: { every: 15 * 60 * 1000 },
  // Phase 2B/2C: kept for reference; jobs are unscheduled in Phase 2A.
  // occupancy: { every: 30 * 60 * 1000 },
  // financials: { every: 2 * 60 * 60 * 1000 },
  // discovery: { every: 7 * 24 * 60 * 60 * 1000 },
}

export async function startScheduler(): Promise<void> {
  log.info("starting bullmq scheduler")

  // Clean up any pre-existing repeatable schedules so a changed `every` value
  // (e.g., bumping occupancy from 30 to 15 min) doesn't leave the old schedule
  // running alongside the new one. BullMQ keys repeatables by hash of name+opts.
  const existing = await queue.getRepeatableJobs()
  for (const r of existing) {
    if (r.name.startsWith("padsplit:") || r.name === "vault-sync") {
      await queue.removeRepeatableByKey(r.key)
      log.info({ name: r.name, key: r.key }, "removed pre-existing repeatable")
    }
  }

  // Phase 2A: vault-sync runs every 15 min (replaces PadSplit recurring jobs).
  await queue.add(
    "vault-sync",
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: "vault-sync-recurring",
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  )

  // Phase 2A: PadSplit recurring jobs are unscheduled (commented out).
  // Code kept available for Phase 2B/2C debugging via `pnpm cli run --job <name>`.
  // await queue.add("padsplit:occupancy", {}, { repeat: REPEAT.occupancy, jobId: "repeat:occupancy" })
  // await queue.add("padsplit:financials", {}, { repeat: REPEAT.financials, jobId: "repeat:financials" })
  // await queue.add("padsplit:discovery", {}, { repeat: REPEAT.discovery, jobId: "repeat:discovery" })

  startWorker({
    // Phase 2A: vault-sync is the primary recurring job.
    "vault-sync": processVaultSync,
    // Phase 2B/2C: PadSplit worker cases kept intact for manual CLI invocation.
    "padsplit:discovery": processDiscovery,
    "padsplit:occupancy": processOccupancy,
    "padsplit:financials": processFinancials,
    "padsplit:interactive_login": processInteractiveLogin,
  })

  // Pulse every 60s; web pill goes red if silent for 5+ min
  setInterval(() => { void postHeartbeat() }, 60_000)
  void postHeartbeat()  // fire one immediately

  log.info("scheduler running — Ctrl+C to stop")
  await new Promise(() => {})  // run forever
}
