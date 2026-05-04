import { z } from "zod"

// CLERK_WEBHOOK_SECRET is optional at boot time — only required when the
// webhook handler actually fires. This lets `pnpm dev` boot before the
// user has provisioned a Clerk webhook (the secret is set after).
// `verifyClerkWebhook` checks for it at call time and 500s if missing.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  WORKER_API_KEY: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
