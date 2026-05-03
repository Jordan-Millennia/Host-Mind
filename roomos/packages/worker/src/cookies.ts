import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { homedir } from "node:os"
import { getOrCreateEncryptionKey } from "./keychain"

const DEFAULT_DIR = resolve(homedir(), "Library", "Application Support", "RoomOS", ".auth")

type CookiesPayload = {
  cookies: Array<{ name: string; value: string; domain: string; [k: string]: unknown }>
  origins: unknown[]
}

function jarPath(platform: string, dir = DEFAULT_DIR): string {
  return resolve(dir, `${platform}.json`)
}

export async function hasCookies(platform: string, dir = DEFAULT_DIR): Promise<boolean> {
  try {
    await access(jarPath(platform, dir))
    return true
  } catch {
    return false
  }
}

export async function saveCookies(
  platform: string,
  payload: CookiesPayload,
  dir = DEFAULT_DIR,
): Promise<void> {
  const key = await getOrCreateEncryptionKey()
  await mkdir(dir, { recursive: true, mode: 0o700 })

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const envelope = {
    v: 1 as const,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  }
  await writeFile(jarPath(platform, dir), JSON.stringify(envelope), { mode: 0o600 })
}

export async function loadCookies(
  platform: string,
  dir = DEFAULT_DIR,
): Promise<CookiesPayload | null> {
  if (!(await hasCookies(platform, dir))) return null
  const key = await getOrCreateEncryptionKey()
  const raw = JSON.parse(await readFile(jarPath(platform, dir), "utf-8"))
  if (raw.v !== 1) throw new Error(`unknown cookie envelope version: ${raw.v}`)

  const iv = Buffer.from(raw.iv, "base64")
  const tag = Buffer.from(raw.tag, "base64")
  const data = Buffer.from(raw.data, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plaintext.toString("utf-8")) as CookiesPayload
}
