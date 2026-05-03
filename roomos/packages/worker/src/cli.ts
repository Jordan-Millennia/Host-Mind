#!/usr/bin/env node
import { log } from "./log"
import { interactiveLogin, checkPadsplitSession } from "./padsplit/login"

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case "login": {
      const platform = parseFlag(rest, "--platform") ?? "padsplit"
      if (platform !== "padsplit") throw new Error(`unknown platform: ${platform}`)
      await interactiveLogin()
      log.info("done")
      return
    }

    case "check": {
      await checkPadsplitSession()
      return
    }

    case "run": {
      const job = parseFlag(rest, "--job") ?? ""
      if (job === "padsplit:discovery") {
        const { runDiscovery } = await import("./padsplit/discovery.js")
        const result = await runDiscovery()
        log.info(result, "discovery complete")
        return
      }
      if (job === "padsplit:occupancy") {
        const { runOccupancy } = await import("./padsplit/occupancy.js")
        const result = await runOccupancy()
        log.info(result, "occupancy complete")
        return
      }
      if (job === "padsplit:financials") {
        const { runFinancials } = await import("./padsplit/financials.js")
        const result = await runFinancials()
        log.info(result, "financials complete")
        return
      }
      log.error({ job }, "unknown job")
      process.exit(1)
    }

    case "scheduler": {
      const { startScheduler } = await import("./scheduler.js")
      await startScheduler()
      return
    }

    case "version": {
      log.info({ version: "0.1.0" }, "@roomos/worker")
      return
    }

    default:
      log.error({ command }, "unknown command")
      process.exit(1)
  }
}

function parseFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

main().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, "cli failed")
  process.exit(1)
})
