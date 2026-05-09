import { prisma } from "@roomos/db"

export type UpsertPropertyInput = {
  padsplitPropertyId: string
  address: string
  city?: string | null
  state?: string | null
  market?: string | null
  vaultFilePath: string
}

export async function upsertProperty(orgId: string, input: UpsertPropertyInput): Promise<string> {
  const existing = await prisma.property.findUnique({
    where: { padsplitPropertyId: input.padsplitPropertyId },
  })
  const data = {
    orgId,
    padsplitPropertyId: input.padsplitPropertyId,
    address: input.address,
    city: input.city ?? deriveCity(input.address),
    state: input.state ?? null,
    market: input.market ?? null,
    vaultFilePath: input.vaultFilePath,
  }
  if (existing) {
    await prisma.property.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.property.create({ data })
  return created.id
}

function deriveCity(address: string): string | null {
  // "1311 Morgana Rd, Jacksonville, FL 32205" → "Jacksonville"
  const parts = address.split(",").map((p) => p.trim())
  return parts[1] ?? null
}
