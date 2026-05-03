import { auth as clerkAuth, clerkClient } from "@clerk/nextjs/server"
import { prisma } from "@roomos/db"
import type { Role } from "@roomos/db"

export type Ctx = {
  userId: string         // Clerk user id
  teamUserId: string     // RoomOS team_users.id
  orgId: string
  role: Role
  ownerId: string | null
}

/** Resolve the request's auth context. Returns null when not signed in.
 *  Auto-provisions a team_user row on first access to handle webhook lag. */
export async function resolveContext(): Promise<Ctx | null> {
  const { userId } = await clerkAuth()
  if (!userId) return null

  let teamUser = await prisma.teamUser.findUnique({ where: { clerkUserId: userId } })

  // Lazy-provision: Clerk session exists but webhook hasn't created the row yet
  if (!teamUser) {
    const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
    if (org) {
      let email = ""
      try {
        const client = await clerkClient()
        const clerkUser = await client.users.getUser(userId)
        email = clerkUser.emailAddresses?.[0]?.emailAddress ?? ""
      } catch {
        // non-fatal — email can be backfilled by webhook later
      }
      teamUser = await prisma.teamUser.upsert({
        where: { clerkUserId: userId },
        create: { orgId: org.id, clerkUserId: userId, email, role: "AGENT" },
        update: {},
      })
    }
  }

  if (!teamUser) return null

  return {
    userId,
    teamUserId: teamUser.id,
    orgId: teamUser.orgId,
    role: teamUser.role,
    ownerId: teamUser.ownerId,
  }
}

const ROLE_RANK: Record<Role, number> = {
  AGENT: 1,
  OWNER: 1,   // owner is read-only, scoped — same rank as agent for now
  ADMIN: 10,
}

/** Throw on insufficient role. ADMIN satisfies any required role. */
export async function requireRole(required: Role): Promise<Ctx> {
  const ctx = await resolveContext()
  if (!ctx) throw new Error("unauthorized: not signed in")
  if (ROLE_RANK[ctx.role] < ROLE_RANK[required]) {
    throw new Error(`forbidden: requires role ${required}, got ${ctx.role}`)
  }
  return ctx
}

/** Like requireRole but doesn't escalate; just gate signed-in. */
export async function requireSignedIn(): Promise<Ctx> {
  const ctx = await resolveContext()
  if (!ctx) throw new Error("unauthorized: not signed in")
  return ctx
}
