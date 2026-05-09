import { createHash } from "node:crypto"
import { prisma } from "@roomos/db"
import type { FlagSeverity } from "@roomos/db"

export type UpsertFlagInput = {
  orgId: string
  propertyId: string
  severity: FlagSeverity
  title: string
  body: string
  rawLine: string
}

export async function upsertFlag(input: UpsertFlagInput): Promise<void> {
  const sourceRef = createHash("sha1").update(input.rawLine).digest("hex").slice(0, 16)
  await prisma.propertyFlag.upsert({
    where: {
      propertyId_source_sourceRef: {
        propertyId: input.propertyId,
        source: "VAULT_SYNC",
        sourceRef,
      },
    },
    create: {
      orgId: input.orgId,
      propertyId: input.propertyId,
      severity: input.severity,
      title: input.title,
      body: input.body,
      source: "VAULT_SYNC",
      sourceRef,
    },
    update: {
      severity: input.severity,
      title: input.title,
      body: input.body,
    },
  })
}
