import { Queue, Worker, type JobsOptions } from "bullmq"
import IORedis from "ioredis"
import { env } from "./env"
import { log } from "./log"

export const QUEUE_NAME = "padsplit"

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

connection.on("error", (err) => log.error({ err: err.message }, "redis connection error"))
connection.on("connect", () => log.info("redis connected"))

export const queue = new Queue(QUEUE_NAME, { connection })

export type JobName =
  | "padsplit:discovery"
  | "padsplit:occupancy"
  | "padsplit:financials"
  | "padsplit:interactive_login"
  | "vault-sync"
  | "airbnb-sync"

export async function enqueue(name: JobName, data: unknown = {}, opts?: JobsOptions) {
  await queue.add(name, data, opts)
}

export function startWorker(processors: Record<JobName, () => Promise<unknown>>) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const fn = processors[job.name as JobName]
      if (!fn) throw new Error(`no processor for ${job.name}`)
      return await fn()
    },
    { connection, concurrency: 1 },
  )
  worker.on("completed", (job) => log.info({ id: job.id, name: job.name }, "job completed"))
  worker.on("failed", (job, err) => log.error({ id: job?.id, name: job?.name, err: err.message }, "job failed"))
  return worker
}
