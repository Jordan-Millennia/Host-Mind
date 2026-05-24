import { describe, it, expect } from "vitest"
import { parsePadsplitMaintenance, parsePadsplitMoveIn, parsePadsplitMoveOut } from "../../src/lib/ingest/parsers/padsplit"
import { parseEmail } from "../../src/lib/ingest/route-email"
import type { RawEmail } from "../../src/lib/ingest/types"

// Bodies/subjects below mirror real PadSplit notification emails (sampled read-only, 2026-05).

const maintenance: RawEmail = {
  messageId: "m1",
  from: "PadSplit Maintenance <maintenance@padsplit.com>",
  subject: "PadSplit Maintenance Ticket from Anthony Williams at 8591 Lowell Boulevard, Westminster",
  body: "Anthony submitted a ticket for 8591 Lowell Boulevard, Westminster. Member's Room: 10 Location: Kitchen Details: Waiting for garbage disposal part Ticket number: 415107 Please go to the task card to respond.",
}

const moveIn: RawEmail = {
  messageId: "m2",
  from: "PadSplit <support@padsplit.com>",
  subject: "A member is moving in tomorrow!",
  body: "Someone's moving in tomorrow! Hi Jordan SuperHost, Brian Shaw will be moving into 5 at 11068 West 62nd Place, Arvada tomorrow. Please double-check the following:",
}

const moveOut: RawEmail = {
  messageId: "m3",
  from: "PadSplit Support <support@padsplit.com>",
  subject: "Move-out confirmed",
  body: "Move-out confirmed Hello Jordan, Member Ajay Jenkins has confirmed that they are moved out of 8060 Stuart Place, Westminster Room 3. View move-out photos You can now schedule this room to be cleaned.",
}

describe("parsePadsplitMaintenance", () => {
  it("extracts member, address, room, location, details, ticket #", () => {
    const p = parsePadsplitMaintenance(maintenance)
    expect(p).not.toBeNull()
    expect(p!.memberName).toBe("Anthony Williams")
    expect(p!.propertyAddress).toBe("8591 Lowell Boulevard, Westminster")
    expect(p!.room).toBe("10")
    expect(p!.location).toBe("Kitchen")
    expect(p!.details).toBe("Waiting for garbage disposal part")
    expect(p!.ticketNumber).toBe("415107")
  })

  it("ignores non-maintenance senders", () => {
    expect(parsePadsplitMaintenance(moveIn)).toBeNull()
  })
})

describe("parsePadsplitMoveIn", () => {
  it("extracts member, room, address (even with the 'Hi Jordan SuperHost,' preamble)", () => {
    const p = parsePadsplitMoveIn(moveIn)
    expect(p).not.toBeNull()
    expect(p!.memberName).toBe("Brian Shaw")
    expect(p!.room).toBe("5")
    expect(p!.propertyAddress).toBe("11068 West 62nd Place, Arvada")
  })
})

describe("parsePadsplitMoveOut", () => {
  it("extracts member, address, room from a move-out confirmation", () => {
    const p = parsePadsplitMoveOut(moveOut)
    expect(p).not.toBeNull()
    expect(p!.memberName).toBe("Ajay Jenkins")
    expect(p!.propertyAddress).toBe("8060 Stuart Place, Westminster")
    expect(p!.room).toBe("3")
  })
})

describe("parseEmail router", () => {
  it("routes each known email to its parser", () => {
    expect(parseEmail(maintenance)?.type).toBe("maintenance")
    expect(parseEmail(moveIn)?.type).toBe("move_in")
    expect(parseEmail(moveOut)?.type).toBe("move_out")
  })

  it("returns null for an unrecognized (marketing) email", () => {
    const marketing: RawEmail = {
      messageId: "m4",
      from: "Airbnb <discover@airbnb.com>",
      subject: "Lewiston homes, just for you",
      body: "One more step. Finish booking your stay in Lewiston",
    }
    expect(parseEmail(marketing)).toBeNull()
  })
})
