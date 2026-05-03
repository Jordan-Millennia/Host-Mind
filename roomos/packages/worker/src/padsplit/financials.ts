import { createHash } from "node:crypto"
import { prisma } from "@roomos/db"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { parseMemberProfile } from "./parsers"
import {
  getOrg,
  startSyncRun,
  finishSyncRun,
  updateOccupancyFinancials,
  recordPaymentEvent,
} from "../persist"

function hashEvent(memberId: string, amount: string, date: string): string {
  return createHash("sha256").update(`padsplit:${memberId}:${amount}:${date}`).digest("hex").slice(0, 32)
}

/** Walks every active occupancy with a member, fetches their PadSplit profile,
 *  updates denormalized financial fields + appends a payment_event if a new
 *  payment is observed since last_payment_at. */
export async function runFinancials(): Promise<{ membersScraped: number; paymentsRecorded: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "FINANCIAL", platform: "PADSPLIT" })

  const occupancies = await prisma.occupancy.findMany({
    where: {
      orgId: org.id,
      status: { in: ["OCCUPIED", "MOVING_IN"] },
      member: { isNot: null },
    },
    select: {
      id: true,
      lastPaymentAt: true,
      member: { select: { id: true, externalMemberId: true } },
    },
  })

  let membersScraped = 0
  let paymentsRecorded = 0

  try {
    await withPlaywrightSession("padsplit", async ({ page }) => {
      for (const occ of occupancies) {
        if (!occ.member) continue
        await page.goto(PADSPLIT_URLS.member(occ.member.externalMemberId), {
          waitUntil: "domcontentloaded",
        })
        const html = await page.content()
        const parsed = parseMemberProfile(html)

        await updateOccupancyFinancials({
          occupancyId: occ.id,
          balance: parsed.balance,
          daysPastDue: parsed.daysPastDue,
          lastPaymentAmount: parsed.lastPaymentAmount,
          lastPaymentAt: parsed.lastPaymentDate,
        })

        if (parsed.lastPaymentDate && parsed.lastPaymentAmount) {
          const isNewer = !occ.lastPaymentAt || new Date(parsed.lastPaymentDate) > occ.lastPaymentAt
          if (isNewer) {
            const eventId = hashEvent(occ.member.id, parsed.lastPaymentAmount, parsed.lastPaymentDate)
            await recordPaymentEvent({
              orgId: org.id,
              memberId: occ.member.id,
              occupancyId: occ.id,
              amount: parsed.lastPaymentAmount,
              eventDate: parsed.lastPaymentDate,
              externalEventId: eventId,
            })
            paymentsRecorded++
          }
        }

        membersScraped++
        await jitterSleep(5000)
      }
    })

    await finishSyncRun(runId, { status: "SUCCESS", itemsSynced: membersScraped })
    log.info({ membersScraped, paymentsRecorded }, "financials sync complete")
    return { membersScraped, paymentsRecorded }
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message, membersScraped, paymentsRecorded },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
