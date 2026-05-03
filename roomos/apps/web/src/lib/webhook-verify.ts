import { Webhook } from "svix"
import { prisma } from "@roomos/db"
import type { WebhookEvent } from "@clerk/nextjs/server"
import { env } from "./env"

/**
 * Verify a Clerk webhook signature against `CLERK_WEBHOOK_SECRET`.
 * Returns the parsed event; throws on signature failure.
 */
export function verifyClerkWebhook(headers: Headers, rawBody: string): WebhookEvent {
  const svixId = headers.get("svix-id")
  const svixTimestamp = headers.get("svix-timestamp")
  const svixSignature = headers.get("svix-signature")

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing svix headers")
  }

  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET)
  return wh.verify(rawBody, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  }) as WebhookEvent
}

/**
 * Apply a Clerk webhook event to the team_users table.
 * Pure-ish: no signature verification (caller's responsibility), no HTTP.
 */
export async function handleClerkWebhook(evt: WebhookEvent): Promise<{ ok: true }> {
  const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
  if (!org) throw new Error("CoHost Management org not seeded — run pnpm db:seed")

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const user = evt.data
      const email = user.email_addresses?.[0]?.email_address ?? ""
      await prisma.teamUser.upsert({
        where: { clerkUserId: user.id },
        create: {
          orgId: org.id,
          clerkUserId: user.id,
          email,
          role: "AGENT",
        },
        update: { email },
      })
      return { ok: true }
    }
    case "user.deleted": {
      const user = evt.data
      if (user.id) {
        await prisma.teamUser.deleteMany({ where: { clerkUserId: user.id } })
      }
      return { ok: true }
    }
    default:
      return { ok: true }
  }
}
