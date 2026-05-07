import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.fn()
const mockGetUser = vi.fn()
const mockOrgFindFirst = vi.fn()
const mockTeamUserFindUnique = vi.fn()
const mockTeamUserUpsert = vi.fn()
const mockInvitationFindFirst = vi.fn()
const mockInvitationUpdate = vi.fn()

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  clerkClient: async () => ({ users: { getUser: (...a: unknown[]) => mockGetUser(...a) } }),
}))

vi.mock("@roomos/db", () => ({
  prisma: {
    org: { findFirst: (...a: unknown[]) => mockOrgFindFirst(...a) },
    teamUser: {
      findUnique: (...a: unknown[]) => mockTeamUserFindUnique(...a),
      upsert: (...a: unknown[]) => mockTeamUserUpsert(...a),
    },
    teamInvitation: {
      findFirst: (...a: unknown[]) => mockInvitationFindFirst(...a),
      update: (...a: unknown[]) => mockInvitationUpdate(...a),
    },
  },
}))

import { resolveContext, requireRole } from "@/lib/auth"

describe("resolveContext", () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockGetUser.mockReset()
    mockOrgFindFirst.mockResolvedValue({ id: "org_x" })
    mockTeamUserFindUnique.mockReset()
    mockTeamUserUpsert.mockReset()
    mockInvitationFindFirst.mockResolvedValue(null)
    mockInvitationUpdate.mockResolvedValue({})
  })

  it("returns null when user is not signed in", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const ctx = await resolveContext()
    expect(ctx).toBeNull()
  })

  it("lazy-provisions a team_user on first sign-in (webhook lag)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_lag" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    mockGetUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "lag@cohostmgmt.net" }],
    })
    mockTeamUserUpsert.mockResolvedValue({
      id: "tu_lag",
      orgId: "org_x",
      clerkUserId: "user_lag",
      email: "lag@cohostmgmt.net",
      role: "AGENT",
      ownerId: null,
    })

    const ctx = await resolveContext()

    expect(mockTeamUserUpsert).toHaveBeenCalledWith({
      where: { clerkUserId: "user_lag" },
      create: { orgId: "org_x", clerkUserId: "user_lag", email: "lag@cohostmgmt.net", role: "AGENT" },
      update: {},
    })
    expect(ctx).toEqual({
      userId: "user_lag",
      teamUserId: "tu_lag",
      orgId: "org_x",
      role: "AGENT",
      ownerId: null,
    })
  })

  it("falls back to empty email when Clerk lookup throws (still provisions)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_no_email" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    mockGetUser.mockRejectedValue(new Error("clerk timeout"))
    mockTeamUserUpsert.mockResolvedValue({
      id: "tu_x", orgId: "org_x", clerkUserId: "user_no_email",
      email: "", role: "AGENT", ownerId: null,
    })

    const ctx = await resolveContext()

    expect(mockTeamUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: "" }),
      }),
    )
    expect(ctx?.userId).toBe("user_no_email")
  })

  it("returns null when org is not seeded (deployment misconfig)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_no_org" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    mockOrgFindFirst.mockResolvedValueOnce(null)

    const ctx = await resolveContext()
    expect(ctx).toBeNull()
    expect(mockTeamUserUpsert).not.toHaveBeenCalled()
  })

  it("applies invitation role + marks invitation accepted on lazy-provision", async () => {
    mockAuth.mockResolvedValue({ userId: "user_invited" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    mockGetUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "new@cohostmgmt.net" }],
    })
    mockInvitationFindFirst.mockResolvedValue({
      id: "inv_1",
      orgId: "org_x",
      email: "new@cohostmgmt.net",
      role: "ADMIN",
      status: "PENDING",
    })
    mockTeamUserUpsert.mockResolvedValue({
      id: "tu_x",
      orgId: "org_x",
      clerkUserId: "user_invited",
      email: "new@cohostmgmt.net",
      role: "ADMIN",
      ownerId: null,
    })

    const ctx = await resolveContext()

    expect(mockTeamUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "ADMIN" }) }),
    )
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ status: "ACCEPTED" }),
    })
    expect(ctx?.role).toBe("ADMIN")
  })

  it("returns the resolved context for an existing signed-in agent (no upsert)", async () => {
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
    expect(mockTeamUserUpsert).not.toHaveBeenCalled()
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
