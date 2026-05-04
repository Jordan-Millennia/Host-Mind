import { prisma } from "@roomos/db"

export type PillState = "green" | "amber" | "red" | "unknown"

export async function getSyncStatus(orgId: string): Promise<{
  state: PillState
  lastSuccessAt: Date | null
  lastHeartbeatAt: Date | null
  message: string
}> {
  const [latestSuccess, heartbeat] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { orgId, status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.workerHeartbeat.findFirst({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    }),
  ])

  const now = Date.now()
  const lastSuccessAt = latestSuccess?.completedAt ?? null
  const lastHeartbeatAt = heartbeat?.lastSeenAt ?? null

  // Worker offline if no heartbeat in 5 min
  if (!lastHeartbeatAt || now - lastHeartbeatAt.getTime() > 5 * 60_000) {
    return {
      state: "red",
      lastSuccessAt,
      lastHeartbeatAt,
      message: lastHeartbeatAt
        ? `Scraper offline since ${lastHeartbeatAt.toISOString()}`
        : "Scraper has never connected",
    }
  }

  if (!lastSuccessAt) return { state: "unknown", lastSuccessAt, lastHeartbeatAt, message: "No syncs yet" }

  const ageMin = (now - lastSuccessAt.getTime()) / 60_000
  if (ageMin < 60) return { state: "green", lastSuccessAt, lastHeartbeatAt, message: `Synced ${Math.round(ageMin)} min ago` }
  if (ageMin < 240) return { state: "amber", lastSuccessAt, lastHeartbeatAt, message: `Synced ${Math.round(ageMin / 60)}h ago` }
  return { state: "red", lastSuccessAt, lastHeartbeatAt, message: "Sync stale (>4h)" }
}
