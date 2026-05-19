import type { VaultPropertyFile } from "../types"
import { parseFrontmatter } from "./frontmatter"
import { parseMembersTable } from "./members-table"
import { parseFlags } from "./flags"
import { parseMaintenance } from "./maintenance"

export function parsePropertyFile(rawContent: string, filePath: string): VaultPropertyFile {
  // Normalize CRLF and old Mac CR to LF so all downstream parsers can split on \n
  const content = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const fm = parseFrontmatter(content)
  if (!fm.padsplitPropertyId) {
    throw new Error(`Property file at ${filePath} is missing padsplit-property-id`)
  }
  return {
    filePath,
    padsplitPropertyId: fm.padsplitPropertyId,
    address: fm.address,
    market: fm.market,
    state: fm.state,
    rooms: fm.rooms,
    platform: fm.platform,
    lastUpdated: fm.lastUpdated,
    members: parseMembersTable(content),
    flagsAndAlerts: parseFlags(content),
    maintenanceItems: parseMaintenance(content),
  }
}
