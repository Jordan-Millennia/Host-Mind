// GHL Room Tracker pipeline configuration + the pure RoomOS→GHL stage mapping.
//
// Pipeline + stage ids are GHL-internal identifiers (not secrets); the API key
// is the only secret and lives in env (GHL_API_KEY). These are config constants
// so the mapping stays pure and unit-testable with no network or env access.

import type { OccupancyStatus, Platform } from "@roomos/db"

export const GHL_API_BASE = "https://services.leadconnectorhq.com"

/** Room Tracker pipeline. */
export const GHL_PIPELINE_ID = "QNy5Y8qCmYc0ZfYcKyU0"

export type GhlStageKey =
  | "VACANT"
  | "OCCUPIED"
  | "MOVING_OUT"
  | "INCOMING"
  | "AIRBNB"
  | "TURNOVER"
  | "MAINTENANCE"

/** Room Tracker pipeline stage ids, keyed by semantic stage. */
export const GHL_STAGE_IDS: Record<GhlStageKey, string> = {
  VACANT: "06e6b16f-72ec-4a28-86a6-1ae067f8361c",
  OCCUPIED: "87f1d13d-9758-4165-b0cf-d522e62af84a",
  MOVING_OUT: "127115d0-b0d5-4584-8524-6156c613a95a",
  INCOMING: "cc564cb4-e295-478b-9982-a627bf86736a",
  AIRBNB: "1a1792fc-c9b1-45ec-9ce8-0aa37fe8350f",
  TURNOVER: "e8da176e-403b-43d3-95f2-33f4f1681318",
  MAINTENANCE: "a3e04ce8-c543-4f72-8b08-b8864e32ba40",
}

/** Days-before-checkout that flips an active stay into the MOVING_OUT stage. */
export const MOVING_OUT_WINDOW_DAYS = 7

export type RoomTrackerState = {
  /** Platform of the room's current active occupancy, or null if the room is empty. */
  platform: Platform | null
  /** Status of the current active occupancy, or null if there is none. */
  status: OccupancyStatus | null
  /** True when an OCCUPIED stay's lease ends within MOVING_OUT_WINDOW_DAYS. */
  endingSoon: boolean
}

/**
 * Map a room's effective occupancy state to the correct GHL Room Tracker stage.
 * Pure — no DB, no network. The orchestrator resolves RoomTrackerState from the
 * room's open occupancy + its listing platform, then calls this.
 */
export function ghlStageForRoom(state: RoomTrackerState): GhlStageKey {
  if (state.status === null) return "VACANT"
  switch (state.status) {
    case "MOVING_IN":
    case "WAITING_APPROVAL":
      return "INCOMING"
    case "MOVING_OUT":
      return "MOVING_OUT"
    case "NEEDS_FLIP":
      return "TURNOVER"
    case "VACANT":
    case "INACTIVE":
      return "VACANT"
    case "OCCUPIED":
      if (state.endingSoon) return "MOVING_OUT"
      return state.platform === "AIRBNB" ? "AIRBNB" : "OCCUPIED"
    default:
      return "VACANT"
  }
}

/** Canonical GHL opportunity name for a room: "Address — Room N" (em dash, matches existing data). */
export function ghlOpportunityName(propertyAddress: string, roomNumber: string | null): string {
  const street = (propertyAddress.split(",")[0] ?? propertyAddress).trim()
  const room = (roomNumber ?? "").trim()
  return room ? `${street} — Room ${room}` : street
}

/** Loose normaliser for matching opportunity names across minor formatting drift. */
export function normalizeOppName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[—–-]/g, " ") // any dash → space
    .replace(/\broom\b/g, "room")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\broom r(\d+)\b/g, "room $1") // bridge RoomOS "Room R5" <-> GHL "Room 5"
    .trim()
}
