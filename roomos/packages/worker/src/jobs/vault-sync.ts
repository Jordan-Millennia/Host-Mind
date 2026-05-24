import { syncVault } from "../vault/sync"
import { vaultPath } from "../vault/env"
import { getOrg } from "../persist"
import { log } from "../log"
import { reconcileRoomSideEffects } from "../automation/room-side-effects"

export async function processVaultSync() {
  const org = await getOrg()
  const result = await syncVault({ orgId: org.id, vaultPath: vaultPath() })
  log.info({ result }, "vault-sync: complete")
  // Fire GHL / TTLock / Turno side-effects off the refreshed occupancy state.
  // Never let a side-effect failure fail the sync itself.
  await reconcileRoomSideEffects(org.id).catch((err) =>
    log.warn({ err: (err as Error).message }, "vault-sync: side-effect reconcile failed"),
  )
  return result
}
