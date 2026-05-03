import { z } from "zod"

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
