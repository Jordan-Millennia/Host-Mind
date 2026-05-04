import { queue, startWorker } from "./queue"
import { processDiscovery } from "./jobs/padsplit-discovery"
import { processOccupancy } from "./jobs/padsplit-occupancy"
import { processFinancials } from "./jobs/padsplit-financials"
import { processInteractiveLogin } from "./jobs/padsplit-interactive-login"
import { log } from "./log"
import { postHeartbeat } from "./http"

const REPEAT = {
  occupancy: { every: 30 * 60 * 1000 },
  financials: { every: 2 * 60 * 60 * 1000 },
  discovery: { every: 7 * 24 * 60 * 60 * 1000 },
}

export async function startScheduler(): Promise<void> {
  log.info("starting bullmq scheduler")

  await queue.add("padsplit:occupancy", {}, { repeat: REPEAT.occupancy, jobId: "repeat:occupancy" })
  await queue.add("padsplit:financials", {}, { repeat: REPEAT.financials, jobId: "repeat:financials" })
  await queue.add("padsplit:discovery", {}, { repeat: REPEAT.discovery, jobId: "repeat:discovery" })

  startWorker({
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
