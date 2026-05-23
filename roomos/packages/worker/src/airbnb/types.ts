// Airbnb adapter — typed shapes for parser output and persist input.

export type AirbnbListingRow = {
  airbnbListingId: string          // Airbnb's internal numeric ID
  title: string                     // listing title — used for room# extraction
  address: string                   // street address as shown in host UI
  listingType: "entire_home" | "private_room" | "shared_room" | "unknown"
  status: "active" | "snoozed" | "in_progress" | "unlisted" | "unknown"
}

export type AirbnbBookingRow = {
  airbnbListingId: string           // "" — the /hosting/reservations table does NOT expose the numeric id
  listingTitle?: string             // listing NAME as shown in the reservations table; join key bookings→listings by title
  confirmationCode: string          // primary key for occupancy uniqueness
  guestName: string                 // full visible name in the reservations table
  guestUserId: string | null        // from the guest /users/profile/<id> link, when present
  checkIn: string                   // ISO date "2026-05-12"
  checkOut: string                  // ISO date
  status: "confirmed" | "pending" | "canceled" | "completed" | "unknown"
}

export type AirbnbTransactionRow = {
  confirmationCode: string          // joins to AirbnbBookingRow
  listingTitle?: string             // listing NAME from the reservations table (same source as the booking)
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
