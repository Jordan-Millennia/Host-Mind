import { describe, it, expect } from "vitest"
import { generateInviteToken, isExpired } from "@/lib/invite-token"

describe("generateInviteToken", () => {
  it("returns a 32-byte (64-hex-char) token by default", () => {
    const tok = generateInviteToken()
    expect(tok).toMatch(/^[0-9a-f]{64}$/)
  })
  it("returns a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken())
  })
})

describe("isExpired", () => {
  it("returns false for future dates", () => {
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })
  it("returns true for past dates", () => {
    expect(isExpired(new Date(Date.now() - 60_000))).toBe(true)
  })
})
