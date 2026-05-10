import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { TeamList } from "@/components/settings/TeamList"
import { InviteForm } from "@/components/settings/InviteForm"

export default async function TeamPage() {
  const ctx = await requireRole("ADMIN")

  const [users, pendingInvites] = await Promise.all([
    prisma.teamUser.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true, clerkUserId: true },
    }),
    prisma.teamInvitation.findMany({
      where: { orgId: ctx.orgId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] mb-3">
          Team ({users.length})
        </h2>
        <TeamList users={users} currentUserId={ctx.teamUserId} />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] mb-3">
          Invite a team member
        </h2>
        <InviteForm pending={pendingInvites} />
      </section>
    </div>
  )
}
