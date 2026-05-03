export const PADSPLIT_URLS = {
  dashboard: "https://www.padsplit.com/host/dashboard",
  rooms: "https://www.padsplit.com/host/rooms",
  property: (psPropertyId: string) => `https://www.padsplit.com/host/listing/${psPropertyId}`,
  member: (psMemberId: string) => `https://www.padsplit.com/host/member/${psMemberId}`,
} as const
