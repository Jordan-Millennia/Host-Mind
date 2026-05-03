import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleClerkWebhook } from "@/lib/webhook-verify"

const mockUpsert = vi.fn()
const mockDelete = vi.fn()
const mockOrgFindFirst = vi.fn().mockResolvedValue({ id: "org_test" })

vi.mock("@roomos/db", () => ({
  prisma: {
    org: { findFirst: (...a: unknown[]) => mockOrgFindFirst(...a) },
    teamUser: {
      upsert: (...a: unknown[]) => mockUpsert(...a),
      deleteMany: (...a: unknown[]) => mockDelete(...a),
    },
  },
}))

describe("handleClerkWebhook", () => {
  beforeEach(() => {
    mockUpsert.mockClear()
    mockDelete.mockClear()
  })

  it("upserts a team_user on user.created", async () => {
    const result = await handleClerkWebhook({
      type: "user.created",
      data: {
        id: "user_abc",
        email_addresses: [{ email_address: "test@cohostmgmt.net" }],
      },
    } as never)

    expect(result.ok).toBe(true)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { clerkUserId: "user_abc" },
      create: expect.objectContaining({
        clerkUserId: "user_abc",
        email: "test@cohostmgmt.net",
        role: "AGENT",
      }),
      update: expect.objectContaining({ email: "test@cohostmgmt.net" }),
    })
  })

  it("deletes the team_user on user.deleted", async () => {
    const result = await handleClerkWebhook({
      type: "user.deleted",
      data: { id: "user_abc", deleted: true },
    } as never)

    expect(result.ok).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith({ where: { clerkUserId: "user_abc" } })
  })

  it("ignores unknown event types", async () => {
    const result = await handleClerkWebhook({
      type: "session.created",
      data: { id: "sess_x" },
    } as never)

    expect(result.ok).toBe(true)
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
