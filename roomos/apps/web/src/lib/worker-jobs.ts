import { Queue } from "bullmq"
import IORedis from "ioredis"
import { env } from "./env"

const QUEUE_NAME = "padsplit"

let _connection: IORedis | null = null
let _queue: Queue | null = null

function getQueue(): Queue {
  if (_queue) return _queue
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL is not set — cannot enqueue worker jobs")
  _connection = new IORedis(url, { maxRetriesPerRequest: null })
  _queue = new Queue(QUEUE_NAME, { connection: _connection })
  return _queue
}

export async function enqueueInteractiveLogin(): Promise<{ jobId: string }> {
  const job = await getQueue().add("padsplit:interactive_login", {})
  return { jobId: String(job.id ?? "") }
}

export async function enqueueDiscovery(): Promise<{ jobId: string }> {
  const job = await getQueue().add("padsplit:discovery", {})
  return { jobId: String(job.id ?? "") }
}

void env
