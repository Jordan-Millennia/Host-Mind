"use server"

import { prisma } from "@roomos/db"
import { requireRole } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function confirmMapping(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const listingId = String(formData.get("listingId") ?? "")
  const roomId = String(formData.get("roomId") ?? "")
  if (!listingId || !roomId) throw new Error("listingId and roomId required")

  // Verify the target room belongs to this org — never trust a client-supplied id.
  const room = await prisma.room.findFirst({
    where: { id: roomId, orgId: ctx.orgId },
    select: { id: true },
  })
  if (!room) throw new Error("room not found")

  // Org-scoped update: a forged listingId can't remap another org's listing.
  const { count } = await prisma.platformListing.updateMany({
    where: { id: listingId, orgId: ctx.orgId },
    data: { roomId },
  })
  if (count === 0) throw new Error("listing not found")

  await prisma.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorUserId: ctx.teamUserId,
      action: "AIRBNB_MAPPING_CONFIRMED",
      entityType: "PlatformListing",
      entityId: listingId,
      metadataJson: { roomId },
    },
  })
  revalidatePath("/settings/airbnb")
}

export async function dismissListing(formData: FormData): Promise<void> {
  const ctx = await requireRole("ADMIN")
  const listingId = String(formData.get("listingId") ?? "")
  if (!listingId) throw new Error("listingId required")

  // Org-scoped update guards against a forged listingId from another org.
  const { count } = await prisma.platformListing.updateMany({
    where: { id: listingId, orgId: ctx.orgId },
    data: { isActive: false },
  })
  if (count === 0) throw new Error("listing not found")

  await prisma.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorUserId: ctx.teamUserId,
      action: "AIRBNB_LISTING_DISMISSED",
      entityType: "PlatformListing",
      entityId: listingId,
    },
  })
  revalidatePath("/settings/airbnb")
}
