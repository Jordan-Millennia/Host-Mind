import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.fn()
const mockOrgFindFirst = vi.fn()
const mockTeamUserFindUnique = vi.fn()

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

vi.mock("@roomos/db", () => ({
  prisma: {
    org: { findFirst: (...a: unknown[]) => mockOrgFindFirst(...a) },
    teamUser: { findUnique: (...a: unknown[]) => mockTeamUserFindUnique(...a) },
  },
}))

import { resolveContext, requireRole } from "@/lib/auth"

describe("resolveContext", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockOrgFindFirst.mockResolvedValue({ id: "org_x" })
    mockTeamUserFindUnique.mockReset()
  })

  it("returns null when user is not signed in", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const ctx = await resolveContext()
    expect(ctx).toBeNull()
  })

  it("returns null when team_user is missing (webhook lag)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_lag" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    const ctx = await resolveContext()
    expect(ctx).toBeNull()
  })

  it("returns the resolved context for a signed-in agent", async () => {
    mockAuth.mockResolvedValue({ userId: "user_alice" })
    mockTeamUserFindUnique.mockResolvedValue({
      id: "tu_alice",
      orgId: "org_x",
      clerkUserId: "user_alice",
      email: "alice@cohostmgmt.net",
      role: "AGENT",
      ownerId: null,
    })
    const ctx = await resolveContext()
    expect(ctx).toEqual({
      userId: "user_alice",
      teamUserId: "tu_alice",
      orgId: "org_x",
      role: "AGENT",
      ownerId: null,
    })
  })
})

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_alice" })
    mockOrgFindFirst.mockResolvedValue({ id: "org_x" })
  })

  it("permits an admin when admin is required", async () => {
    mockTeamUserFindUnique.mockResolvedValue({
      id: "tu", orgId: "org_x", role: "ADMIN", clerkUserId: "user_alice", email: "a@b.c", ownerId: null,
    })
    const ctx = await requireRole("ADMIN")
    expect(ctx.role).toBe("ADMIN")
  })

  it("permits an admin when agent is required", async () => {
    mockTeamUserFindUnique.mockResolvedValue({
      id: "tu", orgId: "org_x", role: "ADMIN", clerkUserId: "user_alice", email: "a@b.c", ownerId: null,
    })
    const ctx = await requireRole("AGENT")
    expect(ctx.role).toBe("ADMIN")
  })

  it("rejects an agent when admin is required", async () => {
    mockTeamUserFindUnique.mockResolvedValue({
      id: "tu", orgId: "org_x", role: "AGENT", clerkUserId: "user_alice", email: "a@b.c", ownerId: null,
    })
    await expect(requireRole("ADMIN")).rejects.toThrow(/forbidden/i)
  })

  it("rejects when not signed in", async () => {
    mockAuth.mockResolvedValueOnce({ userId: null })
    await expect(requireRole("AGENT")).rejects.toThrow(/unauthorized/i)
  })
})
