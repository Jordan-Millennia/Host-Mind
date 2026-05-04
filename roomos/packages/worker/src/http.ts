import { env } from "./env"
import { log } from "./log"

const headers = () => ({
  authorization: `Bearer ${env.WORKER_API_KEY}`,
  "x-worker-id": env.WORKER_ID,
})

export async function postHeartbeat(): Promise<void> {
  try {
    const res = await fetch(`${env.WEB_BASE_URL}/api/heartbeat`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!res.ok) log.warn({ status: res.status }, "heartbeat non-200")
  } catch (err) {
    log.warn({ err: (err as Error).message }, "heartbeat failed")
  }
}

export async function uploadScreenshot(filePath: string): Promise<void> {
  try {
    const { readFile } = await import("node:fs/promises")
    const { basename } = await import("node:path")
    const buf = await readFile(filePath)
    const form = new FormData()
    form.append("file", new Blob([buf]), basename(filePath))
    form.append("name", basename(filePath))
    await fetch(`${env.WEB_BASE_URL}/api/screenshots`, {
      method: "POST",
      headers: headers(),
      body: form,
    })
  } catch (err) {
    log.warn({ err: (err as Error).message, filePath }, "screenshot upload failed")
  }
}
