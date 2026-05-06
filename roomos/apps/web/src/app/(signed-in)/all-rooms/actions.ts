"use server"

import { requireSignedIn } from "@/lib/auth"
import { parseSearchParams } from "@/lib/filters"
import { getAllRoomsFiltered } from "@/lib/room-queries"
import { toCsv, type CsvColumn } from "@/lib/csv"

const COLS: CsvColumn<{
  property: string
  room: string
  owner: string
  member: string
  status: string
  moveIn: string
  leaseEnd: string
  balance: string
  daysPastDue: string
}>[] = [
  { key: "property",    header: "Property" },
  { key: "room",        header: "Room" },
  { key: "owner",       header: "Owner" },
  { key: "member",      header: "Member" },
  { key: "status",      header: "Status" },
  { key: "moveIn",      header: "Move-in" },
  { key: "leaseEnd",    header: "Lease end" },
  { key: "balance",     header: "Balance" },
  { key: "daysPastDue", header: "Days past due" },
]

export async function exportCsv(formData: FormData): Promise<{ filename: string; csv: string }> {
  const ctx = await requireSignedIn()
  const usp = new URLSearchParams()
  formData.forEach((v, k) => {
    if (typeof v === "string" && k !== "_") usp.set(k, v)
  })
  const filter = parseSearchParams(usp)

  // Fetch ALL matching rows (cap at 5000 to avoid runaway)
  const { rows } = await getAllRoomsFiltered(ctx.orgId, { ...filter, page: 1 }, 5000)

  const data = rows.map((r) => ({
    property: r.propertyAddress,
    room: r.roomNumber ?? "",
    owner: r.ownerName ?? "",
    member: r.memberName ?? "",
    status: r.status,
    moveIn: r.moveInDate ? r.moveInDate.toISOString().slice(0, 10) : "",
    leaseEnd: r.leaseEndDate ? r.leaseEndDate.toISOString().slice(0, 10) : "",
    balance: r.currentBalance ?? "",
    daysPastDue: r.daysPastDue == null ? "" : String(r.daysPastDue),
  }))

  const csv = toCsv(data, COLS)
  const ts = new Date().toISOString().slice(0, 10)
  const filename = `roomos-rooms-${ts}.csv`
  return { filename, csv }
}
