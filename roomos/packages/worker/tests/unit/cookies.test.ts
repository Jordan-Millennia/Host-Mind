import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const mockGetKey = vi.fn()
vi.mock("../../src/keychain", () => ({
  getOrCreateEncryptionKey: () => mockGetKey(),
}))

import { saveCookies, loadCookies, hasCookies } from "../../src/cookies"

describe("cookie jar", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "roomos-cookies-"))
    // 32-byte (256-bit) deterministic key for the test
    mockGetKey.mockResolvedValue(Buffer.from("0".repeat(64), "hex"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("hasCookies returns false when the file does not exist", async () => {
    expect(await hasCookies("padsplit", tmpDir)).toBe(false)
  })

  it("round-trips a cookies object encrypted at rest", async () => {
    const sample = {
      cookies: [{ name: "session", value: "abc123", domain: ".padsplit.com" }],
      origins: [],
    }
    await saveCookies("padsplit", sample, tmpDir)
    expect(await hasCookies("padsplit", tmpDir)).toBe(true)
    expect(existsSync(resolve(tmpDir, "padsplit.json"))).toBe(true)

    const loaded = await loadCookies("padsplit", tmpDir)
    expect(loaded).toEqual(sample)
  })

  it("encrypts on disk (raw bytes do not contain the cookie value)", async () => {
    await saveCookies("padsplit", { cookies: [{ name: "sess", value: "PLAINTEXT_SECRET", domain: "x" }], origins: [] }, tmpDir)
    const { readFileSync } = await import("node:fs")
    const raw = readFileSync(resolve(tmpDir, "padsplit.json"), "utf-8")
    expect(raw).not.toContain("PLAINTEXT_SECRET")
  })

  it("returns null when load is called before save", async () => {
    expect(await loadCookies("padsplit", tmpDir)).toBeNull()
  })
})
