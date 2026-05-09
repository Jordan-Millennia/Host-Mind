import matter from "gray-matter"

export type ParsedFrontmatter = {
  address: string
  market: string | null
  state: string | null
  rooms: number | null
  platform: string | null
  padsplitPropertyId: string | null
  lastUpdated: string | null
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  let data: Record<string, unknown>
  try {
    data = matter(content).data
  } catch (err) {
    throw new Error(`Invalid YAML frontmatter: ${(err as Error).message}`)
  }
  if (Object.keys(data).length === 0 && !content.startsWith("---")) {
    throw new Error("No YAML frontmatter block found")
  }

  const str = (k: string): string | null => {
    const v = data[k]
    if (v === undefined || v === null || v === "") return null
    return String(v)
  }
  const num = (k: string): number | null => {
    const v = data[k]
    if (v === undefined || v === null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }

  return {
    address: str("address") ?? "",
    market: str("market"),
    state: str("state"),
    rooms: num("rooms"),
    platform: str("platform"),
    padsplitPropertyId: str("padsplit-property-id"),
    lastUpdated: str("last-updated"),
  }
}
