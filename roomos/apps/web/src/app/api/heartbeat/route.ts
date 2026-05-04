import { NextResponse } from "next/server"
import { prisma } from "@roomos/db"
import { requireWorkerAuth } from "@/lib/worker-auth"

export async function POST(req: Request) {
  let workerId: string
  try {
    const ctx = requireWorkerAuth(req)
    workerId = ctx.workerId
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
  if (!org) return NextResponse.json({ error: "org not seeded" }, { status: 500 })

  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: { orgId: org.id, workerId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
