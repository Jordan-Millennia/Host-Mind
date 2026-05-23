import { prisma } from "@roomos/db"
import type { Prisma } from "@roomos/db"
import type { AirbnbTransactionRow } from "../types"

export type UpsertAirbnbPaymentInput = {
  orgId: string
  memberId: string
  occupancyId: string | null
  transaction: AirbnbTransactionRow
}

export async function upsertAirbnbPayment(input: UpsertAirbnbPaymentInput): Promise<void> {
  // Key on confirmation code + type only — NOT the payout date. The reservations
  // table approximates payoutDate as the checkout date, which shifts if the guest
  // changes their dates between syncs; including it would re-insert the same payout
  // under a new key and double-count. A reservation has at most one payout + one
  // refund, so (code, type) is the stable natural key.
  const externalEventId = `airbnb:${input.transaction.confirmationCode}:${input.transaction.type}`
  const existing = await prisma.paymentEvent.findUnique({
    where: { memberId_externalEventId: { memberId: input.memberId, externalEventId } },
  })
  if (existing) return
  await prisma.paymentEvent.create({
    data: {
      orgId: input.orgId,
      memberId: input.memberId,
      occupancyId: input.occupancyId,
      amount: input.transaction.netAmount,
      eventType: input.transaction.type === "refund" ? "ADJUSTMENT" : "PAYMENT",
      eventDate: new Date(input.transaction.payoutDate),
      source: "AIRBNB_SCRAPE",
      externalEventId,
      rawJson: input.transaction as unknown as Prisma.InputJsonValue,
    },
  })
}
