import { env } from "./env"

/** Verify a request bears the shared WORKER_API_KEY (Bearer token). Throws on failure. */
export function requireWorkerAuth(req: Request): { workerId: string } {
  const auth = req.headers.get("authorization") ?? ""
  const match = auth.match(/^Bearer\s+(.+)$/)
  if (!match || match[1] !== env.WORKER_API_KEY) {
    throw new Error("unauthorized: invalid worker key")
  }
  const workerId = req.headers.get("x-worker-id") ?? "unknown"
  return { workerId }
}
