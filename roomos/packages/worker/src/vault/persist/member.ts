import { prisma } from "@roomos/db"

export type UpsertMemberInput = {
  name: string
  dossier: {
    memberId: string | null
    email: string | null
    phone: string | null
    dossierPath: string | null
    weeklyRate: number | null
  } | null
  padsplitPropertyId: string
  roomNumber: string
}

export async function upsertMember(orgId: string, input: UpsertMemberInput): Promise<string> {
  const externalMemberId =
    input.dossier?.memberId ??
    `vault:${input.padsplitPropertyId}-${input.roomNumber}-${slug(input.name)}`

  const existing = await prisma.member.findUnique({
    where: { platform_externalMemberId: { platform: "PADSPLIT", externalMemberId } },
  })

  const data = {
    orgId,
    platform: "PADSPLIT" as const,
    externalMemberId,
    name: input.name,
    email: input.dossier?.email ?? null,
    phone: input.dossier?.phone ?? null,
    memberDossierPath: input.dossier?.dossierPath ?? null,
  }

  if (existing) {
    await prisma.member.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.member.create({ data })
  return created.id
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
