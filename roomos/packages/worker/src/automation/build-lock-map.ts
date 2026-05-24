// Safely build config/lock-map.json by joining the clean RoomOS room inventory
// against a TTLock lock export. Only CONFIDENT matches land in lock-map.json;
// everything else (lower confidence, common-area locks, unmatched) goes to
// lock-map-review.json for a human to confirm before it controls a door.
//
// Usage (after RoomOS is deployed + the room inventory is populated):
//   1. Export locks via the TTLock MCP (ttlock_list_locks, response_format=json) → locks.json
//   2. roomos-worker build-lock-map --locks ./locks.json
//   3. Review lock-map-review.json, move confirmed entries into lock-map.json.

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { prisma } from "@roomos/db"
import { getOrg } from "../persist"
import { log } from "../log"
import { ghlOpportunityName } from "./ghl-stages"
import { bestRoomMatch, parseLockAlias, CONFIDENT_THRESHOLD, REVIEW_THRESHOLD, type RoomLite } from "./lock-map-match"

type LockExport = { lockId: number | string; lockAlias: string; accountName?: string }

export type BuildLockMapSummary = {
  confident: number
  needsReview: number
  commonOrUnmatched: number
  roomsWithoutLock: number
}

export async function buildLockMap(
  locksPath: string,
  outDir = resolve(process.cwd(), "config"),
): Promise<BuildLockMapSummary> {
  const org = await getOrg()
  const roomsRaw = await prisma.room.findMany({
    where: { orgId: org.id },
    select: { id: true, roomNumber: true, property: { select: { address: true } } },
  })
  const rooms: RoomLite[] = roomsRaw.map((r) => ({ id: r.id, roomNumber: r.roomNumber, address: r.property.address }))
  const keyForRoom = new Map(roomsRaw.map((r) => [r.id, ghlOpportunityName(r.property.address, r.roomNumber)]))

  const parsed = JSON.parse(readFileSync(locksPath, "utf8")) as LockExport[] | { locks: LockExport[] }
  const lockList = Array.isArray(parsed) ? parsed : parsed.locks

  const lockMap: Record<string, string> = {} // "Address — Room N" -> lockId (confident only)
  const review: Array<{ alias: string; lockId: string; account?: string; suggestedRoom: string | null; score: number; reason: string }> = []
  const matchedRoomIds = new Set<string>()

  for (const lock of lockList) {
    const p = parseLockAlias(lock.lockAlias)
    if (p.isCommon || !p.roomNumber) {
      review.push({ alias: lock.lockAlias, lockId: String(lock.lockId), account: lock.accountName, suggestedRoom: null, score: 0, reason: "common-area or no room number" })
      continue
    }
    const m = bestRoomMatch(lock.lockAlias, rooms)
    if (m && m.score >= CONFIDENT_THRESHOLD) {
      lockMap[keyForRoom.get(m.roomId)!] = String(lock.lockId)
      matchedRoomIds.add(m.roomId)
    } else {
      review.push({
        alias: lock.lockAlias,
        lockId: String(lock.lockId),
        account: lock.accountName,
        suggestedRoom: m ? keyForRoom.get(m.roomId) ?? null : null,
        score: m ? Number(m.score.toFixed(2)) : 0,
        reason: m && m.score >= REVIEW_THRESHOLD ? "low confidence — confirm" : "no confident room match",
      })
    }
  }

  const roomsWithoutLock = rooms.filter((r) => !matchedRoomIds.has(r.id)).length
  writeFileSync(resolve(outDir, "lock-map.json"), JSON.stringify(lockMap, null, 2) + "\n")
  writeFileSync(resolve(outDir, "lock-map-review.json"), JSON.stringify(review, null, 2) + "\n")

  const summary: BuildLockMapSummary = {
    confident: Object.keys(lockMap).length,
    needsReview: review.filter((r) => r.score >= REVIEW_THRESHOLD).length,
    commonOrUnmatched: review.filter((r) => r.score < REVIEW_THRESHOLD).length,
    roomsWithoutLock,
  }
  log.info(
    { ...summary, outDir },
    "build-lock-map: wrote lock-map.json (confident) + lock-map-review.json (confirm before relying on these)",
  )
  return summary
}
