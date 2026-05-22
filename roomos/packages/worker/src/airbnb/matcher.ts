import { prisma } from "@roomos/db"
import type { AirbnbListingRow } from "./types"

export type MatchResult = {
  roomId: string | null
  candidatePropertyId: string | null
  ambiguous: boolean
}

export async function matchListingToRoom(orgId: string, listing: AirbnbListingRow): Promise<MatchResult> {
  const normalizedListing = normalizeAddress(listing.address)
  if (!normalizedListing) return { roomId: null, candidatePropertyId: null, ambiguous: false }

  const properties = await prisma.property.findMany({ where: { orgId } })
  const candidate = properties.find((p) => normalizeAddress(p.address) === normalizedListing)
  if (!candidate) return { roomId: null, candidatePropertyId: null, ambiguous: false }

  const rooms = await prisma.room.findMany({ where: { propertyId: candidate.id } })
  if (rooms.length === 0) return { roomId: null, candidatePropertyId: candidate.id, ambiguous: true }

  // Title "Room N" / "R N" / "RN"?
  const roomNumberInTitle = listing.title.match(/\bR\s*0*(\d+)\b/i) ?? listing.title.match(/\broom\s+0*(\d+)\b/i)
  if (roomNumberInTitle) {
    const want = `R${roomNumberInTitle[1]}`.toUpperCase()
    const match = rooms.find((r) => r.roomNumber?.toUpperCase() === want)
    if (match) return { roomId: match.id, candidatePropertyId: candidate.id, ambiguous: false }
  }

  // Entire home + single room → that room
  if (listing.listingType === "entire_home" && rooms.length === 1) {
    return { roomId: rooms[0]!.id, candidatePropertyId: candidate.id, ambiguous: false }
  }

  // Anything else: ambiguous
  return { roomId: null, candidatePropertyId: candidate.id, ambiguous: true }
}

function normalizeAddress(s: string): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .replace(/\bnortheast\b/g, "ne")
    .replace(/\bnorthwest\b/g, "nw")
    .replace(/\bsoutheast\b/g, "se")
    .replace(/\bsouthwest\b/g, "sw")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bunit\s+[a-z0-9]+\b/g, "")
    .replace(/\bapt\s+[a-z0-9]+\b/g, "")
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
