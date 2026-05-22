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
  const externalEventId = `airbnb:${input.transaction.confirmationCode}:${input.transaction.payoutDate}:${input.transaction.type}`
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
