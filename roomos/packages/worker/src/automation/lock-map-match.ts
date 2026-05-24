// Pure matcher for building the TTLock lock-map safely. TTLock aliases are
// free-text and inconsistent ("2380 Bay St Room 6", "Renshaw Unit 2", "renshaw 5",
// "trout 7", "733 tarpon room 2 new lock", "8578 w 84th front door"). We parse out
// the property identity tokens + a room number, then score each lock against the
// clean RoomOS room inventory. Door codes are physical security, so this only emits
// CONFIDENT matches automatically; everything else goes to a human-review list.

const ROOM_RE = /\b(?:room|rm|unit|bed(?:room)?|br)\s*#?\s*(\d+)\b/i
const TRAILING_NUM_RE = /(\d+)\s*$/ // "renshaw 5", "trout 7"
const COMMON_RE = /\b(front|back|side|rear|garage|exterior|main|common|gate|patio|laundry|storage|office)\b/i
const NOISE_RE = /\b(ext|exterior|new lock|new|lock|door)\b/gi

export type ParsedLock = {
  raw: string
  nameTokens: string[] // property-identity tokens (street number, street words, nickname)
  roomNumber: string | null // digits only
  isCommon: boolean // front/back/garage/common-area lock → not a per-room guest code
}

export type RoomLite = { id: string; address: string; roomNumber: string | null }

export type LockMatch = { roomId: string; score: number }

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

export function parseLockAlias(alias: string): ParsedLock {
  const raw = alias.trim()
  const lower = raw.toLowerCase()

  const roomMatch = lower.match(ROOM_RE)
  const hasRoomWord = roomMatch !== null
  // A lock is "common" when it names a shared door AND carries no explicit room number.
  const isCommon = !hasRoomWord && COMMON_RE.test(lower)

  let roomNumber: string | null = null
  if (roomMatch) roomNumber = roomMatch[1] ?? null
  else if (!isCommon) {
    const trailing = lower.match(TRAILING_NUM_RE)
    if (trailing) roomNumber = trailing[1] ?? null
  }

  // Property tokens = alias minus the room phrase, common-door words, and noise.
  let nameStr = lower.replace(ROOM_RE, " ").replace(COMMON_RE, " ").replace(NOISE_RE, " ")
  if (roomNumber) nameStr = nameStr.replace(new RegExp(`\\b${roomNumber}\\b`, "g"), " ")
  const nameTokens = tokenize(nameStr)

  return { raw, nameTokens, roomNumber, isCommon }
}

/**
 * Score a parsed lock against a RoomOS room in [0,1]. 0 = no match. Only per-room
 * locks with a matching room number can score; a shared street number is the
 * strongest property signal.
 */
export function scoreRoomMatch(parsed: ParsedLock, room: RoomLite): number {
  if (parsed.isCommon || !parsed.roomNumber) return 0
  const roomNum = (room.roomNumber ?? "").replace(/[^0-9]/g, "")
  if (!roomNum || roomNum !== parsed.roomNumber) return 0 // room number is a hard gate

  const addrTokens = tokenize(room.address)
  const overlap = parsed.nameTokens.filter((t) => addrTokens.includes(t))
  if (overlap.length === 0) return 0

  const lockStreetNum = parsed.nameTokens.find((t) => /^\d+$/.test(t))
  const addrStreetNum = addrTokens.find((t) => /^\d+$/.test(t))
  const streetMatch = Boolean(lockStreetNum && addrStreetNum && lockStreetNum === addrStreetNum)

  const frac = overlap.length / parsed.nameTokens.length
  return Math.min(1, frac + (streetMatch ? 0.5 : 0))
}

/** Best room match for a lock, or null. `threshold` gates a confident auto-match. */
export function bestRoomMatch(alias: string, rooms: RoomLite[]): LockMatch | null {
  const parsed = parseLockAlias(alias)
  if (parsed.isCommon || !parsed.roomNumber) return null
  let best: LockMatch | null = null
  for (const room of rooms) {
    const score = scoreRoomMatch(parsed, room)
    if (score > 0 && (!best || score > best.score)) best = { roomId: room.id, score }
  }
  return best
}

export const CONFIDENT_THRESHOLD = 0.8
export const REVIEW_THRESHOLD = 0.5
