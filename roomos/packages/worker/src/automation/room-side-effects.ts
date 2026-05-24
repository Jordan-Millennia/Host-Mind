// The "fully automated" loop. After each sync (vault or airbnb) this reconciles
// every room's external side-effects against stored state:
//   • GHL Room Tracker stage   (per room)
//   • TTLock access code        (per active occupancy, if the room has a lock)
//   • Turno cleaning job         (per fresh checkout)
//
// Design rules: idempotent + self-healing (acts only on a real diff), date-gated
// so a first run can't flood TTLock/Turno with historical stays, and totally
// non-throwing — a side-effect failure must never break the sync that called it.

import { prisma } from "@roomos/db"
import type { OccupancyStatus, Platform } from "@roomos/db"
import { log } from "../log"
import { ghlStageForRoom, ghlOpportunityName, normalizeOppName, MOVING_OUT_WINDOW_DAYS, type GhlStageKey } from "./ghl-stages"
import { ghlEnabled, fetchOpportunityIndex, updateOpportunityStage } from "./ghl"
import { ttlockEnabled, lockIdForRoom, createAccessCode, deleteAccessCode, codeWindow, generatePin } from "./ttlock"
import { turnoEnabled, createCleaningJob } from "./turno"

const DAY_MS = 86_400_000
const ACTIVE_STATUSES: OccupancyStatus[] = ["OCCUPIED", "MOVING_IN", "MOVING_OUT", "WAITING_APPROVAL", "NEEDS_FLIP"]

export type SideEffectResult = {
  ghlUpdated: number
  codesCreated: number
  codesDeleted: number
  cleaningJobsCreated: number
  errors: { stage: string; reason: string }[]
}

type Occ = {
  id: string
  status: OccupancyStatus
  moveInDate: Date | null
  leaseEndDate: Date | null
  guestName: string
  platform: Platform
  accessCodeId: string | null
  accessCodeLockId: string | null
  turnoJobId: string | null
}

type RoomRow = {
  id: string
  roomNumber: string | null
  address: string
  ghlStageId: string | null
  ghlOpportunityId: string | null
  occupancies: Occ[]
}

function utcDay(d: Date): number {
  return Date.parse(d.toISOString().slice(0, 10))
}

/** Latest active occupancy (by move-in) wins as the room's "current" tenancy. */
function currentOccupancy(occs: Occ[]): Occ | null {
  const active = occs
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .filter((o) => {
      const end = o.leaseEndDate ? utcDay(o.leaseEndDate) : null
      return end === null || end >= utcDay(new Date())
    })
  active.sort((a, b) => (b.moveInDate?.getTime() ?? 0) - (a.moveInDate?.getTime() ?? 0))
  return active[0] ?? null
}

