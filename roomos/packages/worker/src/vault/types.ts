// Vault adapter — typed shapes for parser output and persist input.

export type VaultFlagSeverity = "DANGER" | "WARN" | "INFO" | "OK"

export type VaultMemberStatusText =
  | "Active"
  | "VACATED"
  | "TERMINATED"
  | "Moving in"
  | "Moving out"
  | "Inactive"

export type VaultMemberRow = {
  roomNumber: string                  // "R1", "R2", ...
  name: string
  status: VaultMemberStatusText
  balanceText: string                 // "$0", "$407.90"
  notes: string
}

export type VaultFlag = {
  severity: VaultFlagSeverity
  title: string
  body: string
  rawLine: string                     // hashed for source_ref dedup
}

export type VaultMaintenanceItem = {
  description: string
  status: string
  priority: string
  raw: string
}

export type VaultPropertyFile = {
  filePath: string
  padsplitPropertyId: string
  address: string
  market: string | null
  state: string | null
  rooms: number | null
  platform: string | null
  lastUpdated: string | null
  members: VaultMemberRow[]
  maintenanceItems: VaultMaintenanceItem[]
  flagsAndAlerts: VaultFlag[]
}

export type VaultMemberDossier = {
  filePath: string
  memberId: string | null              // PadSplit user ID from frontmatter
  name: string
  email: string | null
  phone: string | null
  weeklyRate: number | null
  moveInDate: string | null            // ISO date string from frontmatter
  status: string | null
  balance: number | null
}

export type VaultSyncResult = {
  propertiesParsed: number
  membersDossiersParsed: number
  propertiesUpserted: number
  roomsUpserted: number
  membersUpserted: number
  occupanciesUpserted: number
  flagsUpserted: number
  errors: { file: string; reason: string }[]
}
