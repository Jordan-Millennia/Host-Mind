import { describe, it, expect } from "vitest"
import { parseOwnerCsv } from "@/lib/csv-parse"

describe("parseOwnerCsv", () => {
  it("parses header + rows", () => {
    const csv = `address,owner_name,owner_email
3216 71st Ave N,Patel LLC,billing@patel.example
1842 Park St,Patel LLC,billing@patel.example
4501 Beach Blvd,Rivera Group,ops@rivera.example`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([])
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
      { address: "1842 Park St", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
      { address: "4501 Beach Blvd", ownerName: "Rivera Group", ownerEmail: "ops@rivera.example" },
    ])
  })

  it("flags missing required columns and returns empty rows", () => {
    const csv = `address,owner_name\n3216 71st Ave N,Patel LLC`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([
      { line: 1, message: "Missing required column: owner_email" },
    ])
    expect(out.rows).toEqual([])
  })

  it("flags rows with empty cells with a 1-indexed data line number", () => {
    const csv = `address,owner_name,owner_email
3216 71st Ave N,Patel LLC,billing@patel.example
,Rivera Group,ops@rivera.example`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([{ line: 3, message: "Empty address" }])
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
    ])
  })

  it("trims whitespace and ignores trailing blank lines", () => {
    const csv = `address,owner_name,owner_email
  3216 71st Ave N , Patel LLC , billing@patel.example

`
    const out = parseOwnerCsv(csv)
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
    ])
    expect(out.errors).toEqual([])
  })
})
