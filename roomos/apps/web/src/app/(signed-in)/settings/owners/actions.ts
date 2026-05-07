"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { parseOwnerCsv } from "@/lib/csv-parse"

export async function createOwner(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim() || null
  if (!name) return

  await prisma.owner.create({ data: { orgId: ctx.orgId, name, email } })
  revalidatePath("/settings/owners")
}

export async function deleteOwner(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const id = String(formData.get("id") ?? "")
  if (!id) return

  const props = await prisma.property.count({ where: { orgId: ctx.orgId, ownerId: id } })
  if (props > 0) return // client-side disabled button prevents reaching here

  // Org-scoped delete prevents a forged id from deleting another org's owner.
  await prisma.owner.deleteMany({ where: { id, orgId: ctx.orgId } })
  revalidatePath("/settings/owners")
}

export async function assignPropertyOwner(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const propertyId = String(formData.get("propertyId") ?? "")
  const ownerIdRaw = String(formData.get("ownerId") ?? "")
  const ownerId = ownerIdRaw === "" ? null : ownerIdRaw

  await prisma.property.update({
    where: { id: propertyId, orgId: ctx.orgId } as never,
    data: { ownerId },
  })
  revalidatePath("/settings/owners")
  revalidatePath("/all-rooms")
}

export type ImportReport = {
  created: number
  reused: number
  assigned: number
  notFoundAddresses: string[]
  parseErrors: { line: number; message: string }[]
}

export async function importOwnersCsv(formData: FormData): Promise<ImportReport> {
  const ctx = await requireRole("ADMIN")
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { created: 0, reused: 0, assigned: 0, notFoundAddresses: [], parseErrors: [{ line: 0, message: "No file uploaded" }] }
  }
  const text = await file.text()
  const { rows, errors } = parseOwnerCsv(text)

  let created = 0
  let reused = 0
  let assigned = 0
  const notFoundAddresses: string[] = []
  const ownerCache = new Map<string, string>()

  for (const r of rows) {
    const key = `${r.ownerName}|${r.ownerEmail}`
    let ownerId = ownerCache.get(key)
    if (!ownerId) {
      const existing = await prisma.owner.findFirst({
        where: { orgId: ctx.orgId, name: r.ownerName, email: r.ownerEmail },
        select: { id: true },
      })
      if (existing) {
        ownerId = existing.id
        reused++
      } else {
        const newOne = await prisma.owner.create({
          data: { orgId: ctx.orgId, name: r.ownerName, email: r.ownerEmail },
          select: { id: true },
        })
        ownerId = newOne.id
        created++
      }
      ownerCache.set(key, ownerId)
    }

    const property = await prisma.property.findFirst({
      where: { orgId: ctx.orgId, address: r.address },
      select: { id: true },
    })
    if (!property) {
      notFoundAddresses.push(r.address)
      continue
    }
    await prisma.property.update({ where: { id: property.id }, data: { ownerId } })
    assigned++
  }

  revalidatePath("/settings/owners")
  revalidatePath("/all-rooms")
  return { created, reused, assigned, notFoundAddresses, parseErrors: errors }
}
