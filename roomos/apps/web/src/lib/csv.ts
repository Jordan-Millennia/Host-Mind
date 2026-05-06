export type CsvColumn<T> = { key: keyof T; header: string }

function escape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], cols: CsvColumn<T>[]): string {
  const header = cols.map((c) => escape(c.header)).join(",")
  const body = rows
    .map((r) => cols.map((c) => escape(r[c.key])).join(","))
    .join("\n")
  return body ? `${header}\n${body}` : header
}
