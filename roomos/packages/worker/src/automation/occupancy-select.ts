// Pure occupancy-selection helpers — no env, no DB — so the "which stay is current"
// logic stays unit-testable in isolation (room-side-effects.ts imports these).

import type { OccupancyStatus, Platform } from "@roomos/db"

export const ACTIVE_STATUSES: OccupancyStatus[] = ["OCCUPIED", "MOVING_IN", "MOVING_OUT", "WAITING_APPROVAL", "NEEDS_FLIP"]

export type Occ = {
  id: string
  status: OccupancyStatus
  moveInDate: Date | null
  leaseEndDate: Date | null
  createdAt: Date
  guestName: string
  platform: Platform
  accessCodeId: string | null
  accessCodeLockId: string | null
  turnoJobId: string | null
}

/** Midnight-UTC epoch for a date — tz-stable day comparisons. */
export function utcDay(d: Date): number {
  return Date.parse(d.toISOString().slice(0, 10))
}

/**
 * The room's current tenancy: the latest active stay that hasn't ended. Recency
 * falls back to createdAt when moveInDate is unset, so a freshly-scraped stay with
 * no move-in date yet isn't sorted to epoch 0 (which would mis-target the door code
 * and GHL stage at an older stay).
 */
export function currentOccupancy(occs: Occ[]): Occ | null {
  const today = utcDay(new Date())
  const active = occs
    .filter((o) => ACTIVE_STATUSES.includes(o.status))
    .filter((o) => {
      const end = o.leaseEndDate ? utcDay(o.leaseEndDate) : null
      return end === null || end >= today
    })
  const recency = (o: Occ) => o.moveInDate?.getTime() ?? o.createdAt.getTime()
  active.sort((a, b) => recency(b) - recency(a))
  return active[0] ?? null
}
