// Shapes for the real-time email ingest pipeline (GAS forwarder → /api/ingest/email).

/** Raw email as the Apps Script forwarder POSTs it. */
export type RawEmail = {
  messageId: string
  from: string
  subject: string
  body: string
  receivedAt?: string
}

export type ParsedEmail =
  | {
      source: "padsplit"
      type: "maintenance"
      memberName: string
      propertyAddress: string
      room: string | null
      location: string | null
      details: string | null
      ticketNumber: string | null
    }
  | { source: "padsplit"; type: "move_in"; memberName: string; propertyAddress: string; room: string | null }
  | { source: "padsplit"; type: "move_out"; memberName: string; propertyAddress: string; room: string | null }
