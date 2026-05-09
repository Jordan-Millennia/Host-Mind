import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertMember } from "../../src/vault/persist/member"

const ORG_ID = "org-test-2a-member"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG MEMBER" } })
})

describe("upsertMember", () => {
  it("uses the dossier memberId when provided", async () => {
    const id = await upsertMember(ORG_ID, {
      name: "Jeffrey Byrd",
      dossier: { memberId: "8001", email: "j@x.com", phone: null, dossierPath: "/m/j.md", weeklyRate: 200 },
      padsplitPropertyId: "28685",
      roomNumber: "R1",
    })
    const m = await prisma.member.findUnique({ where: { id } })
    expect(m?.externalMemberId).toBe("8001")
    expect(m?.email).toBe("j@x.com")
  })

  it("synthesizes an externalMemberId when no dossier is found", async () => {
    const id = await upsertMember(ORG_ID, {
      name: "Lawrence Drayton",
      dossier: null,
      padsplitPropertyId: "28685",
      roomNumber: "R6",
    })
    const m = await prisma.member.findUnique({ where: { id } })
    expect(m?.externalMemberId).toBe("vault:28685-R6-lawrence-drayton")
  })

  it("is idempotent — re-upserting the same logical member returns the same id", async () => {
    const a = await upsertMember(ORG_ID, {
      name: "Devin Carey",
      dossier: { memberId: "8002", email: null, phone: null, dossierPath: null, weeklyRate: null },
      padsplitPropertyId: "28685",
      roomNumber: "R2",
    })
    const b = await upsertMember(ORG_ID, {
      name: "Devin Carey",
      dossier: { memberId: "8002", email: "newer@x.com", phone: null, dossierPath: null, weeklyRate: null },
      padsplitPropertyId: "28685",
      roomNumber: "R2",
    })
    expect(b).toBe(a)
    const m = await prisma.member.findUnique({ where: { id: a } })
    expect(m?.email).toBe("newer@x.com")
  })
})