export async function reconcileRoomSideEffects(orgId: string): Promise<SideEffectResult> {
  const result: SideEffectResult = { ghlUpdated: 0, codesCreated: 0, codesDeleted: 0, cleaningJobsCreated: 0, errors: [] }
  if (!ghlEnabled() && !ttlockEnabled() && !turnoEnabled()) return result

  const todayMid = utcDay(new Date())
  const twoDaysAgo = new Date(todayMid - 2 * DAY_MS)

  const roomsRaw = await prisma.room.findMany({
    where: { orgId },
    select: {
      id: true,
      roomNumber: true,
      ghlStageId: true,
      ghlOpportunityId: true,
      property: { select: { address: true } },
      listings: {
        select: {
          platform: true,
          occupancies: {
            where: {
              OR: [{ leaseEndDate: { gte: twoDaysAgo } }, { leaseEndDate: null }, { accessCodeId: { not: null } }],
            },
            orderBy: { moveInDate: "desc" },
            select: {
              id: true, status: true, moveInDate: true, leaseEndDate: true, accessCodeId: true,
              accessCodeLockId: true, turnoJobId: true, member: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const rooms: RoomRow[] = roomsRaw.map((r) => ({
    id: r.id,
    roomNumber: r.roomNumber,
    address: r.property.address,
    ghlStageId: r.ghlStageId,
    ghlOpportunityId: r.ghlOpportunityId,
    occupancies: r.listings.flatMap((l) =>
      l.occupancies.map((o) => ({
        id: o.id,
        status: o.status,
        moveInDate: o.moveInDate,
        leaseEndDate: o.leaseEndDate,
        guestName: o.member?.name ?? "Guest",
        platform: l.platform,
        accessCodeId: o.accessCodeId,
        accessCodeLockId: o.accessCodeLockId,
        turnoJobId: o.turnoJobId,
      })),
    ),
  }))

  // Load the GHL opportunity index once for the whole pass.
  const oppIndex = ghlEnabled() ? await fetchOpportunityIndex() : null

  for (const room of rooms) {
    const current = currentOccupancy(room.occupancies)

    // ---- GHL stage ----
    if (oppIndex) {
      try {
        const endMid = current?.leaseEndDate ? utcDay(current.leaseEndDate) : null
        const endingSoon = endMid !== null && endMid - todayMid >= 0 && endMid - todayMid <= MOVING_OUT_WINDOW_DAYS * DAY_MS
        const stage: GhlStageKey = ghlStageForRoom({
          platform: current?.platform ?? null,
          status: current?.status ?? null,
          endingSoon,
        })
        const opp = oppIndex.get(normalizeOppName(ghlOpportunityName(room.address, room.roomNumber)))
        if (opp && room.ghlStageId !== stage) {
          // ghlStageId stores the semantic stage KEY (not the GHL uuid) for cheap diffing.
          const ok = await updateOpportunityStage(opp.id, stage)
          if (ok) {
            await prisma.room.update({
              where: { id: room.id },
              data: { ghlStageId: stage, ghlOpportunityId: opp.id, ghlSyncedAt: new Date() },
            })
            result.ghlUpdated++
          }
        }
      } catch (err) {
        result.errors.push({ stage: `ghl:${room.id}`, reason: String((err as Error).message) })
      }
    }

    // ---- TTLock codes ----
    if (ttlockEnabled()) {
      const lockId = lockIdForRoom(room.address, room.roomNumber)
      // Create: current active stay, lock mapped, no code yet.
      if (lockId && current && !current.accessCodeId && current.moveInDate && current.leaseEndDate) {
        try {
          const { startMs, endMs } = codeWindow(current.moveInDate, current.leaseEndDate)
          const pin = generatePin()
          const code = await createAccessCode({
            lockId,
            name: `${ghlOpportunityName(room.address, room.roomNumber)} — ${current.guestName}`.slice(0, 32),
            pin,
            startMs,
            endMs,
          })
          if (code) {
            await prisma.occupancy.update({
              where: { id: current.id },
              data: { accessCode: code.keyboardPwd, accessCodeId: code.keyboardPwdId, accessCodeLockId: lockId, accessCodeSyncedAt: new Date() },
            })
            result.codesCreated++
          }
        } catch (err) {
          result.errors.push({ stage: `ttlock-create:${room.id}`, reason: String((err as Error).message) })
        }
      }
      // Delete: any loaded occupancy that has a code but is no longer the active stay (ended/replaced).
      for (const o of room.occupancies) {
        const isEnded = o.leaseEndDate ? utcDay(o.leaseEndDate) < todayMid : false
        const replaced = current?.id !== o.id
        if (o.accessCodeId && o.accessCodeLockId && (isEnded || (replaced && !ACTIVE_STATUSES.includes(o.status)))) {
          try {
            const ok = await deleteAccessCode({ lockId: o.accessCodeLockId, keyboardPwdId: o.accessCodeId })
            if (ok) {
              await prisma.occupancy.update({
                where: { id: o.id },
                data: { accessCode: null, accessCodeId: null, accessCodeLockId: null, accessCodeSyncedAt: new Date() },
              })
              result.codesDeleted++
            }
          } catch (err) {
            result.errors.push({ stage: `ttlock-delete:${o.id}`, reason: String((err as Error).message) })
          }
        }
      }
    }

    // ---- Turno cleaning jobs (fresh checkouts only: ended within the last 2 days, no job yet) ----
    if (turnoEnabled()) {
      for (const o of room.occupancies) {
        if (o.turnoJobId || !o.leaseEndDate) continue
        const endMid = utcDay(o.leaseEndDate)
        const freshCheckout = todayMid - endMid >= 0 && todayMid - endMid <= 2 * DAY_MS
        if (!freshCheckout) continue
        try {
          const scheduledDate = new Date(endMid + DAY_MS).toISOString().slice(0, 10) // day after checkout
          const jobId = await createCleaningJob({
            propertyAddress: room.address,
            scheduledDate,
            notes: `${ghlOpportunityName(room.address, room.roomNumber)} turnover — ${o.platform} checkout ${o.leaseEndDate.toISOString().slice(0, 10)}`,
          })
          if (jobId) {
            await prisma.occupancy.update({ where: { id: o.id }, data: { turnoJobId: jobId, turnoJobCreatedAt: new Date() } })
            result.cleaningJobsCreated++
          }
        } catch (err) {
          result.errors.push({ stage: `turno:${o.id}`, reason: String((err as Error).message) })
        }
      }
    }
  }

  log.info({ orgId, ...result, errorCount: result.errors.length }, "room side-effects reconciled")
  return result
}
