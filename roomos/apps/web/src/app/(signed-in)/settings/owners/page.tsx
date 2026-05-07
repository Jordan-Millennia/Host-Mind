import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { OwnersList } from "@/components/settings/OwnersList"
import { UnmappedProperties } from "@/components/settings/UnmappedProperties"
import { CsvImportForm } from "@/components/settings/CsvImportForm"
import { createOwner } from "./actions"

export default async function OwnersPage() {
  const ctx = await requireRole("ADMIN")
  const [owners, unmapped, allOwners] = await Promise.all([
    prisma.owner.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { properties: true } } },
    }),
    prisma.property.findMany({
      where: { orgId: ctx.orgId, ownerId: null },
      orderBy: { address: "asc" },
      select: { id: true, address: true, city: true },
    }),
    prisma.owner.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Owners ({owners.length})
        </h2>
        <OwnersList owners={owners} />
        <form action={createOwner} className="flex gap-2 mt-3 flex-wrap">
          <input
            name="name"
            placeholder="Owner name"
            required
            className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[180px]"
          />
          <input
            name="email"
            type="email"
            placeholder="Billing email (optional)"
            className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[180px]"
          />
          <button
            type="submit"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-charcoal)] text-[color:var(--color-cream)] hover:bg-[color:var(--color-ink)]"
          >
            Add owner
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Unmapped properties ({unmapped.length})
        </h2>
        <UnmappedProperties properties={unmapped} owners={allOwners} />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Bulk import (CSV)
        </h2>
        <CsvImportForm />
      </section>
    </div>
  )
}
