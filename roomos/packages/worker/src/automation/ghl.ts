// GoHighLevel (LeadConnector v2) Room Tracker client.
//
// GHL is a NOTIFICATION DESTINATION, never a source of truth — the Postgres DB
// is authoritative. Every function here is defensive: a GHL outage must never
// block or fail a sync, so nothing throws; failures log and return null/empty.

import { env } from "../env"
import { log } from "../log"
import { GHL_API_BASE, GHL_PIPELINE_ID, GHL_STAGE_IDS, normalizeOppName, type GhlStageKey } from "./ghl-stages"

const GHL_VERSION = "2021-07-28"
const CACHE_TTL_MS = 5 * 60_000

export type GhlOpportunity = { id: string; name: string; stageId: string | null }

let indexCache: { at: number; byName: Map<string, GhlOpportunity> } | null = null

export function ghlEnabled(): boolean {
  return Boolean(env.GHL_API_KEY && env.GHL_LOCATION_ID)
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GHL_API_KEY}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

async function ghlFetch(path: string, init: RequestInit, attempt = 0): Promise<Response | null> {
  try {
    const res = await fetch(`${GHL_API_BASE}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } })
    if (res.status === 429 && attempt < 1) {
      await new Promise((r) => setTimeout(r, 2000))
      return ghlFetch(path, init, attempt + 1)
    }
    return res
  } catch (err) {
    log.warn({ err: (err as Error).message, path }, "ghl: request failed (network) — continuing")
    return null
  }
}

/**
 * Load every Room Tracker opportunity into a normalized-name → opportunity map.
 * Cached 5 min so a 300-room reconcile pages the pipeline at most once per window.
 */
export async function fetchOpportunityIndex(force = false): Promise<Map<string, GhlOpportunity>> {
  if (!force && indexCache && Date.now() - indexCache.at < CACHE_TTL_MS) return indexCache.byName

  const byName = new Map<string, GhlOpportunity>()
  let page = 1
  // Hard page cap guards against an unexpected pagination loop.
  for (; page <= 50; page++) {
    const q = new URLSearchParams({
      location_id: env.GHL_LOCATION_ID ?? "",
      pipeline_id: GHL_PIPELINE_ID,
      limit: "100",
      page: String(page),
    })
    const res = await ghlFetch(`/opportunities/search/?${q.toString()}`, { method: "GET" })
    if (!res || !res.ok) {
      if (res) log.warn({ status: res.status, page }, "ghl: opportunity search non-OK — using partial index")
      break
    }
    const body = (await res.json().catch(() => null)) as { opportunities?: Array<Record<string, unknown>> } | null
    const opps = body?.opportunities ?? []
    for (const o of opps) {
      const name = String(o.name ?? "")
      if (!name) continue
      byName.set(normalizeOppName(name), {
        id: String(o.id),
        name,
        stageId: (o.pipelineStageId as string | undefined) ?? null,
      })
    }
    if (opps.length < 100) break
  }

  indexCache = { at: Date.now(), byName }
  return byName
}

/** PUT a new stage on an opportunity. Returns true on success. Never throws. */
export async function updateOpportunityStage(opportunityId: string, stageKey: GhlStageKey): Promise<boolean> {
  const res = await ghlFetch(`/opportunities/${opportunityId}`, {
    method: "PUT",
    body: JSON.stringify({ pipelineId: GHL_PIPELINE_ID, pipelineStageId: GHL_STAGE_IDS[stageKey] }),
  })
  if (!res || !res.ok) {
    if (res) log.warn({ status: res.status, opportunityId, stageKey }, "ghl: stage update non-OK")
    return false
  }
  // Keep the in-memory cache coherent so a later room in the same pass sees the new stage.
  if (indexCache) {
    for (const [, opp] of indexCache.byName) {
      if (opp.id === opportunityId) opp.stageId = GHL_STAGE_IDS[stageKey]
    }
  }
  return true
}

/** Test seam — drop the cached opportunity index. */
export function __resetGhlCache(): void {
  indexCache = null
}
