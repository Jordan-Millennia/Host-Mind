import { existsSync } from "node:fs"

export function vaultPath(): string {
  const v = process.env.VAULT_PATH
  if (!v) throw new Error("VAULT_PATH env var not set")
  if (!existsSync(v)) throw new Error(`VAULT_PATH does not exist: ${v}`)
  return v
}
