import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "@roomos/db"
import { log } from "../log"
import { parsePropertyFile } from "./parsers/property-file"
import { parseDossier } from "./parsers/dossier"
import { upsertProperty } from "./persist/property"
import { upsertRoomWithListing } from "./persist/room"
import { upsertMember } from "./persist/member"
import { upsertOccupancyForListing } from "./persist/occupancy"
import { upsertFlag } from "./persist/flag"
import type { VaultSyncResult, VaultMemberDossier } from "./types"

export type SyncVaultInput = {
  orgId: string
  vaultPath: string
}

export async function syncVault(input: SyncVaultInput): Promise<VaultSyncResult> {
  const result: VaultSyncResult = {
    propertiesParsed: 0,
    membersDossiersParsed: 0,
    propertiesUpserted: 0,
    roomsUpserted: 0,
    membersUpserted: 0,
    occupanciesUpserted: 0,
    flagsUpserted: 0,
    errors: [],
  }

  const syncRun = await prisma.syncRun.create({
    data: { orgId: input.orgId, kind: "VAULT_SYNC", platform: "PADSPLIT", status: "RUNNING" },
  })

  try {
    const dossiers = loadDossiers(input.vaultPath)
    result.membersDossiersParsed = dossiers.size

    const propertyFiles = readdirSync(input.vaultPath).filter(
      (n) => n.endsWith(".md") && !n.startsWith("_") && !n.startsWith("."),
    )

    for (const fileName of propertyFiles) {
      const filePath = join(input.vaultPath, fileName)
      try {
        const content = readFileSync(filePath, "utf-8")
        const parsed = parsePropertyFile(content, filePath)
        result.propertiesParsed++

        const propertyId = await upsertProperty(input.orgId, {
          padsplitPropertyId: parsed.padsplitPropertyId,
          address: parsed.address,
          city: null,
          state: parsed.state,
          market: parsed.market,
          vaultFilePath: filePath,
        })
        result.propertiesUpserted++

        for (const row of parsed.members) {
          const { roomId, listingId } = await upsertRoomWithListing(
            input.orgId,
            propertyId,
            row.roomNumber,
          )
          result.roomsUpserted++

          const dossier = dossiers.get(row.name) ?? null
          const memberId = await upsertMember(input.orgId, {
            name: row.name,
            dossier: dossier
              ? {
                  memberId: dossier.memberId,
                  email: dossier.email,
                  phone: dossier.phone,
                  dossierPath: dossier.filePath,
                  weeklyRate: dossier.weeklyRate,
                }
              : null,
            padsplitPropertyId: parsed.padsplitPropertyId,
            roomNumber: row.roomNumber,
          })
          result.membersUpserted++

          await upsertOccupancyForListing({
            orgId: input.orgId,
            listingId,
            memberId,
            statusText: row.status,
            balanceText: row.balanceText,
          })
          result.occupanciesUpserted++

          // ignore roomId in this phase; reserved for future room-level flagging
          void roomId
        }

        for (const flag of parsed.flagsAndAlerts) {
          await upsertFlag({
            orgId: input.orgId,
            propertyId,
            severity: flag.severity,
            title: flag.title,
            body: flag.body,
            rawLine: flag.rawLine,
          })
          result.flagsUpserted++
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        log.warn({ filePath, reason }, "vault sync: skipped file")
        result.errors.push({ file: fileName, reason })
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        completedAt: new Date(),
        status: result.errors.length > 0 ? "PARTIAL" : "SUCCESS",
        itemsSynced: result.propertiesUpserted,
        errorsJson: result.errors.length > 0 ? result.errors : undefined,
      },
    })
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        completedAt: new Date(),
        status: "FAILED",
        errorsJson: { fatal: String(err) },
      },
    })
    throw err
  }

  return result
}

function loadDossiers(vaultPath: string): Map<string, VaultMemberDossier> {
  const dossiersDir = join(vaultPath, "members")
  let entries: string[]
  try {
    entries = readdirSync(dossiersDir).filter((n) => n.endsWith(".md"))
  } catch {
    return new Map()
  }
  const map = new Map<string, VaultMemberDossier>()
  for (const fileName of entries) {
    const filePath = join(dossiersDir, fileName)
    try {
      const content = readFileSync(filePath, "utf-8")
      const dossier = parseDossier(content, filePath)
      if (dossier.name) map.set(dossier.name, dossier)
    } catch (err) {
      log.warn({ fileName }, "vault sync: skipped dossier")
    }
  }
  return map
}
