// Airbnb adapter — typed shapes for parser output and persist input.

export type AirbnbListingRow = {
  airbnbListingId: string          // Airbnb's internal numeric ID
  title: string                     // listing title — used for room# extraction
  address: string                   // street address as shown in host UI
  listingType: "entire_home" | "private_room" | "shared_room" | "unknown"
  status: "active" | "snoozed" | "in_progress" | "unlisted" | "unknown"
}

export type AirbnbBookingRow = {
  airbnbListingId: string
  confirmationCode: string          // primary key for occupancy uniqueness
  guestName: string                 // first name only in host UI
  guestUserId: string | null        // not always exposed
  checkIn: string                   // ISO date "2026-05-12"
  checkOut: string                  // ISO date
  status: "confirmed" | "pending" | "canceled" | "completed" | "unknown"
}

export type AirbnbTransactionRow = {
  confirmationCode: string          // joins to AirbnbBookingRow
  payoutDate: string                // ISO date
  grossAmount: number               // dollars
  netAmount: number                 // dollars (after Airbnb fee)
  type: "payout" | "refund" | "adjustment" | "unknown"
}

export type AirbnbSyncResult = {
  listingsParsed: number
  bookingsParsed: number
  transactionsParsed: number
  listingsUpserted: number
  bookingsUpserted: number
  paymentEventsUpserted: number
  mappingsAuto: number              // listings auto-matched to a room
  mappingsAmbiguous: number         // listings that need Jordan's confirmation
  crossListings: number             // rooms with both PADSPLIT + AIRBNB active
  errors: { stage: string; reason: string }[]
}
