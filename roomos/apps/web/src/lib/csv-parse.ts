export type OwnerCsvRow = {
  address: string
  ownerName: string
  ownerEmail: string
}

export type OwnerCsvError = {
  line: number  // 1 = header; 2+ = data rows
  message: string
}

export type OwnerCsvParseResult = {
  rows: OwnerCsvRow[]
  errors: OwnerCsvError[]
}

const REQUIRED_COLUMNS = ["address", "owner_name", "owner_email"] as const

/** Splits a CSV line, respecting quoted fields. RFC 4180-style. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { cur += c }
    } else {
      if (c === ",") { out.push(cur); cur = "" }
      else if (c === '"') { inQuotes = true }
      else { cur += c }
    }
  }
  out.push(cur)
  return out
}

export function parseOwnerCsv(input: string): OwnerCsvParseResult {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "Empty file" }] }
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const errors: OwnerCsvError[] = []
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) errors.push({ line: 1, message: `Missing required column: ${col}` })
  }
  if (errors.length > 0) return { rows: [], errors }

  const idx = {
    address: header.indexOf("address"),
    ownerName: header.indexOf("owner_name"),
    ownerEmail: header.indexOf("owner_email"),
  }

  const rows: OwnerCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const csvLine = lines[i]!
    const fields = splitCsvLine(csvLine).map((f) => f.trim())
    const address = fields[idx.address] ?? ""
    const ownerName = fields[idx.ownerName] ?? ""
    const ownerEmail = fields[idx.ownerEmail] ?? ""
    const lineNum = i + 1
    if (!address) { errors.push({ line: lineNum, message: "Empty address" }); continue }
    if (!ownerName) { errors.push({ line: lineNum, message: "Empty owner_name" }); continue }
    if (!ownerEmail) { errors.push({ line: lineNum, message: "Empty owner_email" }); continue }
    rows.push({ address, ownerName, ownerEmail })
  }

  return { rows, errors }
}
