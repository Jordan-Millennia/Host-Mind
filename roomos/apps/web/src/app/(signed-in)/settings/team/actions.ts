"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { generateInviteToken, defaultExpiry } from "@/lib/invite-token"

/** Form-action: returns void (errors swallowed; UI-side guards prevent bad input). */
export async function setRole(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const teamUserId = String(formData.get("teamUserId") ?? "")
  const role = String(formData.get("role") ?? "")
  if (role !== "ADMIN" && role !== "AGENT") return
  if (!teamUserId) return
  await prisma.teamUser.updateMany({
    where: { id: teamUserId, orgId: ctx.orgId },
    data: { role },
  })
  revalidatePath("/settings/team")
}

/** Client-invoked (useTransition); returns structured result for the UI to render the URL. */
export async function createInvitation(formData: FormData): Promise<
  { ok: true; inviteUrl: string } | { ok: false; error: string }
> {
  const ctx = await requireRole("ADMIN")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "AGENT")
  if (!email) return { ok: false, error: "Email is required" }
  if (role !== "ADMIN" && role !== "AGENT") return { ok: false, error: "Invalid role" }

  const token = generateInviteToken()
  await prisma.teamInvitation.create({
    data: {
      orgId: ctx.orgId,
      token,
      email,
      role: role as "ADMIN" | "AGENT",
      invitedById: ctx.teamUserId,
      expiresAt: defaultExpiry(),
    },
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteUrl = `${base}/sign-up?invite=${token}`
  revalidatePath("/settings/team")
  return { ok: true, inviteUrl }
}

/** Form-action: returns void. */
export async function revokeInvitation(formData: FormData): Promise<void> {
  await requireRole("ADMIN")
  const id = String(formData.get("id") ?? "")
  if (!id) return
  await prisma.teamInvitation.update({ where: { id }, data: { status: "REVOKED" } })
  revalidatePath("/settings/team")
}
