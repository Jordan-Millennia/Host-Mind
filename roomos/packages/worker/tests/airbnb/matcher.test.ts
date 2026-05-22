import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { matchListingToRoom } from "../../src/airbnb/matcher"

const ORG_ID = "org-test-2b-matcher"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B MATCHER" } })
})

async function seedProperty(address: string, rooms: string[]): Promise<{ propertyId: string; roomIds: Record<string, string> }> {
  const p = await prisma.property.create({
    data: { orgId: ORG_ID, address, padsplitPropertyId: `m-${Date.now()}-${Math.random()}` },
  })
  const roomIds: Record<string, string> = {}
  for (const rn of rooms) {
    const r = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: p.id, roomNumber: rn } })
    roomIds[rn] = r.id
  }
  return { propertyId: p.id, roomIds }
}

describe("matchListingToRoom", () => {
  it("matches by 'Room N' in title when property has that room", async () => {
    const { roomIds } = await seedProperty("1311 Morgana Rd, Jacksonville, FL", ["R1", "R2", "R3"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "1",
      title: "Cozy Private Room R2 — Jacksonville",
      address: "1311 Morgana Rd Jacksonville FL",
      listingType: "private_room",
      status: "active",
    })
    expect(result.roomId).toBe(roomIds["R2"])
    expect(result.ambiguous).toBe(false)
  })

  it("matches entire_home listings to the single room when property has one room", async () => {
    const { roomIds } = await seedProperty("7728 Linkside Loop, Kissimmee, FL", ["R1"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "2",
      title: "Whole house in Kissimmee",
      address: "7728 Linkside Loop, Kissimmee, FL",
      listingType: "entire_home",
      status: "active",
    })
    expect(result.roomId).toBe(roomIds["R1"])
  })

  it("returns null roomId and ambiguous=true when no room can be inferred", async () => {
    await seedProperty("999 Unknown St", ["R1", "R2"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "3",
      title: "Stay in our home",
      address: "999 Unknown St",
      listingType: "entire_home",   // can't pick a single room
      status: "active",
    })
    expect(result.roomId).toBeNull()
    expect(result.ambiguous).toBe(true)
    expect(result.candidatePropertyId).not.toBeNull()
  })

  it("returns null propertyId when no property matches the address at all", async () => {
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "4",
      title: "Random place",
      address: "404 Nowhere Ln",
      listingType: "entire_home",
      status: "active",
    })
    expect(result.roomId).toBeNull()
    expect(result.candidatePropertyId).toBeNull()
  })
})
