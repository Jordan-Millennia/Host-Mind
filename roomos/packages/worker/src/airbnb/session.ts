// Airbnb session (Playwright storage_state) reader/writer.
//
// Cookie-jar encryption decision (Phase 2B, Task 4): we DO NOT add `keytar`.
// Phase 1B already protects the PadSplit jar by deriving a 32-byte AES-256 key
// from the macOS Keychain via the `security` CLI (see ../keychain.ts) and
// encrypting the payload with AES-256-GCM (see ../cookies.ts) — no native npm
// module required. We mirror that exact approach here so the Airbnb jar at
// `~/Library/Application Support/RoomOS/.auth/airbnb.json` is encrypted the same
// way PadSplit's is, rather than the plaintext-file fallback the plan offered.
//
// Because the on-disk jar is an encrypted envelope (not raw Playwright JSON), it
// cannot be handed to Playwright as a `storageState` file path; like Phase 1B we
// decrypt it into an object and pass `{ cookies, origins }` to `newContext`.

import { resolve } from "node:path"
import { homedir } from "node:os"
import { hasCookies, loadCookies, saveCookies } from "../cookies"

/** Platform key used by the shared cookie-jar helpers (→ `.auth/airbnb.json`). */
const PLATFORM = "airbnb"

const AUTH_DIR = resolve(homedir(), "Library", "Application Support", "RoomOS", ".auth")
const STORAGE_PATH = resolve(AUTH_DIR, `${PLATFORM}.json`)

/** Playwright `storageState` shape persisted in the (encrypted) jar. */
export type AirbnbStorageState = {
  cookies: Array<{ name: string; value: string; domain: string; [k: string]: unknown }>
  origins: unknown[]
}

/**
 * Absolute path of the encrypted Airbnb cookie jar. Note: the file is an
 * AES-256-GCM envelope, so it is read/written through {@link loadAirbnbStorageState}
 * / {@link saveAirbnbStorageState}, not loaded by Playwright as a path directly.
 */
export function airbnbStorageStatePath(): string {
  return STORAGE_PATH
}

/** True iff a saved Airbnb storage state exists on disk. */
export function airbnbSessionExists(): Promise<boolean> {
  return hasCookies(PLATFORM)
}

/** Reads + decrypts the storage state. Throws if no jar has been saved yet. */
export async function loadAirbnbStorageState(): Promise<AirbnbStorageState> {
  const state = await loadCookies(PLATFORM)
  if (!state) {
    throw new Error(
      `Airbnb session not found at ${STORAGE_PATH}. Run 'roomos-worker login --platform airbnb' first.`,
    )
  }
  return state as AirbnbStorageState
}

/** Encrypts + writes (overwrites) the storage state. File is keyed via the macOS Keychain and mode 0600. */
export async function saveAirbnbStorageState(state: AirbnbStorageState): Promise<void> {
  await saveCookies(PLATFORM, state)
}
