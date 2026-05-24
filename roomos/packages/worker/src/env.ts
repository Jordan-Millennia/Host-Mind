import { z } from "zod"
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env") })
config({ path: resolve(process.cwd(), ".env.local"), override: true })

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_API_KEY: z.string().min(32),
  WEB_BASE_URL: z.string().url(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  WORKER_ID: z.string().min(1).default("mac-studio-default"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Phase 2C operational automation. Each integration self-disables when its
  // creds are absent, so the worker boots fine before they're all provisioned.
  GHL_API_KEY: z.string().optional(),
  GHL_LOCATION_ID: z.string().optional(),
  TTLOCK_CLIENT_ID: z.string().optional(),
  TTLOCK_ACCESS_TOKEN: z.string().optional(),
  TURNO_API_KEY: z.string().optional(),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
