import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const SERVICE = "com.cohostmgmt.roomos"
const ACCOUNT = "cookie-jar-key"

/** Returns the 32-byte AES-256 key. Creates a new one on first call. */
export async function getOrCreateEncryptionKey(): Promise<Buffer> {
  try {
    const hex = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim()
    return Buffer.from(hex, "hex")
  } catch {
    // Not found — generate and store
    const key = randomBytes(32)
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-s", SERVICE,
        "-a", ACCOUNT,
        "-w", key.toString("hex"),
        "-U", // update if exists
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    )
    return key
  }
}
