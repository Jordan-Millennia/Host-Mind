// Turno cleaning-job client. Fires when a room turns over (stay ended) to create
// a cleaning project; the completion side (room → VACANT) is driven by Turno's
// webhook (see apps/web/.../api/webhooks/turno). Defensive — never throws.
//
// NOTE: Turno's exact endpoint paths must be confirmed against their current API
// when the key is provisioned (see DEPLOYMENT-2C §Turno). Auth + shape below
// follow the documented Bearer pattern; paths are isolated as constants so a fix
// is one-line.

import { env } from "../env"
import { log } from "../log"

const TURNO_API_BASE = "https://api.turno.com/api/v1"
const PROPERTIES_PATH = "/properties"
const CREATE_JOB_PATH = "/projects" // cleaning jobs are "projects" in Turno's API

export function turnoEnabled(): boolean {
  return Boolean(env.TURNO_API_KEY)
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.TURNO_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

let propertyCache: { at: number; list: Array<{ id: string; address: string }> } | null = null
const PROP_TTL_MS = 30 * 60_000

async function turnoFetch(path: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${TURNO_API_BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } })
  } catch (err) {
    log.warn({ err: (err as Error).message, path }, "turno: request failed — continuing")
    return null
  }
}

/** Match a RoomOS property to a Turno property by address substring. Cached 30 min. null = no match. */
export async function findTurnoProperty(propertyAddress: string): Promise<{ id: string; address: string } | null> {
  if (!propertyCache || Date.now() - propertyCache.at > PROP_TTL_MS) {
    const res = await turnoFetch(PROPERTIES_PATH, { method: "GET" })
    if (!res || !res.ok) {
      if (res) log.warn({ status: res.status }, "turno: property list non-OK")
      return null
    }
    const body = (await res.json().catch(() => null)) as { properties?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> | null
    const arr = Array.isArray(body) ? body : (body?.properties ?? [])
    propertyCache = {
      at: Date.now(),
      list: arr.map((p) => ({ id: String(p.id), address: String(p.address ?? p.name ?? "") })),
    }
  }
  const street = (propertyAddress.split(",")[0] ?? propertyAddress).trim().toLowerCase()
  if (!street) return null
  return propertyCache.list.find((p) => p.address.toLowerCase().includes(street)) ?? null
}

/** Create a cleaning job. Returns the job id, or null on failure. */
export async function createCleaningJob(input: {
  propertyAddress: string
  scheduledDate: string // ISO date "YYYY-MM-DD"
  notes: string
}): Promise<string | null> {
  const property = await findTurnoProperty(input.propertyAddress)
  if (!property) {
    log.warn({ address: input.propertyAddress }, "turno: no matching property — skipping cleaning job")
    return null
  }
  const res = await turnoFetch(CREATE_JOB_PATH, {
    method: "POST",
    body: JSON.stringify({ property_id: property.id, scheduled_date: input.scheduledDate, notes: input.notes }),
  })
  if (!res || !res.ok) {
    if (res) log.warn({ status: res.status, address: input.propertyAddress }, "turno: create job non-OK")
    return null
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  const id = body?.id ?? (body?.project as Record<string, unknown> | undefined)?.id
  return id === undefined || id === null ? null : String(id)
}

/** Test seam — drop the cached Turno property list. */
export function __resetTurnoCache(): void {
  propertyCache = null
}
