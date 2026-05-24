// TTLock v3 access-code client. Server-side automation uses GATEWAY mode
// (addType/deleteType = 2) since there is no phone near the lock. A room only
// gets codes if it has an entry in config/lock-map.json — otherwise this is a
// silent no-op. Like the GHL client, nothing here throws; failures log + return.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { env } from "../env"
import { log } from "../log"
import { ghlOpportunityName, normalizeOppName } from "./ghl-stages"

// Pure helpers live in access-window.ts so they're testable without env; re-export
// here so existing imports (`from "./ttlock"`) keep working.
export { codeWindow, generatePin } from "./access-window"

const TTLOCK_API_BASE = "https://euapi.ttlock.com"
const ADD_VIA_GATEWAY = 2
const DELETE_VIA_GATEWAY = 2
const KEYBOARD_PWD_TYPE_PERIOD = 3 // 3 = custom/period passcode

export function ttlockEnabled(): boolean {
  return Boolean(env.TTLOCK_CLIENT_ID && env.TTLOCK_ACCESS_TOKEN)
}

// ---- Lock map (address — room → lockId) -------------------------------------

let lockMapCache: Map<string, string> | null = null

function lockMapPath(): string {
  return process.env.LOCK_MAP_PATH ?? resolve(process.cwd(), "config/lock-map.json")
}

/** Load + normalize the lock map once. Missing/!valid file → empty map (no codes anywhere). */
function loadLockMap(): Map<string, string> {
  if (lockMapCache) return lockMapCache
  const map = new Map<string, string>()
  try {
    const raw = readFileSync(lockMapPath(), "utf8")
    const obj = JSON.parse(raw) as Record<string, string>
    for (const [name, lockId] of Object.entries(obj)) {
      if (name && lockId) map.set(normalizeOppName(name), String(lockId))
    }
  } catch {
    log.info({ path: lockMapPath() }, "ttlock: no lock-map.json — access-code automation idle until provided")
  }
  lockMapCache = map
  return map
}

/** lockId for a room, matched on the same "Address — Room N" key GHL uses. null = no lock. */
export function lockIdForRoom(propertyAddress: string, roomNumber: string | null): string | null {
  return loadLockMap().get(normalizeOppName(ghlOpportunityName(propertyAddress, roomNumber))) ?? null
}

// ---- TTLock HTTP (form-encoded) ---------------------------------------------

async function ttlockPost(path: string, params: Record<string, string | number>): Promise<Record<string, unknown> | null> {
  const body = new URLSearchParams({
    clientId: env.TTLOCK_CLIENT_ID ?? "",
    accessToken: env.TTLOCK_ACCESS_TOKEN ?? "",
    date: String(Date.now()),
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  })
  try {
    const res = await fetch(`${TTLOCK_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    // TTLock returns HTTP 200 with an `errcode` field on logical failures.
    if (json && typeof json.errcode === "number" && json.errcode !== 0) {
      log.warn({ path, errcode: json.errcode, errmsg: json.errmsg }, "ttlock: API error")
      return null
    }
    return json
  } catch (err) {
    log.warn({ err: (err as Error).message, path }, "ttlock: request failed — continuing")
    return null
  }
}

export type CreatedCode = { keyboardPwdId: string; keyboardPwd: string }

/** Add a period passcode via gateway. Returns the code + its id, or null on failure. */
export async function createAccessCode(input: {
  lockId: string
  name: string
  pin: string
  startMs: number
  endMs: number
}): Promise<CreatedCode | null> {
  const json = await ttlockPost("/v3/keyboardPwd/add", {
    lockId: input.lockId,
    keyboardPwd: input.pin,
    keyboardPwdName: input.name,
    keyboardPwdType: KEYBOARD_PWD_TYPE_PERIOD,
    startDate: input.startMs,
    endDate: input.endMs,
    addType: ADD_VIA_GATEWAY,
  })
  const id = json?.keyboardPwdId
  if (id === undefined || id === null) return null
  return { keyboardPwdId: String(id), keyboardPwd: input.pin }
}

/** Delete a passcode via gateway. Returns true on success. */
export async function deleteAccessCode(input: { lockId: string; keyboardPwdId: string }): Promise<boolean> {
  const json = await ttlockPost("/v3/keyboardPwd/delete", {
    lockId: input.lockId,
    keyboardPwdId: input.keyboardPwdId,
    deleteType: DELETE_VIA_GATEWAY,
  })
  return json !== null
}

/** Test seam — drop the cached lock map. */
export function __resetLockMap(): void {
  lockMapCache = null
}
