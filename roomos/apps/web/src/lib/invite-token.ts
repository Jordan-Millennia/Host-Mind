import { randomBytes } from "node:crypto"

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex")
}

export function isExpired(d: Date): boolean {
  return d.getTime() < Date.now()
}

/** Default TTL for invitations: 14 days. */
export function defaultExpiry(): Date {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
}
