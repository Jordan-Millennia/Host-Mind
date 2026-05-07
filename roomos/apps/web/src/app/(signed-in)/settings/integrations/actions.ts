"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { enqueueInteractiveLogin, enqueueDiscovery } from "@/lib/worker-jobs"
import { prisma } from "@roomos/db"

export async function connectPadsplit(): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await requireRole("ADMIN")
  } catch {
    return { ok: false, error: "forbidden" }
  }

  const recent = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  })
  const alive = recent && Date.now() - recent.lastSeenAt.getTime() < 5 * 60_000
  if (!alive) {
    return { ok: false, error: "Worker offline. Start the Mac Studio worker first (see DEPLOYMENT-1B.md)." }
  }

  try {
    const { jobId } = await enqueueInteractiveLogin()
    revalidatePath("/settings/integrations")
    return { ok: true, jobId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function runDiscoveryNow(): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await requireRole("ADMIN")
  } catch {
    return { ok: false, error: "forbidden" }
  }
  try {
    const { jobId } = await enqueueDiscovery()
    revalidatePath("/rooms")
    return { ok: true, jobId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
