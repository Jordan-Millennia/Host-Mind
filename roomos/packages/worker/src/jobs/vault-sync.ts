import { syncVault } from "../vault/sync"
import { vaultPath } from "../vault/env"
import { getOrg } from "../persist"
import { log } from "../log"

export async function processVaultSync() {
  const org = await getOrg()
  const result = await syncVault({ orgId: org.id, vaultPath: vaultPath() })
  log.info({ result }, "vault-sync: complete")
  return result
}
