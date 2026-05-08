# RoomOS Phase 2A — Vault Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the broken Mac Studio PadSplit scraper and replace it with a vault adapter that reads CoHost Knowledge Hub `.md` files and writes to RoomOS Postgres on a 15-minute cadence. Refresh the dashboard to the locked Claude design language. After this ships, Jordan opens `/properties` and sees the actual current state of all 59 active properties — sourced from the vault that the Codex `padsplit-message-responder` already keeps fresh.

**Architecture:** New `vault` package inside the existing worker (`packages/worker/src/vault/`). Pure-function parsers (frontmatter, members table, flags blockquote, maintenance items, member dossier) feed an idempotent persistence layer that upserts properties / rooms / members / occupancies / property-flags. New BullMQ job `vault:sync` runs on a 15-min schedule via launchd; old `padsplit-occupancy` and `padsplit-financials` jobs are deactivated (kept in tree for Phase 2B/2C reference, just unscheduled). New Prisma migration adds `property_flags`, `Property.padsplitPropertyId`, `Property.vaultFilePath`, `Member.memberDossierPath`, and `SyncKind.VAULT_SYNC`. Web layer is a styling pass over Phase 1C components: new font stack (Source Serif 4 + Switzer), updated CSS tokens, restyled property/room cards, new Live Flags right-rail component on the property detail page.

**Tech Stack:** TypeScript 5 / Node 20 / pnpm. Prisma 5 (existing). Vitest (existing). Next.js 14 App Router (existing). New: `gray-matter` for YAML frontmatter parsing (small, well-trusted dep). New: Source Serif 4 (Google Fonts) + Switzer (Fontshare) loaded via `next/font/google` and a Fontshare `<link>` respectively. No new infra.

---

## Source spec & predecessors

- Master spec for this pivot: [`docs/superpowers/specs/2026-05-08-roomos-vault-fed-pivot-design.md`](../specs/2026-05-08-roomos-vault-fed-pivot-design.md). Section 4.1 fully describes the vault adapter; section 5 specifies schema deltas; section 6 references the locked mockups; section 8 sequences the migration.
- Original Phase 1 spec: [`docs/superpowers/specs/2026-05-02-roomos-phase-1-design.md`](../specs/2026-05-02-roomos-phase-1-design.md). The Postgres schema and dashboard architecture defined there are preserved; this plan only changes the input layer and the visual polish.
- Phase 1A foundation: `docs/superpowers/plans/2026-05-02-roomos-phase-1a-foundation.md` — established the monorepo, schema, Clerk auth, brand-correct shell.
- Phase 1B PadSplit scraper: `docs/superpowers/plans/2026-05-03-roomos-phase-1b-padsplit-scraper.md` — the layer this plan deactivates. Code stays; jobs unscheduled.
- Phase 1C dashboard: `docs/superpowers/plans/2026-05-03-roomos-phase-1c-dashboard-ui.md` — components this plan restyles.
- Phase 1D bootstrap: `docs/superpowers/plans/2026-05-03-roomos-phase-1d-bootstrap-wizard.md` — settings + invitations stay untouched.
- Locked mockups (visual reference): `.superpowers/brainstorm/62120-1778263597/content/properties-list-v2.html`, `.superpowers/brainstorm/62120-1778263597/content/property-detail.html`.
- Vault location: `~/Documents/CoHost-Knowledge-Hub/`. 59 property `.md` files at root, 361 member dossiers in `members/`, plus `_INDEX.md` / `_RISK-LEDGER.md` / `_REVENUE.md` / dated `_SNAPSHOT-*` folders that this adapter ignores.

## What this plan does NOT cover (deferred)

- **Hospitable adapter** (Airbnb side) → Phase 2B.
- **REI Hub adapter** (long-term lease side) → Phase 2C.
- **Owner statement generator + GHL push** → Phase 2D.
- **A vault writer** (RoomOS-side edits flowing back to vault `.md` files) → Phase 3.
- **Cross-listing radar UI** beyond the data model — needs Hospitable to be wired in, so Phase 2B.
- **Owner mapping UI changes** — Settings → Owners (Phase 1D) is unchanged.

## Decisions locked

These are autonomous calls per the operator's `feedback_decision_pace.md` ("defer on technical, surface taste — make the call on infra/library/architecture").

- **Frontmatter library:** `gray-matter` (~1.5 kB gz, zero non-trivial transitive deps, used by countless static-site generators). Hand-rolled was tempting but YAML edge cases (multi-line strings, escaped quotes) are the kind of thing a tested library should handle.
- **Member identity strategy.** The vault property file lists members by name only; the dossier files in `members/` carry the PadSplit `member-id`. The adapter joins property-row → dossier on member name. When a name has no dossier match, we synthesize an external ID `vault:${padsplitPropertyId}-${roomNumber}-${slug(name)}` and store it on `Member.externalMemberId`. When the same name appears on two properties without dossiers, both rows are written under their respective synthetic IDs (different room numbers → different IDs). When the same name appears on two properties **with** dossiers and **the same** PadSplit member-id, that's the same human and the existing unique constraint `(platform, externalMemberId)` keeps them as one Member row.
- **Status text → enum mapping.** Defined as a single switch in `vault/persist/occupancy.ts`:
  - `Active` → `OCCUPIED`
  - `VACATED` / `Vacant` → emits a `VACANT` row and closes the prior occupancy
  - `TERMINATED` → emits an `INACTIVE` row, sets `currentBalance` from the row's `Balance Due` cell
  - `Moving in` → `MOVING_IN`
  - `Moving out` → `MOVING_OUT`
  - `Booking applicant` (extracted from a Flag, not from the members table) → emits a placeholder `WAITING_APPROVAL` occupancy with `memberId = null`
  - Anything else → logs a warning and skips that row
- **Flag severity inference** from the leading emoji on each `>` line of the `## Flags & Alerts` section: 🔴 → DANGER · ⚠️ → WARN · ✅ → OK · everything else → INFO.
- **Flag dedup key.** `(propertyId, source, sourceRef)` where `sourceRef` is a SHA1 of the raw flag line. Re-running the adapter with no vault changes produces zero new flag rows.
- **Cadence.** Every 15 minutes via launchd, replacing the existing `padsplit:occupancy` schedule. The vault is updated by the message-responder roughly every 15 min, so going faster wastes cycles.
- **Worker concurrency.** Vault sync runs serially (single inflight); a second tick while one is running is skipped, not queued. BullMQ deduplication via job ID `vault-sync-${YYYYMMDDHHmm-15-min-bucket}`.
- **Old PadSplit jobs.** `padsplit:discovery`, `padsplit:occupancy`, `padsplit:financials` stay in the tree but are unscheduled. The launchd plist gets a new template; old jobs become opt-in via `pnpm worker job padsplit-discovery` only (manual, for debugging). This avoids deleting tested code we'll want to reference for Phase 2B/2C.
- **Web fonts.** Source Serif 4 via `next/font/google` (variable font, weights 400-700, italic). Switzer via Fontshare `<link>` in `app/layout.tsx` head (`next/font` doesn't support Fontshare). FOIT mitigated with `display: swap`.
- **Color tokens.** New CSS vars in `globals.css` per the locked mockup palette. Old Phase 1C tokens (`--color-due`, etc.) renamed to match the new naming scheme; references in components updated. Diff is mechanical.
- **No Tailwind config changes.** Tailwind v4 reads CSS vars directly; we don't touch `tailwind.config.js`.
- **No new shadcn primitives** in this plan; existing ones cover the work.

---

## File structure (locked in before tasks)

```
roomos/
├── packages/
│   ├── db/
│   │   └── prisma/
│   │       ├── schema.prisma                 # MODIFIED — Task 2
│   │       └── migrations/
│   │           └── <ts>_phase_2a_vault/
│   │               └── migration.sql         # NEW — Task 2
│   └── worker/
│       ├── src/
│       │   ├── vault/                        # NEW package
│       │   │   ├── types.ts                  # Task 3
│       │   │   ├── parsers/
│       │   │   │   ├── frontmatter.ts        # Task 4
│       │   │   │   ├── members-table.ts      # Task 5
│       │   │   │   ├── flags.ts              # Task 6
│       │   │   │   ├── maintenance.ts        # Task 7
│       │   │   │   ├── dossier.ts            # Task 8
│       │   │   │   └── property-file.ts      # Task 9 (composes parsers 4-7)
│       │   │   ├── persist/
│       │   │   │   ├── property.ts           # Task 10
│       │   │   │   ├── room.ts               # Task 11
│       │   │   │   ├── member.ts             # Task 12
│       │   │   │   ├── occupancy.ts          # Task 13
│       │   │   │   └── flag.ts               # Task 14
│       │   │   ├── sync.ts                   # Task 15 — top-level orchestration
│       │   │   └── env.ts                    # Task 15 — VAULT_PATH + tests path
│       │   ├── jobs/
│       │   │   └── vault-sync.ts             # Task 16
│       │   ├── scheduler.ts                  # MODIFIED — Task 17
│       │   └── cli.ts                        # MODIFIED — Task 17 (adds `worker job vault-sync`)
│       ├── tests/
│       │   ├── vault/
│       │   │   ├── frontmatter.test.ts       # Task 4
│       │   │   ├── members-table.test.ts     # Task 5
│       │   │   ├── flags.test.ts             # Task 6
│       │   │   ├── maintenance.test.ts       # Task 7
│       │   │   ├── dossier.test.ts           # Task 8
│       │   │   ├── property-file.test.ts     # Task 9
│       │   │   ├── persist-property.test.ts  # Task 10
│       │   │   ├── persist-room.test.ts      # Task 11
│       │   │   ├── persist-member.test.ts    # Task 12
│       │   │   ├── persist-occupancy.test.ts # Task 13
│       │   │   ├── persist-flag.test.ts      # Task 14
│       │   │   └── sync.integration.test.ts  # Task 15 — uses real vault fixture
│       │   └── fixtures/
│       │       └── vault/
│       │           ├── 1311-Morgana-Rd.md    # Task 4 (real-world property file copy)
│       │           ├── members/
│       │           │   └── Jeffrey-Byrd.md   # Task 8
│       │           └── _INDEX.md             # Task 9
│       ├── launchd/
│       │   └── com.cohostmgmt.roomos.vault.plist.template  # NEW — Task 18
│       └── package.json                      # MODIFIED — Task 3 (add gray-matter)
├── apps/
│   └── web/
│       └── src/
│           ├── app/
│           │   ├── layout.tsx                # MODIFIED — Task 19 (font loaders)
│           │   ├── globals.css               # MODIFIED — Task 20 (tokens + font fallbacks)
│           │   └── (signed-in)/
│           │       ├── properties/
│           │       │   ├── page.tsx          # NEW — Task 22 (Properties list)
│           │       │   └── [propertyId]/
│           │       │       └── page.tsx      # NEW — Task 23 (Property detail)
│           │       └── rooms/
│           │           └── [roomId]/
│           │               └── page.tsx      # MODIFIED — Task 24 (palette + flag rail)
│           ├── components/
│           │   ├── properties/                # NEW directory
│           │   │   ├── PropertiesTable.tsx    # Task 22
│           │   │   ├── OccupancyDonut.tsx     # Task 21
│           │   │   ├── PropertyHero.tsx       # Task 23
│           │   │   ├── PropertyKpiStrip.tsx   # Task 23
│           │   │   ├── BedroomCard.tsx        # Task 23
│           │   │   ├── BedroomGrid.tsx        # Task 23
│           │   │   ├── PropertyDetailRail.tsx # Task 23
│           │   │   └── LiveFlagsCard.tsx      # Task 25
│           │   ├── nav/
│           │   │   └── Topbar.tsx             # MODIFIED — Task 20 (palette pass)
│           │   └── room-detail/               # MODIFIED in Task 24 (palette pass)
│           └── lib/
│               ├── property-queries.ts        # NEW — Task 22 (getProperties, getPropertyDetail, getLiveFlags)
│               └── format.ts                  # MODIFIED — Task 21 (donut math helpers)
└── docs/
    └── superpowers/
        ├── plans/
        │   └── 2026-05-08-roomos-phase-2a-vault-foundation.md  # this file
        └── DEPLOYMENT-2A.md                   # NEW — Task 1, finalized in Task 26
```

## Conventions

- **TDD throughout the parser + persist layers.** Pure-function parsers get fixture-driven Vitest tests; persist functions get tests against an in-memory Postgres (we already use a test database in CI per Phase 1B). UI components are verified by reading rendered HTML against expectations the same way Phase 1C does.
- **Server components by default** in the web layer. The Properties list, Property detail, and Live Flags are server components reading directly from `@roomos/db`. The OccupancyDonut and BedroomCard are presentational; they accept props and don't fetch.
- **No hardcoded hex.** All colors come from CSS vars in `globals.css`. The new tokens land in Task 20 and are referenced by name everywhere downstream.
- **Tabular numerals** stay on (already set on `body`). Source Serif 4 supports `font-variant-numeric: tabular-nums`; Switzer too.
- **Idempotency invariants** for the vault adapter:
  - Re-running `vault:sync` with no vault changes → 0 inserts, 0 updates beyond `last_synced_at` and a fresh `sync_runs` row.
  - Adding a row to a property's `Current Members` table → 1 new Room (if R# is new), 1 new Member (synthetic external ID if no dossier), 1 new Occupancy (the prior `VACANT` for that listing is closed).
  - Removing a row → an `INACTIVE` occupancy is written; no rows are deleted.
  - Adding a Flag → 1 new `property_flags` row keyed by `(propertyId, VAULT_SYNC, sha1(rawLine))`.
- **Logging.** All vault parser/persist calls log via the existing `log` from `packages/worker/src/log.ts`. Use `log.warn` for skipped/ambiguous rows; `log.error` only for failures that mean the whole sync is unsafe.
- **Commit cadence.** One commit per task that produces working code. Don't batch.

---

## Tasks

### Task 1: Bootstrap the Phase 2A migration doc

**Files:**
- Create: `docs/superpowers/DEPLOYMENT-2A.md`

- [ ] **Step 1: Write the migration doc skeleton**

```markdown
<!-- docs/superpowers/DEPLOYMENT-2A.md -->
# RoomOS Phase 2A — Manual Deployment Steps

This doc covers operator-side steps that can't be automated. Run these once after Phase 2A code lands on `main`.

## 1. Stop the old PadSplit scraper

```bash
launchctl unload ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist
mv ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist \
   ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist.disabled-2026-05-08
```

Confirm with `launchctl list | grep cohostmgmt` — should be empty.

## 2. Install the new vault-sync agent

(Filled in by Task 18 of the implementation plan.)

## 3. Set the VAULT_PATH env var

In `roomos/packages/worker/.env.local`:

```
VAULT_PATH=/Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub
```

## 4. Smoke test

(Filled in by Task 26.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-2A.md
git commit -m "docs(2a): start Phase 2A deployment doc"
```

---

### Task 2: Prisma schema delta + migration

**Files:**
- Modify: `roomos/packages/db/prisma/schema.prisma`
- Create: `roomos/packages/db/prisma/migrations/<timestamp>_phase_2a_vault/migration.sql`

- [ ] **Step 1: Add new enums to schema.prisma**

In `roomos/packages/db/prisma/schema.prisma`, find the `// Enums` section and append:

```prisma
enum FlagSeverity {
  DANGER
  WARN
  INFO
  OK
}

enum FlagSource {
  VAULT_SYNC
  HOSPITABLE
  REI_HUB
  MANUAL
}
```

Update `SyncKind`:

```prisma
enum SyncKind {
  DISCOVERY
  OCCUPANCY
  FINANCIAL
  INTERACTIVE_LOGIN
  VAULT_SYNC
}
```

- [ ] **Step 2: Add new fields to Property and Member models**

In the `model Property { ... }` block, after the `name String?` line, add:

```prisma
  padsplitPropertyId String?  @unique @map("padsplit_property_id")
  vaultFilePath      String?  @map("vault_file_path")
```

And add to the relations block (after `rooms Room[]`):

```prisma
  flags PropertyFlag[]
```

In the `model Member { ... }` block, after `profileUrl String? @map("profile_url")`, add:

```prisma
  memberDossierPath String? @map("member_dossier_path")
```

- [ ] **Step 3: Add the PropertyFlag model**

After the `model PaymentEvent` block, before the auth/ops/audit section divider, insert:

```prisma
model PropertyFlag {
  id         String       @id @default(cuid())
  orgId      String       @map("org_id")
  propertyId String       @map("property_id")
  roomId     String?      @map("room_id")
  severity   FlagSeverity
  title      String
  body       String?      @db.Text
  source     FlagSource
  sourceRef  String?      @map("source_ref")
  openedAt   DateTime     @default(now()) @map("opened_at")
  closedAt   DateTime?    @map("closed_at")

  org      Org      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@unique([propertyId, source, sourceRef])
  @@index([orgId, propertyId, closedAt])
  @@index([orgId, severity, closedAt])
  @@map("property_flags")
}
```

Add `propertyFlags PropertyFlag[]` to the `model Org { ... }` relations block.

- [ ] **Step 4: Generate the migration**

```bash
cd roomos
pnpm db:migrate -- --name phase_2a_vault
```

Expected: a new dir under `packages/db/prisma/migrations/<timestamp>_phase_2a_vault/` with `migration.sql`. The CLI applies the migration to the dev database.

- [ ] **Step 5: Verify the migration ran cleanly**

```bash
cd roomos
pnpm db:generate
psql $DATABASE_URL -c '\dt property_flags' -c '\d property_flags'
```

Expected: the table exists with all columns from step 3.

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/db/prisma/schema.prisma \
        roomos/packages/db/prisma/migrations/*_phase_2a_vault \
        roomos/packages/db/dist
git commit -m "schema(2a): property_flags + vault paths + padsplit_property_id"
```

---

### Task 3: Add `gray-matter` dep + write vault types

**Files:**
- Modify: `roomos/packages/worker/package.json`
- Create: `roomos/packages/worker/src/vault/types.ts`

- [ ] **Step 1: Install gray-matter**

```bash
cd roomos/packages/worker
pnpm add gray-matter
```

Expected: `package.json` gains `"gray-matter": "^4.0.3"` (or current). `pnpm-lock.yaml` updates.

- [ ] **Step 2: Write the types module**

Create `roomos/packages/worker/src/vault/types.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/package.json roomos/packages/worker/pnpm-lock.yaml roomos/pnpm-lock.yaml roomos/packages/worker/src/vault/types.ts
git commit -m "vault(2a): gray-matter dep + parser/persist types"
```

---

### Task 4: Frontmatter parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/frontmatter.ts`
- Test: `roomos/packages/worker/tests/vault/frontmatter.test.ts`
- Fixture: `roomos/packages/worker/tests/fixtures/vault/1311-Morgana-Rd.md`

- [ ] **Step 1: Drop a real fixture**

Copy the actual vault file as a test fixture:

```bash
cp ~/Documents/CoHost-Knowledge-Hub/1311-Morgana-Rd-Jacksonville-FL.md \
   roomos/packages/worker/tests/fixtures/vault/1311-Morgana-Rd.md
```

This is a real file with all the structure we're parsing. Using a real fixture keeps the parser honest.

- [ ] **Step 2: Write the failing test**

Create `roomos/packages/worker/tests/vault/frontmatter.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFrontmatter } from "../../src/vault/parsers/frontmatter"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseFrontmatter", () => {
  it("parses all known fields from a property file", () => {
    const fm = parseFrontmatter(FIXTURE)
    expect(fm.address).toBe("1311 Morgana Rd, Jacksonville, FL 32205")
    expect(fm.market).toBe("Jacksonville")
    expect(fm.state).toBe("FL")
    expect(fm.rooms).toBe(5)
    expect(fm.platform).toBe("PadSplit")
    expect(fm.padsplitPropertyId).toBe("28685")
    expect(fm.lastUpdated).toBe("2026-04-26")
  })

  it("returns nulls for fields absent from frontmatter", () => {
    const fm = parseFrontmatter(`---\naddress: "x"\n---\n`)
    expect(fm.market).toBeNull()
    expect(fm.rooms).toBeNull()
    expect(fm.padsplitPropertyId).toBeNull()
  })

  it("throws if there's no frontmatter block", () => {
    expect(() => parseFrontmatter("# no frontmatter")).toThrow(/frontmatter/i)
  })

  it("normalizes padsplit-property-id to a string even when YAML emits a number", () => {
    const fm = parseFrontmatter(`---\naddress: "x"\npadsplit-property-id: 12345\n---\n`)
    expect(fm.padsplitPropertyId).toBe("12345")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd roomos
pnpm --filter @roomos/worker test -- frontmatter
```

Expected: FAIL — module `../../src/vault/parsers/frontmatter` not found.

- [ ] **Step 4: Write the parser**

Create `roomos/packages/worker/src/vault/parsers/frontmatter.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd roomos
pnpm --filter @roomos/worker test -- frontmatter
```

Expected: 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/frontmatter.ts \
        roomos/packages/worker/tests/vault/frontmatter.test.ts \
        roomos/packages/worker/tests/fixtures/vault/1311-Morgana-Rd.md
git commit -m "vault(2a): frontmatter parser (TDD)"
```

---

### Task 5: Members table parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/members-table.ts`
- Test: `roomos/packages/worker/tests/vault/members-table.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/members-table.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMembersTable } from "../../src/vault/parsers/members-table"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseMembersTable", () => {
  it("parses all rows from the Current Members section", () => {
    const rows = parseMembersTable(FIXTURE)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({
      roomNumber: "R1",
      name: "Jeffrey Byrd",
      status: "Active",
      balanceText: "$0",
    })
  })

  it("strips bold markers from status cells", () => {
    const rows = parseMembersTable(FIXTURE)
    const r3 = rows.find((r) => r.roomNumber === "R3")!
    const r4 = rows.find((r) => r.roomNumber === "R4")!
    expect(r3.status).toBe("VACATED")     // not "**VACATED**"
    expect(r4.status).toBe("TERMINATED")
  })

  it("parses balance with cents", () => {
    const rows = parseMembersTable(FIXTURE)
    const r4 = rows.find((r) => r.roomNumber === "R4")!
    expect(r4.balanceText).toBe("$407.90")
  })

  it("returns empty array when there's no Current Members section", () => {
    expect(parseMembersTable("# no table here")).toEqual([])
  })

  it("normalizes room number capitalization", () => {
    const md = `## Current Members\n\n| Room | Name | Status | Balance Due | Notes |\n|--|--|--|--|--|\n| r2 | x | Active | $0 | |\n`
    expect(parseMembersTable(md)[0].roomNumber).toBe("R2")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- members-table
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the parser**

```typescript
// roomos/packages/worker/src/vault/parsers/members-table.ts
import type { VaultMemberRow, VaultMemberStatusText } from "../types"

const STATUS_VALUES: VaultMemberStatusText[] = [
  "Active",
  "VACATED",
  "TERMINATED",
  "Moving in",
  "Moving out",
  "Inactive",
]

export function parseMembersTable(content: string): VaultMemberRow[] {
  // Find the "## Current Members" heading and capture content until the next ## heading or --- divider.
  const sectionMatch = content.match(/##\s+Current Members\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/)
  if (!sectionMatch) return []
  const tableLines = sectionMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (tableLines.length < 3) return []
  // tableLines[0] is the header row; tableLines[1] is the separator (|----|...).
  const rows: VaultMemberRow[] = []
  for (const line of tableLines.slice(2)) {
    const cells = line.split("|").map((c) => c.trim())
    // Markdown tables produce empty leading/trailing cells from the bracketing |.
    // Expected layout: ["", roomNumber, name, status, balance, notes, ""]
    if (cells.length < 6) continue
    const [, roomNumber, name, statusRaw, balanceText, notes] = cells
    if (!roomNumber || !name) continue
    const status = stripBold(statusRaw)
    if (!STATUS_VALUES.includes(status as VaultMemberStatusText)) continue
    rows.push({
      roomNumber: roomNumber.toUpperCase(),
      name,
      status: status as VaultMemberStatusText,
      balanceText: balanceText || "$0",
      notes: notes ?? "",
    })
  }
  return rows
}

function stripBold(s: string): string {
  return s.replace(/^\*\*(.*?)\*\*$/, "$1").trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- members-table
```

Expected: 5/5 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/members-table.ts \
        roomos/packages/worker/tests/vault/members-table.test.ts
git commit -m "vault(2a): members table parser (TDD)"
```

---

### Task 6: Flags & Alerts parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/flags.ts`
- Test: `roomos/packages/worker/tests/vault/flags.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/flags.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseFlags } from "../../src/vault/parsers/flags"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseFlags", () => {
  it("extracts all blockquote lines under ## Flags & Alerts", () => {
    const flags = parseFlags(FIXTURE)
    expect(flags.length).toBeGreaterThanOrEqual(4)
  })

  it("infers DANGER from 🔴", () => {
    const flags = parseFlags(FIXTURE)
    const danger = flags.find((f) => f.title.includes("R3 VACANT"))
    expect(danger?.severity).toBe("DANGER")
  })

  it("infers WARN from ⚠️", () => {
    const flags = parseFlags(FIXTURE)
    const warn = flags.find((f) => f.title.includes("Kendra Shuck"))
    expect(warn?.severity).toBe("WARN")
  })

  it("infers OK from ✅", () => {
    const flags = parseFlags(FIXTURE)
    const ok = flags.find((f) => f.title.includes("Water leak"))
    expect(ok?.severity).toBe("OK")
  })

  it("captures the raw line for dedup hashing", () => {
    const flags = parseFlags(FIXTURE)
    expect(flags[0].rawLine.length).toBeGreaterThan(0)
  })

  it("returns empty array if there's no Flags & Alerts section", () => {
    expect(parseFlags("# nothing here")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- flags
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the parser**

```typescript
// roomos/packages/worker/src/vault/parsers/flags.ts
import type { VaultFlag, VaultFlagSeverity } from "../types"

export function parseFlags(content: string): VaultFlag[] {
  const sectionMatch = content.match(/##\s+Flags & Alerts\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/)
  if (!sectionMatch) return []
  const flags: VaultFlag[] = []
  for (const line of sectionMatch[1].split("\n")) {
    const m = line.match(/^>\s+(.+)$/)
    if (!m) continue
    const text = m[1].trim()
    if (!text) continue
    const severity = inferSeverity(text)
    const stripped = stripLeadingEmoji(text)
    const [titleRaw, ...bodyParts] = stripped.split(/\s—\s|\s-\s/)
    flags.push({
      severity,
      title: (titleRaw ?? stripped).trim(),
      body: bodyParts.join(" — ").trim(),
      rawLine: text,
    })
  }
  return flags
}

function inferSeverity(text: string): VaultFlagSeverity {
  if (/^🔴/.test(text)) return "DANGER"
  if (/^⚠️/.test(text) || /^💰/.test(text)) return "WARN"
  if (/^✅/.test(text)) return "OK"
  return "INFO"
}

function stripLeadingEmoji(text: string): string {
  // Strip a single emoji + optional space at the start.
  return text.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]\s*/u, "")
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- flags
```

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/flags.ts \
        roomos/packages/worker/tests/vault/flags.test.ts
git commit -m "vault(2a): flags & alerts parser (TDD)"
```

---

### Task 7: Maintenance items parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/maintenance.ts`
- Test: `roomos/packages/worker/tests/vault/maintenance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/maintenance.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMaintenance } from "../../src/vault/parsers/maintenance"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md"),
  "utf-8",
)

describe("parseMaintenance", () => {
  it("returns each row from the Open Maintenance Items table", () => {
    const items = parseMaintenance(FIXTURE)
    expect(items.length).toBeGreaterThan(0)
    expect(items[0]).toHaveProperty("description")
    expect(items[0]).toHaveProperty("status")
    expect(items[0]).toHaveProperty("priority")
  })

  it("strips bold markers from status cell", () => {
    const items = parseMaintenance(FIXTURE)
    expect(items[0].status).not.toContain("**")
  })

  it("returns empty array when there's no maintenance section", () => {
    expect(parseMaintenance("# nothing")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- maintenance
```

Expected: FAIL.

- [ ] **Step 3: Write the parser**

```typescript
// roomos/packages/worker/src/vault/parsers/maintenance.ts
import type { VaultMaintenanceItem } from "../types"

export function parseMaintenance(content: string): VaultMaintenanceItem[] {
  const sectionMatch = content.match(
    /##\s+Open Maintenance Items\s*\n([\s\S]*?)(?=\n##\s+|\n---|\n*$)/,
  )
  if (!sectionMatch) return []
  const lines = sectionMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
  if (lines.length < 3) return []
  const items: VaultMaintenanceItem[] = []
  for (const line of lines.slice(2)) {
    const cells = line.split("|").map((c) => c.trim())
    // Layout: ["", description, status, priority, assigned, opened, ""]
    if (cells.length < 4) continue
    const [, description, status, priority] = cells
    if (!description) continue
    items.push({
      description,
      status: status.replace(/\*\*/g, "").trim(),
      priority,
      raw: line,
    })
  }
  return items
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- maintenance
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/maintenance.ts \
        roomos/packages/worker/tests/vault/maintenance.test.ts
git commit -m "vault(2a): maintenance items parser (TDD)"
```

---

### Task 8: Member dossier parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/dossier.ts`
- Test: `roomos/packages/worker/tests/vault/dossier.test.ts`
- Fixture: `roomos/packages/worker/tests/fixtures/vault/members/Abhay-Azariah.md`

- [ ] **Step 1: Drop a real dossier fixture**

```bash
cp ~/Documents/CoHost-Knowledge-Hub/members/Abhay-Azariah.md \
   roomos/packages/worker/tests/fixtures/vault/members/Abhay-Azariah.md
```

- [ ] **Step 2: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/dossier.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseDossier } from "../../src/vault/parsers/dossier"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/vault/members/Abhay-Azariah.md"),
  "utf-8",
)

describe("parseDossier", () => {
  it("extracts member-id, name, email, phone from frontmatter", () => {
    const d = parseDossier(FIXTURE, "/abs/path/Abhay-Azariah.md")
    expect(d.memberId).toBe("709784")
    expect(d.name).toBe("Abhay Azariah")
    expect(d.email).toBe("abhay1azariah@gmail.com")
    expect(d.phone).toBe("(980) 875-8074")
    expect(d.weeklyRate).toBe(205)
  })

  it("captures the file path verbatim", () => {
    const d = parseDossier(FIXTURE, "/abs/path/Abhay-Azariah.md")
    expect(d.filePath).toBe("/abs/path/Abhay-Azariah.md")
  })

  it("treats missing frontmatter fields as null, not undefined", () => {
    const d = parseDossier(`---\nname: "x"\n---\n`, "/x.md")
    expect(d.memberId).toBeNull()
    expect(d.email).toBeNull()
    expect(d.weeklyRate).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- dossier
```

Expected: FAIL.

- [ ] **Step 4: Write the parser**

```typescript
// roomos/packages/worker/src/vault/parsers/dossier.ts
import matter from "gray-matter"
import type { VaultMemberDossier } from "../types"

export function parseDossier(content: string, filePath: string): VaultMemberDossier {
  const { data } = matter(content)
  const str = (k: string): string | null => {
    const v = data[k]
    return v === undefined || v === null || v === "" ? null : String(v)
  }
  const num = (k: string): number | null => {
    const v = data[k]
    if (v === undefined || v === null || v === "") return null
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    filePath,
    memberId: str("member-id"),
    name: str("name") ?? "",
    email: str("email-cached"),
    phone: str("phone-cached"),
    weeklyRate: num("weekly-rate"),
    moveInDate: str("move-in-date"),
    status: str("status"),
    balance: num("balance"),
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- dossier
```

Expected: 3/3 pass.

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/dossier.ts \
        roomos/packages/worker/tests/vault/dossier.test.ts \
        roomos/packages/worker/tests/fixtures/vault/members/Abhay-Azariah.md
git commit -m "vault(2a): member dossier parser (TDD)"
```

---

### Task 9: Compose parsers into `parsePropertyFile()`

**Files:**
- Create: `roomos/packages/worker/src/vault/parsers/property-file.ts`
- Test: `roomos/packages/worker/tests/vault/property-file.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/property-file.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePropertyFile } from "../../src/vault/parsers/property-file"

const FIXTURE_PATH = join(__dirname, "../fixtures/vault/1311-Morgana-Rd.md")
const FIXTURE = readFileSync(FIXTURE_PATH, "utf-8")

describe("parsePropertyFile", () => {
  it("composes the four sub-parsers into one VaultPropertyFile", () => {
    const f = parsePropertyFile(FIXTURE, FIXTURE_PATH)
    expect(f.padsplitPropertyId).toBe("28685")
    expect(f.address).toContain("1311 Morgana")
    expect(f.members).toHaveLength(6)
    expect(f.flagsAndAlerts.length).toBeGreaterThanOrEqual(4)
    expect(f.maintenanceItems.length).toBeGreaterThan(0)
    expect(f.filePath).toBe(FIXTURE_PATH)
  })

  it("throws if frontmatter has no padsplit-property-id", () => {
    const noPadId = `---\naddress: "x"\n---\n# x`
    expect(() => parsePropertyFile(noPadId, "/x.md")).toThrow(/padsplit-property-id/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — module not found.

- [ ] **Step 3: Write the composer**

```typescript
// roomos/packages/worker/src/vault/parsers/property-file.ts
import type { VaultPropertyFile } from "../types"
import { parseFrontmatter } from "./frontmatter"
import { parseMembersTable } from "./members-table"
import { parseFlags } from "./flags"
import { parseMaintenance } from "./maintenance"

export function parsePropertyFile(content: string, filePath: string): VaultPropertyFile {
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- property-file
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/parsers/property-file.ts \
        roomos/packages/worker/tests/vault/property-file.test.ts
git commit -m "vault(2a): property-file composer (TDD)"
```

---

### Task 10: Property upserter (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/persist/property.ts`
- Test: `roomos/packages/worker/tests/vault/persist-property.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/persist-property.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertProperty } from "../../src/vault/persist/property"

const ORG_ID = "org-test-2a"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2A" } })
})

describe("upsertProperty", () => {
  it("creates a new property when padsplitPropertyId is unseen", async () => {
    const id = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "11111",
      address: "1 Test Lane",
      city: "Jacksonville",
      state: "FL",
      market: "Jacksonville",
      vaultFilePath: "/v/1.md",
    })
    const row = await prisma.property.findUnique({ where: { id } })
    expect(row?.padsplitPropertyId).toBe("11111")
    expect(row?.address).toBe("1 Test Lane")
  })

  it("updates the same property on second call (idempotent)", async () => {
    const id1 = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "22222",
      address: "First Address",
      vaultFilePath: "/v/2.md",
    })
    const id2 = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "22222",
      address: "Second Address",
      vaultFilePath: "/v/2.md",
    })
    expect(id2).toBe(id1)
    const row = await prisma.property.findUnique({ where: { id: id1 } })
    expect(row?.address).toBe("Second Address")
  })

  it("derives city from comma-separated address when city is not provided", async () => {
    const id = await upsertProperty(ORG_ID, {
      padsplitPropertyId: "33333",
      address: "5 Sample Ave, Tampa, FL 33602",
      vaultFilePath: "/v/3.md",
    })
    const row = await prisma.property.findUnique({ where: { id } })
    expect(row?.city).toBe("Tampa")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- persist-property
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the upserter**

```typescript
// roomos/packages/worker/src/vault/persist/property.ts
import { prisma } from "@roomos/db"

export type UpsertPropertyInput = {
  padsplitPropertyId: string
  address: string
  city?: string | null
  state?: string | null
  market?: string | null
  vaultFilePath: string
}

export async function upsertProperty(orgId: string, input: UpsertPropertyInput): Promise<string> {
  const existing = await prisma.property.findUnique({
    where: { padsplitPropertyId: input.padsplitPropertyId },
  })
  const data = {
    orgId,
    padsplitPropertyId: input.padsplitPropertyId,
    address: input.address,
    city: input.city ?? deriveCity(input.address),
    state: input.state ?? null,
    market: input.market ?? null,
    vaultFilePath: input.vaultFilePath,
  }
  if (existing) {
    await prisma.property.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.property.create({ data })
  return created.id
}

function deriveCity(address: string): string | null {
  // "1311 Morgana Rd, Jacksonville, FL 32205" → "Jacksonville"
  const parts = address.split(",").map((p) => p.trim())
  return parts[1] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- persist-property
```

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/persist/property.ts \
        roomos/packages/worker/tests/vault/persist-property.test.ts
git commit -m "vault(2a): property upserter (TDD)"
```

---

### Task 11: Room upserter (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/persist/room.ts`
- Test: `roomos/packages/worker/tests/vault/persist-room.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/persist-room.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertRoomWithListing } from "../../src/vault/persist/room"

const ORG_ID = "org-test-2a-room"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG ROOM" } })
})

describe("upsertRoomWithListing", () => {
  it("creates a Room and an active PADSPLIT PlatformListing in one call", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: "99001" },
    })
    const { roomId, listingId } = await upsertRoomWithListing(ORG_ID, property.id, "R1")
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    const listing = await prisma.platformListing.findUnique({ where: { id: listingId } })
    expect(room?.roomNumber).toBe("R1")
    expect(listing?.platform).toBe("PADSPLIT")
    expect(listing?.isActive).toBe(true)
  })

  it("is idempotent — second call returns the same IDs", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: "99002" },
    })
    const a = await upsertRoomWithListing(ORG_ID, property.id, "R1")
    const b = await upsertRoomWithListing(ORG_ID, property.id, "R1")
    expect(b.roomId).toBe(a.roomId)
    expect(b.listingId).toBe(a.listingId)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Write the upserter**

```typescript
// roomos/packages/worker/src/vault/persist/room.ts
import { prisma } from "@roomos/db"

export async function upsertRoomWithListing(
  orgId: string,
  propertyId: string,
  roomNumber: string,
): Promise<{ roomId: string; listingId: string }> {
  let room = await prisma.room.findFirst({
    where: { orgId, propertyId, roomNumber },
  })
  if (!room) {
    room = await prisma.room.create({ data: { orgId, propertyId, roomNumber } })
  }
  let listing = await prisma.platformListing.findUnique({
    where: { roomId_platform: { roomId: room.id, platform: "PADSPLIT" } },
  })
  if (!listing) {
    listing = await prisma.platformListing.create({
      data: {
        orgId,
        roomId: room.id,
        platform: "PADSPLIT",
        isActive: true,
      },
    })
  }
  return { roomId: room.id, listingId: listing.id }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/persist/room.ts \
        roomos/packages/worker/tests/vault/persist-room.test.ts
git commit -m "vault(2a): room+listing upserter (TDD)"
```

---

### Task 12: Member upserter (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/persist/member.ts`
- Test: `roomos/packages/worker/tests/vault/persist-member.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/persist-member.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertMember } from "../../src/vault/persist/member"

const ORG_ID = "org-test-2a-member"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG MEMBER" } })
})

describe("upsertMember", () => {
  it("uses the dossier memberId when provided", async () => {
    const id = await upsertMember(ORG_ID, {
      name: "Jeffrey Byrd",
      dossier: { memberId: "8001", email: "j@x.com", phone: null, dossierPath: "/m/j.md", weeklyRate: 200 },
      padsplitPropertyId: "28685",
      roomNumber: "R1",
    })
    const m = await prisma.member.findUnique({ where: { id } })
    expect(m?.externalMemberId).toBe("8001")
    expect(m?.email).toBe("j@x.com")
  })

  it("synthesizes an externalMemberId when no dossier is found", async () => {
    const id = await upsertMember(ORG_ID, {
      name: "Lawrence Drayton",
      dossier: null,
      padsplitPropertyId: "28685",
      roomNumber: "R6",
    })
    const m = await prisma.member.findUnique({ where: { id } })
    expect(m?.externalMemberId).toBe("vault:28685-R6-lawrence-drayton")
  })

  it("is idempotent — re-upserting the same logical member returns the same id", async () => {
    const a = await upsertMember(ORG_ID, {
      name: "Devin Carey",
      dossier: { memberId: "8002", email: null, phone: null, dossierPath: null, weeklyRate: null },
      padsplitPropertyId: "28685",
      roomNumber: "R2",
    })
    const b = await upsertMember(ORG_ID, {
      name: "Devin Carey",
      dossier: { memberId: "8002", email: "newer@x.com", phone: null, dossierPath: null, weeklyRate: null },
      padsplitPropertyId: "28685",
      roomNumber: "R2",
    })
    expect(b).toBe(a)
    const m = await prisma.member.findUnique({ where: { id: a } })
    expect(m?.email).toBe("newer@x.com")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Write the upserter**

```typescript
// roomos/packages/worker/src/vault/persist/member.ts
import { prisma } from "@roomos/db"

export type UpsertMemberInput = {
  name: string
  dossier: {
    memberId: string | null
    email: string | null
    phone: string | null
    dossierPath: string | null
    weeklyRate: number | null
  } | null
  padsplitPropertyId: string
  roomNumber: string
}

export async function upsertMember(orgId: string, input: UpsertMemberInput): Promise<string> {
  const externalMemberId =
    input.dossier?.memberId ??
    `vault:${input.padsplitPropertyId}-${input.roomNumber}-${slug(input.name)}`

  const existing = await prisma.member.findUnique({
    where: { platform_externalMemberId: { platform: "PADSPLIT", externalMemberId } },
  })

  const data = {
    orgId,
    platform: "PADSPLIT" as const,
    externalMemberId,
    name: input.name,
    email: input.dossier?.email ?? null,
    phone: input.dossier?.phone ?? null,
    memberDossierPath: input.dossier?.dossierPath ?? null,
  }

  if (existing) {
    await prisma.member.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.member.create({ data })
  return created.id
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/persist/member.ts \
        roomos/packages/worker/tests/vault/persist-member.test.ts
git commit -m "vault(2a): member upserter with synthetic IDs (TDD)"
```

---

### Task 13: Occupancy upserter with status mapping (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/persist/occupancy.ts`
- Test: `roomos/packages/worker/tests/vault/persist-occupancy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/persist-occupancy.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertOccupancyForListing, mapStatusText } from "../../src/vault/persist/occupancy"

const ORG_ID = "org-test-2a-occ"

async function seedListing() {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG OCC" } })
  const property = await prisma.property.create({
    data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` },
  })
  const room = await prisma.room.create({ data: { orgId: org.id, propertyId: property.id, roomNumber: "R1" } })
  const listing = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: room.id, platform: "PADSPLIT" },
  })
  const member = await prisma.member.create({
    data: { orgId: org.id, platform: "PADSPLIT", externalMemberId: `m-${Date.now()}`, name: "X" },
  })
  return { listing, member }
}

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

describe("mapStatusText", () => {
  it.each([
    ["Active", "OCCUPIED"],
    ["VACATED", "VACANT"],
    ["TERMINATED", "INACTIVE"],
    ["Moving in", "MOVING_IN"],
    ["Moving out", "MOVING_OUT"],
    ["Inactive", "INACTIVE"],
  ])("maps %s -> %s", (text, enumVal) => {
    expect(mapStatusText(text)).toBe(enumVal)
  })
})

describe("upsertOccupancyForListing", () => {
  it("creates a single OCCUPIED row for an Active member", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID,
      listingId: listing.id,
      memberId: member.id,
      statusText: "Active",
      balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("OCCUPIED")
  })

  it("on TERMINATED, sets currentBalance from the balance text", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID,
      listingId: listing.id,
      memberId: member.id,
      statusText: "TERMINATED",
      balanceText: "$407.90",
    })
    const row = await prisma.occupancy.findFirst({ where: { listingId: listing.id } })
    expect(row?.status).toBe("INACTIVE")
    expect(Number(row?.currentBalance)).toBeCloseTo(407.9)
  })

  it("transitioning Active → VACATED closes the prior occupancy and writes a VACANT row", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: null,
      statusText: "VACATED", balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({
      where: { listingId: listing.id },
      orderBy: { createdAt: "asc" },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].leaseEndDate).not.toBeNull()       // first occupancy was closed
    expect(rows[1].status).toBe("VACANT")
  })

  it("re-running the same Active call is a no-op (idempotent)", async () => {
    const { listing, member } = await seedListing()
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    await upsertOccupancyForListing({
      orgId: ORG_ID, listingId: listing.id, memberId: member.id,
      statusText: "Active", balanceText: "$0",
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — module not found.

- [ ] **Step 3: Write the upserter**

```typescript
// roomos/packages/worker/src/vault/persist/occupancy.ts
import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"

export function mapStatusText(text: string): OccupancyStatus | null {
  switch (text) {
    case "Active":      return "OCCUPIED"
    case "VACATED":
    case "Vacant":      return "VACANT"
    case "TERMINATED":  return "INACTIVE"
    case "Moving in":   return "MOVING_IN"
    case "Moving out":  return "MOVING_OUT"
    case "Inactive":    return "INACTIVE"
    default:            return null
  }
}

function parseBalance(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, "").trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export type UpsertOccupancyInput = {
  orgId: string
  listingId: string
  memberId: string | null
  statusText: string
  balanceText: string
}

export async function upsertOccupancyForListing(input: UpsertOccupancyInput): Promise<void> {
  const status = mapStatusText(input.statusText)
  if (!status) return

  const current = await prisma.occupancy.findFirst({
    where: { listingId: input.listingId, leaseEndDate: null },
    orderBy: { createdAt: "desc" },
  })

  // Idempotency check: if the current open occupancy already matches what we're about to write, exit.
  if (
    current &&
    current.status === status &&
    current.memberId === input.memberId
  ) {
    return
  }

  // If there's an open occupancy with a different shape, close it.
  if (current) {
    await prisma.occupancy.update({
      where: { id: current.id },
      data: { leaseEndDate: new Date() },
    })
  }

  const balance = parseBalance(input.balanceText)
  await prisma.occupancy.create({
    data: {
      orgId: input.orgId,
      listingId: input.listingId,
      memberId: input.memberId,
      status,
      currentBalance: balance,
      scrapedAt: new Date(),
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 4/4 pass plus 6 mapStatusText cases.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/persist/occupancy.ts \
        roomos/packages/worker/tests/vault/persist-occupancy.test.ts
git commit -m "vault(2a): occupancy upserter with status mapping (TDD)"
```

---

### Task 14: Property flag upserter (TDD)

**Files:**
- Create: `roomos/packages/worker/src/vault/persist/flag.ts`
- Test: `roomos/packages/worker/tests/vault/persist-flag.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// roomos/packages/worker/tests/vault/persist-flag.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertFlag } from "../../src/vault/persist/flag"

const ORG_ID = "org-test-2a-flag"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedProperty() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG FLAG" } })
  const property = await prisma.property.create({
    data: { orgId: org.id, address: "x", padsplitPropertyId: `f-${Date.now()}` },
  })
  return property
}

describe("upsertFlag", () => {
  it("creates a new flag with severity + sourceRef", async () => {
    const property = await seedProperty()
    await upsertFlag({
      orgId: ORG_ID,
      propertyId: property.id,
      severity: "DANGER",
      title: "R3 VACANT — relist",
      body: "Katrina moved out",
      rawLine: "🔴 R3 VACANT — Katrina moved out",
    })
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].severity).toBe("DANGER")
    expect(rows[0].source).toBe("VAULT_SYNC")
  })

  it("is idempotent — same rawLine produces no new row", async () => {
    const property = await seedProperty()
    const args = {
      orgId: ORG_ID,
      propertyId: property.id,
      severity: "WARN" as const,
      title: "x",
      body: "y",
      rawLine: "⚠️ x — y",
    }
    await upsertFlag(args)
    await upsertFlag(args)
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(1)
  })

  it("a different rawLine creates a second flag row", async () => {
    const property = await seedProperty()
    await upsertFlag({
      orgId: ORG_ID, propertyId: property.id,
      severity: "WARN", title: "first", body: "", rawLine: "⚠️ first",
    })
    await upsertFlag({
      orgId: ORG_ID, propertyId: property.id,
      severity: "INFO", title: "second", body: "", rawLine: "📋 second",
    })
    const rows = await prisma.propertyFlag.findMany({ where: { propertyId: property.id } })
    expect(rows).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Write the upserter**

```typescript
// roomos/packages/worker/src/vault/persist/flag.ts
import { createHash } from "node:crypto"
import { prisma } from "@roomos/db"
import type { FlagSeverity } from "@roomos/db"

export type UpsertFlagInput = {
  orgId: string
  propertyId: string
  severity: FlagSeverity
  title: string
  body: string
  rawLine: string
}

export async function upsertFlag(input: UpsertFlagInput): Promise<void> {
  const sourceRef = createHash("sha1").update(input.rawLine).digest("hex").slice(0, 16)
  await prisma.propertyFlag.upsert({
    where: {
      propertyId_source_sourceRef: {
        propertyId: input.propertyId,
        source: "VAULT_SYNC",
        sourceRef,
      },
    },
    create: {
      orgId: input.orgId,
      propertyId: input.propertyId,
      severity: input.severity,
      title: input.title,
      body: input.body,
      source: "VAULT_SYNC",
      sourceRef,
    },
    update: {
      severity: input.severity,
      title: input.title,
      body: input.body,
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/vault/persist/flag.ts \
        roomos/packages/worker/tests/vault/persist-flag.test.ts
git commit -m "vault(2a): property flag upserter (TDD)"
```

---

### Task 15: Top-level `syncVault()` orchestration (integration test)

**Files:**
- Create: `roomos/packages/worker/src/vault/env.ts`
- Create: `roomos/packages/worker/src/vault/sync.ts`
- Test: `roomos/packages/worker/tests/vault/sync.integration.test.ts`

- [ ] **Step 1: Write the env helper**

```typescript
// roomos/packages/worker/src/vault/env.ts
import { existsSync } from "node:fs"

export function vaultPath(): string {
  const v = process.env.VAULT_PATH
  if (!v) throw new Error("VAULT_PATH env var not set")
  if (!existsSync(v)) throw new Error(`VAULT_PATH does not exist: ${v}`)
  return v
}
```

- [ ] **Step 2: Write the failing integration test**

The test points at the test fixtures dir and asserts that running sync end-to-end produces the right rows.

```typescript
// roomos/packages/worker/tests/vault/sync.integration.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { syncVault } from "../../src/vault/sync"
import { join } from "node:path"

const ORG_ID = "org-test-2a-sync"
const FIXTURE_VAULT = join(__dirname, "../fixtures/vault")

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG SYNC" } })
})

describe("syncVault (integration, fixture vault)", () => {
  it("end-to-end: parses 1311 Morgana fixture and writes property + 6 rooms + 6 occupancies + flags", async () => {
    const result = await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    expect(result.errors).toEqual([])
    expect(result.propertiesUpserted).toBe(1)
    expect(result.roomsUpserted).toBe(6)
    expect(result.occupanciesUpserted).toBe(6)
    expect(result.flagsUpserted).toBeGreaterThanOrEqual(4)

    const property = await prisma.property.findUnique({ where: { padsplitPropertyId: "28685" } })
    expect(property).not.toBeNull()
    const rooms = await prisma.room.findMany({ where: { propertyId: property!.id } })
    expect(rooms.map((r) => r.roomNumber).sort()).toEqual(["R1", "R2", "R3", "R4", "R5", "R6"])
  })

  it("running twice is idempotent — second run produces 0 new rows", async () => {
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const before = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    const flagsBefore = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const after = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    const flagsAfter = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    expect(after).toBe(before)
    expect(flagsAfter).toBe(flagsBefore)
  })

  it("writes a SyncRun row with kind=VAULT_SYNC and status=SUCCESS", async () => {
    await syncVault({ orgId: ORG_ID, vaultPath: FIXTURE_VAULT })
    const run = await prisma.syncRun.findFirst({
      where: { orgId: ORG_ID, kind: "VAULT_SYNC" },
      orderBy: { startedAt: "desc" },
    })
    expect(run?.status).toBe("SUCCESS")
    expect(run?.itemsSynced).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL — module not found.

- [ ] **Step 4: Write the orchestrator**

```typescript
// roomos/packages/worker/src/vault/sync.ts
import { readdirSync, readFileSync } from "node:fs"
import { join, basename } from "node:path"
import { prisma } from "@roomos/db"
import { log } from "../log"
import { parsePropertyFile } from "./parsers/property-file"
import { parseDossier } from "./parsers/dossier"
import { upsertProperty } from "./persist/property"
import { upsertRoomWithListing } from "./persist/room"
import { upsertMember } from "./persist/member"
import { upsertOccupancyForListing } from "./persist/occupancy"
import { upsertFlag } from "./persist/flag"
import type { VaultSyncResult, VaultMemberDossier } from "./types"

export type SyncVaultInput = {
  orgId: string
  vaultPath: string
}

export async function syncVault(input: SyncVaultInput): Promise<VaultSyncResult> {
  const result: VaultSyncResult = {
    propertiesParsed: 0,
    membersDossiersParsed: 0,
    propertiesUpserted: 0,
    roomsUpserted: 0,
    membersUpserted: 0,
    occupanciesUpserted: 0,
    flagsUpserted: 0,
    errors: [],
  }

  const syncRun = await prisma.syncRun.create({
    data: { orgId: input.orgId, kind: "VAULT_SYNC", platform: "PADSPLIT", status: "RUNNING" },
  })

  try {
    const dossiers = loadDossiers(input.vaultPath)
    result.membersDossiersParsed = dossiers.size

    const propertyFiles = readdirSync(input.vaultPath).filter(
      (n) => n.endsWith(".md") && !n.startsWith("_") && !n.startsWith("."),
    )

    for (const fileName of propertyFiles) {
      const filePath = join(input.vaultPath, fileName)
      try {
        const content = readFileSync(filePath, "utf-8")
        const parsed = parsePropertyFile(content, filePath)
        result.propertiesParsed++

        const propertyId = await upsertProperty(input.orgId, {
          padsplitPropertyId: parsed.padsplitPropertyId,
          address: parsed.address,
          city: null,
          state: parsed.state,
          market: parsed.market,
          vaultFilePath: filePath,
        })
        result.propertiesUpserted++

        for (const row of parsed.members) {
          const { roomId, listingId } = await upsertRoomWithListing(
            input.orgId,
            propertyId,
            row.roomNumber,
          )
          result.roomsUpserted++

          const dossier = dossiers.get(row.name) ?? null
          const memberId = await upsertMember(input.orgId, {
            name: row.name,
            dossier: dossier
              ? {
                  memberId: dossier.memberId,
                  email: dossier.email,
                  phone: dossier.phone,
                  dossierPath: dossier.filePath,
                  weeklyRate: dossier.weeklyRate,
                }
              : null,
            padsplitPropertyId: parsed.padsplitPropertyId,
            roomNumber: row.roomNumber,
          })
          result.membersUpserted++

          await upsertOccupancyForListing({
            orgId: input.orgId,
            listingId,
            memberId,
            statusText: row.status,
            balanceText: row.balanceText,
          })
          result.occupanciesUpserted++

          // ignore roomId in this phase; reserved for future room-level flagging
          void roomId
        }

        for (const flag of parsed.flagsAndAlerts) {
          await upsertFlag({
            orgId: input.orgId,
            propertyId,
            severity: flag.severity,
            title: flag.title,
            body: flag.body,
            rawLine: flag.rawLine,
          })
          result.flagsUpserted++
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        log.warn({ filePath, reason }, "vault sync: skipped file")
        result.errors.push({ file: fileName, reason })
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        completedAt: new Date(),
        status: result.errors.length > 0 ? "PARTIAL" : "SUCCESS",
        itemsSynced: result.propertiesUpserted,
        errorsJson: result.errors.length > 0 ? result.errors : undefined,
      },
    })
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        completedAt: new Date(),
        status: "FAILED",
        errorsJson: { fatal: String(err) },
      },
    })
    throw err
  }

  return result
}

function loadDossiers(vaultPath: string): Map<string, VaultMemberDossier> {
  const dossiersDir = join(vaultPath, "members")
  let entries: string[]
  try {
    entries = readdirSync(dossiersDir).filter((n) => n.endsWith(".md"))
  } catch {
    return new Map()
  }
  const map = new Map<string, VaultMemberDossier>()
  for (const fileName of entries) {
    const filePath = join(dossiersDir, fileName)
    try {
      const content = readFileSync(filePath, "utf-8")
      const dossier = parseDossier(content, filePath)
      if (dossier.name) map.set(dossier.name, dossier)
    } catch (err) {
      log.warn({ fileName }, "vault sync: skipped dossier")
    }
  }
  return map
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd roomos && pnpm --filter @roomos/worker test -- sync.integration
```

Expected: 3/3 pass. The fixture vault contains exactly one property file (1311-Morgana-Rd.md) and one dossier (Abhay-Azariah.md, which won't match anyone in 1311 Morgana — so Jeffrey/Devin/etc. will get synthetic IDs).

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/worker/src/vault/env.ts \
        roomos/packages/worker/src/vault/sync.ts \
        roomos/packages/worker/tests/vault/sync.integration.test.ts
git commit -m "vault(2a): syncVault orchestration (integration TDD)"
```

---

### Task 16: BullMQ job wrapper

**Files:**
- Create: `roomos/packages/worker/src/jobs/vault-sync.ts`

- [ ] **Step 1: Write the job wrapper**

```typescript
// roomos/packages/worker/src/jobs/vault-sync.ts
import { syncVault } from "../vault/sync"
import { vaultPath } from "../vault/env"
import { getOrg } from "../persist"
import { log } from "../log"

export async function processVaultSync() {
  const org = await getOrg()
  const result = await syncVault({ orgId: org.id, vaultPath: vaultPath() })
  log.info({ result }, "vault-sync: complete")
  return result
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/packages/worker/src/jobs/vault-sync.ts
git commit -m "vault(2a): vault-sync BullMQ job wrapper"
```

---

### Task 17: Wire vault-sync into the scheduler + CLI; deactivate old PadSplit jobs

**Files:**
- Modify: `roomos/packages/worker/src/scheduler.ts`
- Modify: `roomos/packages/worker/src/cli.ts`

- [ ] **Step 1: Read existing scheduler to understand current job registration**

```bash
cat roomos/packages/worker/src/scheduler.ts
cat roomos/packages/worker/src/cli.ts
```

Note the existing job names and how `padsplit-occupancy` is scheduled. The vault-sync replaces it 1:1.

- [ ] **Step 2: Add vault-sync to the scheduler**

In `scheduler.ts`, where `padsplit:occupancy` is registered with a 30-min repeat, **comment out** the existing PadSplit job registrations (do not delete — keep available via `worker job <name>` for Phase 2B/2C debugging) and add:

```typescript
import { processVaultSync } from "./jobs/vault-sync"

// Vault sync: every 15 minutes (replaces PadSplit occupancy + financial scrapers).
queue.add(
  "vault-sync",
  {},
  {
    repeat: { every: 15 * 60 * 1000 },
    jobId: "vault-sync-recurring",
    removeOnComplete: 100,
    removeOnFail: 50,
  },
)
```

And in the worker process function, add the `vault-sync` case before the existing PadSplit cases:

```typescript
case "vault-sync":
  return processVaultSync()
```

- [ ] **Step 3: Add `worker job vault-sync` to the CLI**

In `cli.ts`, add a case:

```typescript
case "vault-sync":
  await processVaultSync()
  break
```

- [ ] **Step 4: Smoke test**

```bash
cd roomos
VAULT_PATH=/Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub \
  pnpm --filter @roomos/worker exec node -r tsx/cjs src/cli.ts vault-sync
```

Expected: log lines like `vault-sync: complete { propertiesParsed: 59, ... }`. Inspect `psql $DATABASE_URL -c 'select count(*) from properties;'` — should be 59.

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/scheduler.ts roomos/packages/worker/src/cli.ts
git commit -m "vault(2a): schedule vault-sync every 15 min; old PadSplit jobs unscheduled"
```

---

### Task 18: launchd plist for the new vault-sync agent

**Files:**
- Create: `roomos/packages/worker/launchd/com.cohostmgmt.roomos.vault.plist.template`
- Modify: `roomos/packages/worker/launchd/install.sh`
- Modify: `docs/superpowers/DEPLOYMENT-2A.md`

- [ ] **Step 1: Read existing plist template for the pattern**

```bash
cat roomos/packages/worker/launchd/com.cohostmgmt.roomos.worker.plist.template
```

Copy the patterns: WorkingDirectory, ProgramArguments, EnvironmentVariables, StandardOutPath/ErrorPath.

- [ ] **Step 2: Write the new plist template**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cohostmgmt.roomos.vault</string>
  <key>WorkingDirectory</key>
  <string>__WORKING_DIRECTORY__</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/pnpm</string>
    <string>--filter</string>
    <string>@roomos/worker</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VAULT_PATH</key>
    <string>__VAULT_PATH__</string>
    <key>DATABASE_URL</key>
    <string>__DATABASE_URL__</string>
    <key>REDIS_URL</key>
    <string>__REDIS_URL__</string>
    <key>WORKER_HEARTBEAT_URL</key>
    <string>__WORKER_HEARTBEAT_URL__</string>
    <key>WORKER_TOKEN</key>
    <string>__WORKER_TOKEN__</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>__LOG_DIR__/vault.out.log</string>
  <key>StandardErrorPath</key>
  <string>__LOG_DIR__/vault.err.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Update `install.sh` to write the new plist**

Add a section that takes a `VAULT_PATH` arg and substitutes it into the new template, in addition to the existing `worker` plist substitution. Reference the existing pattern in install.sh.

- [ ] **Step 4: Update `DEPLOYMENT-2A.md` with the install command**

Append to section 2 of `DEPLOYMENT-2A.md`:

```markdown
## 2. Install the new vault-sync agent

```bash
cd roomos/packages/worker/launchd
./install.sh --vault-path /Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub
```

Expected: `~/Library/LaunchAgents/com.cohostmgmt.roomos.vault.plist` is created and loaded. Confirm with:

```bash
launchctl list | grep cohostmgmt.roomos.vault
```

The first sync should fire within seconds. Tail logs:

```bash
tail -f ~/Library/Logs/RoomOS/vault.out.log
```
```

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/launchd/com.cohostmgmt.roomos.vault.plist.template \
        roomos/packages/worker/launchd/install.sh \
        docs/superpowers/DEPLOYMENT-2A.md
git commit -m "vault(2a): launchd agent for vault-sync"
```

---

### Task 19: Wire Source Serif 4 + Switzer fonts into the web app

**Files:**
- Modify: `roomos/apps/web/src/app/layout.tsx`

- [ ] **Step 1: Read current layout.tsx for the existing font setup**

```bash
cat roomos/apps/web/src/app/layout.tsx
```

- [ ] **Step 2: Replace the font loaders**

In `roomos/apps/web/src/app/layout.tsx`, replace the existing `next/font/google` import with:

```tsx
import { Source_Serif_4 } from "next/font/google"

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
})
```

Remove the previous Inter / Playfair imports.

In the `<html>` element, set the className to `${serif.variable}` and add a `<link>` for Switzer in the `<head>`:

```tsx
<html lang="en" className={serif.variable}>
  <head>
    <link
      rel="stylesheet"
      href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600,700&display=swap"
    />
  </head>
  <body className="bg-paper text-ink">{children}</body>
</html>
```

- [ ] **Step 3: Smoke test**

```bash
cd roomos
pnpm --filter @roomos/web dev
```

Open `http://localhost:3000`. Open devtools → Computed → confirm the body font-family resolves to `Switzer` and h1/h2 to `"Source Serif 4"`.

- [ ] **Step 4: Commit**

```bash
git add roomos/apps/web/src/app/layout.tsx
git commit -m "web(2a): swap fonts to Source Serif 4 + Switzer"
```

---

### Task 20: New CSS tokens in `globals.css`

**Files:**
- Modify: `roomos/apps/web/src/app/globals.css`

- [ ] **Step 1: Read current globals.css to understand the existing token names**

```bash
cat roomos/apps/web/src/app/globals.css
```

Note Phase 1C tokens in use: `--color-paper`, `--color-paper-2`, `--color-due`, `--color-vacant`, `--color-moving`, `--color-flip`, `--color-occupied`, etc.

- [ ] **Step 2: Replace the `:root` block with the new palette**

```css
:root {
  /* Surfaces — warm cream paper */
  --color-paper: #F4EDE2;
  --color-paper-2: #EDE5D6;
  --color-surface: #FAF6EC;

  /* Ink — warm near-blacks */
  --color-ink: #1A1610;
  --color-ink-2: #4F4639;
  --color-ink-3: #8B816E;

  /* Hairlines */
  --color-hairline: #DDD3BE;
  --color-hairline-2: #E8E0CD;

  /* Brand accent — restrained coral */
  --color-coral: #B14D2C;
  --color-coral-soft: #C15F3C;

  /* Status palette — newspaper, not signal-light */
  --color-green: #4A6B4F;
  --color-green-bg: #DCE5DA;
  --color-clay: #8B3A2E;
  --color-clay-bg: #ECDCD3;
  --color-amber: #9A6E1F;
  --color-amber-bg: #EDE2C5;
  --color-slate: #4F5B6E;
  --color-slate-bg: #DDE2E8;

  /* Phase-1C compatibility aliases (delete after sweep) */
  --color-due: var(--color-clay);
  --color-vacant: var(--color-clay);
  --color-moving: var(--color-amber);
  --color-flip: var(--color-amber);
  --color-occupied: var(--color-green);

  /* Type tokens */
  --font-body: "Switzer", -apple-system, BlinkMacSystemFont, sans-serif;
  /* --font-display already set by next/font; kept here for reference. */
}
```

Update `body` rule:

```css
body {
  font-family: var(--font-body);
  background: var(--color-paper);
  color: var(--color-ink);
  font-feature-settings: "tnum" 1;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 3: Visual sanity check**

```bash
cd roomos && pnpm --filter @roomos/web dev
```

Open `http://localhost:3000` (signed-in) and `/all-rooms`. Compare against the locked mockups: cream paper background, warm ink, coral on the active tab/CTAs, hairline-only borders. No blue, no gold.

- [ ] **Step 4: Commit**

```bash
git add roomos/apps/web/src/app/globals.css
git commit -m "web(2a): new CSS tokens — cream paper + coral + newspaper status palette"
```

---

### Task 21: `OccupancyDonut` component + format helpers (TDD)

**Files:**
- Create: `roomos/apps/web/src/components/properties/OccupancyDonut.tsx`
- Modify: `roomos/apps/web/src/lib/format.ts`
- Test: `roomos/apps/web/tests/lib-format.test.ts` (extend existing)

- [ ] **Step 1: Add a donut math helper to `format.ts`**

Add to `roomos/apps/web/src/lib/format.ts`:

```typescript
/**
 * Compute SVG `stroke-dasharray` segments for a donut chart.
 * Total stroke length is 2πr; each segment proportional to its count.
 *
 * Example: occupied=4, vacant=2, total=6, r=14 → returns
 * [{ length: ~58.6, offset: 0, color: "occupied" }, { length: ~29.3, offset: -58.6, color: "vacant" }]
 */
export type DonutSegment = { length: number; offset: number; color: "occupied" | "vacant" | "moving" }

export function donutSegments(parts: { occupied: number; vacant: number; moving?: number }, radius = 14): DonutSegment[] {
  const total = parts.occupied + parts.vacant + (parts.moving ?? 0)
  if (total === 0) return []
  const circumference = 2 * Math.PI * radius
  const seg: DonutSegment[] = []
  let offset = 0
  for (const [color, count] of [
    ["occupied", parts.occupied],
    ["moving", parts.moving ?? 0],
    ["vacant", parts.vacant],
  ] as const) {
    if (count === 0) continue
    const length = (count / total) * circumference
    seg.push({ length, offset, color })
    offset -= length
  }
  return seg
}
```

- [ ] **Step 2: Add a unit test**

```typescript
// roomos/apps/web/tests/lib-format.test.ts (add to existing file)
import { donutSegments } from "../src/lib/format"

describe("donutSegments", () => {
  it("returns empty array when total is 0", () => {
    expect(donutSegments({ occupied: 0, vacant: 0 })).toEqual([])
  })

  it("splits 4/2 into proportional lengths summing to ~88", () => {
    const seg = donutSegments({ occupied: 4, vacant: 2 })
    const sum = seg.reduce((s, x) => s + x.length, 0)
    expect(sum).toBeCloseTo(2 * Math.PI * 14, 1)
    expect(seg[0].color).toBe("occupied")
    expect(seg[1].color).toBe("vacant")
  })

  it("places moving segment between occupied and vacant", () => {
    const seg = donutSegments({ occupied: 3, moving: 1, vacant: 2 })
    expect(seg.map((s) => s.color)).toEqual(["occupied", "moving", "vacant"])
  })
})
```

- [ ] **Step 3: Run test to verify it fails (then write impl above to make it pass)**

```bash
cd roomos && pnpm --filter @roomos/web test -- format
```

Expected: 3/3 pass after Step 1 lands.

- [ ] **Step 4: Write the donut component**

```tsx
// roomos/apps/web/src/components/properties/OccupancyDonut.tsx
import { donutSegments } from "@/lib/format"

export type OccupancyDonutProps = {
  occupied: number
  vacant: number
  moving?: number
  size?: number              // default 32px
  strokeWidth?: number       // default 4
  className?: string
}

const COLOR_VAR: Record<string, string> = {
  occupied: "var(--color-green)",
  vacant: "var(--color-clay)",
  moving: "var(--color-amber)",
}

export function OccupancyDonut({
  occupied,
  vacant,
  moving = 0,
  size = 32,
  strokeWidth = 4,
  className,
}: OccupancyDonutProps) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const segments = donutSegments({ occupied, vacant, moving }, r)
  const circumference = 2 * Math.PI * r
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      style={{ transform: "rotate(-90deg)" }}
      aria-label={`${occupied} of ${occupied + vacant + moving} rooms occupied`}
    >
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={strokeWidth} />
      {segments.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={COLOR_VAR[s.color]}
          strokeWidth={strokeWidth}
          strokeDasharray={`${s.length} ${circumference}`}
          strokeDashoffset={s.offset}
        />
      ))}
    </svg>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add roomos/apps/web/src/lib/format.ts \
        roomos/apps/web/tests/lib-format.test.ts \
        roomos/apps/web/src/components/properties/OccupancyDonut.tsx
git commit -m "web(2a): OccupancyDonut + donut math helper (TDD)"
```

---

### Task 22: Properties list page (`/properties`) and queries

**Files:**
- Create: `roomos/apps/web/src/lib/property-queries.ts`
- Create: `roomos/apps/web/src/app/(signed-in)/properties/page.tsx`
- Create: `roomos/apps/web/src/components/properties/PropertiesTable.tsx`

- [ ] **Step 1: Write the property queries module**

```typescript
// roomos/apps/web/src/lib/property-queries.ts
import { prisma } from "@roomos/db"

export type PropertyRow = {
  id: string
  padsplitPropertyId: string | null
  address: string
  city: string | null
  state: string | null
  ownerName: string | null
  status: "ACTIVE" | "ONBOARDING" | "PENDING_APPROVAL"
  occupants: number
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  movingRooms: number
}

export async function getPropertiesForList(orgId: string): Promise<PropertyRow[]> {
  const properties = await prisma.property.findMany({
    where: { orgId },
    include: {
      owner: { select: { name: true } },
      rooms: {
        include: {
          listings: {
            where: { isActive: true },
            include: {
              occupancies: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
    orderBy: { address: "asc" },
  })

  return properties.map((p) => {
    let occupied = 0
    let vacant = 0
    let moving = 0
    for (const room of p.rooms) {
      const latest = room.listings[0]?.occupancies[0]
      switch (latest?.status) {
        case "OCCUPIED": occupied++; break
        case "MOVING_IN":
        case "MOVING_OUT": moving++; break
        case "VACANT":
        case "INACTIVE":
        case "WAITING_APPROVAL":
        case undefined:
        default: vacant++; break
      }
    }
    return {
      id: p.id,
      padsplitPropertyId: p.padsplitPropertyId,
      address: p.address,
      city: p.city,
      state: p.state,
      ownerName: p.owner?.name ?? null,
      status: "ACTIVE",                     // status logic deferred to Phase 2D
      occupants: occupied,
      totalRooms: p.rooms.length,
      occupiedRooms: occupied,
      vacantRooms: vacant,
      movingRooms: moving,
    }
  })
}
```

- [ ] **Step 2: Write the table component**

```tsx
// roomos/apps/web/src/components/properties/PropertiesTable.tsx
import Link from "next/link"
import type { PropertyRow } from "@/lib/property-queries"
import { OccupancyDonut } from "./OccupancyDonut"

export function PropertiesTable({ rows }: { rows: PropertyRow[] }) {
  return (
    <div className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-hairline)]">
            <Th width="78px">ID</Th>
            <Th>Address</Th>
            <Th width="120px">Status</Th>
            <Th width="110px">Occupants</Th>
            <Th width="230px">Room statuses</Th>
            <Th width="160px">Booking approvals</Th>
            <Th width="120px">Stay rewards</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[color:var(--color-hairline-2)] last:border-0 hover:bg-[color:var(--color-paper-2)] cursor-pointer"
            >
              <td className="px-5 py-5 italic text-[color:var(--color-ink-3)] font-[family-name:var(--font-display)]">
                {r.padsplitPropertyId ?? "—"}
              </td>
              <td className="px-5 py-5">
                <Link
                  href={`/properties/${r.id}`}
                  className="block font-medium text-[color:var(--color-ink)] -mb-0.5"
                >
                  {r.address.split(",")[0]}
                </Link>
                <div className="text-xs text-[color:var(--color-ink-3)] tracking-wide">
                  {[r.city, r.state].filter(Boolean).join(", ")}
                  {r.ownerName ? <span className="text-[color:var(--color-ink-2)]"> · {r.ownerName}</span> : null}
                </div>
              </td>
              <td className="px-5 py-5">
                <Pill kind={r.status} />
              </td>
              <td className="px-5 py-5 font-[family-name:var(--font-display)] text-2xl text-[color:var(--color-ink)]">
                {r.occupants}
              </td>
              <td className="px-5 py-5">
                <div className="flex items-center gap-3">
                  <OccupancyDonut occupied={r.occupiedRooms} vacant={r.vacantRooms} moving={r.movingRooms} />
                  <span className="text-sm text-[color:var(--color-ink-2)]">
                    <strong className="text-[color:var(--color-ink)] font-medium">{r.occupiedRooms}</strong> of {r.totalRooms} occupied
                  </span>
                </div>
              </td>
              <td className="px-5 py-5"><Toggle on label="Enabled" /></td>
              <td className="px-5 py-5"><Toggle on={false} label="Off" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="text-left text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold px-5 py-4"
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  )
}

function Pill({ kind }: { kind: PropertyRow["status"] }) {
  const map = {
    ACTIVE:           { bg: "var(--color-green-bg)", fg: "var(--color-green)", label: "Active" },
    ONBOARDING:       { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Onboarding" },
    PENDING_APPROVAL: { bg: "var(--color-slate-bg)", fg: "var(--color-slate)", label: "Pending approval" },
  }[kind]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-sm"
      style={{ background: map.bg, color: map.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: map.fg }} />
      {map.label}
    </span>
  )
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="relative w-8 h-[18px] rounded-full transition-colors"
        style={{ background: on ? "var(--color-coral)" : "var(--color-hairline)" }}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 bg-[color:var(--color-surface)] rounded-full transition-all"
          style={{ left: on ? "16px" : "2px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
        />
      </span>
      <span className="text-xs text-[color:var(--color-ink-3)]">{label}</span>
    </div>
  )
}
```

- [ ] **Step 3: Write the page**

```tsx
// roomos/apps/web/src/app/(signed-in)/properties/page.tsx
import { auth } from "@/lib/auth"
import { getPropertiesForList } from "@/lib/property-queries"
import { PropertiesTable } from "@/components/properties/PropertiesTable"

export default async function PropertiesPage() {
  const { orgId } = await auth()
  const rows = await getPropertiesForList(orgId)

  return (
    <div className="max-w-[1440px] mx-auto px-10 pt-14 pb-20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3">
        CoHost Management · Portfolio
      </div>
      <div className="flex items-end justify-between gap-6 pb-7 border-b border-[color:var(--color-hairline)] mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-[56px] leading-none font-normal tracking-[-0.02em] text-[color:var(--color-ink)]">
          Properties<span className="italic text-[color:var(--color-coral)]">.</span>
        </h1>
        <div className="flex gap-2.5">
          <button className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-medium rounded-sm">
            Booking settings
          </button>
          <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-4 py-2.5 text-sm font-medium rounded-sm">
            ＋ New listing
          </button>
        </div>
      </div>
      <PropertiesTable rows={rows} />
    </div>
  )
}
```

- [ ] **Step 4: Smoke test against the live vault data**

Pre-req: Task 17 ran successfully and Postgres has 59 properties.

```bash
cd roomos && pnpm --filter @roomos/web dev
```

Open `http://localhost:3000/properties`. Expected: 59 rows. Each row's donut renders correctly (green arc length proportional to occupied count). Owner column shows where mapped. Tabular numerals.

- [ ] **Step 5: Commit**

```bash
git add roomos/apps/web/src/lib/property-queries.ts \
        roomos/apps/web/src/app/\(signed-in\)/properties/page.tsx \
        roomos/apps/web/src/components/properties/PropertiesTable.tsx
git commit -m "web(2a): Properties list page wired to vault-fed Postgres"
```

---

### Task 23: Property detail page (`/properties/[propertyId]`)

**Files:**
- Modify: `roomos/apps/web/src/lib/property-queries.ts` (add `getPropertyDetail`)
- Create: `roomos/apps/web/src/app/(signed-in)/properties/[propertyId]/page.tsx`
- Create: `roomos/apps/web/src/components/properties/PropertyHero.tsx`
- Create: `roomos/apps/web/src/components/properties/PropertyKpiStrip.tsx`
- Create: `roomos/apps/web/src/components/properties/BedroomCard.tsx`
- Create: `roomos/apps/web/src/components/properties/BedroomGrid.tsx`
- Create: `roomos/apps/web/src/components/properties/PropertyDetailRail.tsx`

- [ ] **Step 1: Add `getPropertyDetail` to property-queries.ts**

```typescript
// Append to roomos/apps/web/src/lib/property-queries.ts

export type RoomDetail = {
  roomId: string
  roomNumber: string
  status: string
  member: { id: string; name: string; email: string | null; firstSeenAt: Date } | null
  weeklyRate: number | null
  balance: number | null
  lastPaymentAt: Date | null
  flagBody: string | null              // associated flag body, if any
}

export type PropertyDetail = {
  id: string
  padsplitPropertyId: string | null
  address: string
  city: string | null
  state: string | null
  marketName: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  ownerBillingTerms: string | null
  totalRooms: number
  occupiedCount: number
  vacantCount: number
  pastDueAmount: number
  rooms: RoomDetail[]
  flags: { id: string; severity: string; title: string; body: string | null; openedAt: Date }[]
  lastVaultSyncAt: Date | null
}

export async function getPropertyDetail(orgId: string, propertyId: string): Promise<PropertyDetail | null> {
  const p = await prisma.property.findFirst({
    where: { id: propertyId, orgId },
    include: {
      owner: true,
      rooms: {
        orderBy: { roomNumber: "asc" },
        include: {
          listings: {
            where: { isActive: true },
            include: {
              occupancies: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: { member: true },
              },
            },
          },
        },
      },
      flags: { where: { closedAt: null }, orderBy: { openedAt: "desc" } },
    },
  })
  if (!p) return null

  const lastSync = await prisma.syncRun.findFirst({
    where: { orgId, kind: "VAULT_SYNC", status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
  })

  let occupied = 0
  let vacant = 0
  let pastDue = 0
  const rooms: RoomDetail[] = p.rooms.map((room) => {
    const occ = room.listings[0]?.occupancies[0] ?? null
    if (occ?.status === "OCCUPIED") occupied++
    else vacant++
    if (occ?.currentBalance) pastDue += Number(occ.currentBalance)
    return {
      roomId: room.id,
      roomNumber: room.roomNumber ?? "",
      status: occ?.status ?? "VACANT",
      member: occ?.member ? {
        id: occ.member.id,
        name: occ.member.name,
        email: occ.member.email,
        firstSeenAt: occ.member.firstSeenAt,
      } : null,
      weeklyRate: null,                  // populated in Phase 2C
      balance: occ?.currentBalance ? Number(occ.currentBalance) : null,
      lastPaymentAt: occ?.lastPaymentAt ?? null,
      flagBody: null,
    }
  })

  return {
    id: p.id,
    padsplitPropertyId: p.padsplitPropertyId,
    address: p.address,
    city: p.city,
    state: p.state,
    marketName: p.market,
    ownerName: p.owner?.name ?? null,
    ownerEmail: p.owner?.email ?? null,
    ownerPhone: p.owner?.phone ?? null,
    ownerBillingTerms: p.owner?.billingTerms ?? null,
    totalRooms: p.rooms.length,
    occupiedCount: occupied,
    vacantCount: vacant,
    pastDueAmount: pastDue,
    rooms,
    flags: p.flags.map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      body: f.body,
      openedAt: f.openedAt,
    })),
    lastVaultSyncAt: lastSync?.completedAt ?? null,
  }
}
```

- [ ] **Step 2: Write the components**

Each is a presentational server component. Style per the locked mockup. Sample:

```tsx
// roomos/apps/web/src/components/properties/PropertyHero.tsx
import type { PropertyDetail } from "@/lib/property-queries"

export function PropertyHero({ p }: { p: PropertyDetail }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-10 items-end pb-7 border-b border-[color:var(--color-hairline)]">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3.5">
          {[p.city, p.state].filter(Boolean).join(", ")} · Single-family
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-[64px] leading-none font-normal tracking-[-0.025em] mb-4">
          {p.address.split(",")[0]}
          <span className="italic text-[color:var(--color-coral)]">.</span>
        </h1>
        <div className="flex gap-4 items-center text-sm text-[color:var(--color-ink-2)]">
          <span>{p.totalRooms} bedrooms</span>
          <span className="w-1 h-1 rounded-full bg-[color:var(--color-ink-3)]" />
          <span>Owner <span className="text-[color:var(--color-ink)] font-medium">{p.ownerName ?? "Unmapped"}</span></span>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="border border-[color:var(--color-hairline)] bg-[color:var(--color-surface)] px-4 py-2.5 text-sm font-medium rounded-sm">Refresh now</button>
        <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-4 py-2.5 text-sm font-medium rounded-sm">Edit listing</button>
      </div>
    </div>
  )
}
```

```tsx
// roomos/apps/web/src/components/properties/PropertyKpiStrip.tsx
import type { PropertyDetail } from "@/lib/property-queries"
import { formatMoney } from "@/lib/format"

export function PropertyKpiStrip({ p }: { p: PropertyDetail }) {
  return (
    <div className="grid grid-cols-4 border-y border-[color:var(--color-hairline)] my-12">
      <Kpi label="Occupancy" value={`${p.occupiedCount}`} sub={`/${p.totalRooms} · ${p.vacantCount} vacant`} />
      <Kpi label="Earnings · MTD" value={formatMoney(0)} sub="wired in Phase 2C" />
      <Kpi label="Past due" value={formatMoney(p.pastDueAmount)} sub={p.pastDueAmount > 0 ? "Action required" : "—"} danger={p.pastDueAmount > 0} />
      <Kpi label="Open flags" value={`${p.flags.length}`} sub={p.flags[0]?.title ?? "—"} />
    </div>
  )
}

function Kpi({ label, value, sub, danger }: { label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <div className="px-7 py-6 border-r border-[color:var(--color-hairline-2)] last:border-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-ink-3)] font-medium mb-2">{label}</div>
      <div
        className="font-[family-name:var(--font-display)] text-[34px] font-normal tracking-[-0.02em] leading-none"
        style={{ color: danger ? "var(--color-clay)" : "var(--color-ink)" }}
      >
        {value}
      </div>
      <div className="text-xs text-[color:var(--color-ink-3)] mt-1.5">{sub}</div>
    </div>
  )
}
```

```tsx
// roomos/apps/web/src/components/properties/BedroomCard.tsx
import type { RoomDetail } from "@/lib/property-queries"
import { formatMoney } from "@/lib/format"

export function BedroomCard({ room }: { room: RoomDetail }) {
  const isOccupied = room.status === "OCCUPIED"
  const isTerminated = room.status === "INACTIVE" && (room.balance ?? 0) > 0
  return (
    <div
      className="bg-[color:var(--color-surface)] p-6 cursor-pointer hover:bg-[color:var(--color-paper-2)] transition-colors"
      style={isTerminated ? { background: "linear-gradient(135deg, var(--color-surface) 0%, var(--color-clay-bg) 380%)" } : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2.5">
          <span className="italic text-[color:var(--color-ink-3)] font-[family-name:var(--font-display)]">{room.roomNumber}</span>
          <span className="text-sm font-semibold text-[color:var(--color-ink)] tracking-[-0.005em]">
            {/* Names like "Pearl" / "Sage" come from a future palette mapping; for now just the room number. */}
          </span>
        </div>
        <StatusPill status={room.status} />
      </div>

      <div className="flex gap-4 items-center mb-3.5">
        <div className="w-9 h-9 rounded-full bg-[color:var(--color-paper-2)] border border-[color:var(--color-hairline)] grid place-items-center text-sm font-medium font-[family-name:var(--font-display)] text-[color:var(--color-ink-2)]">
          {room.member ? initials(room.member.name) : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[color:var(--color-ink)]">{room.member?.name ?? "Vacant"}</div>
          <div className="text-xs text-[color:var(--color-ink-3)]">
            {room.member ? `since ${room.member.firstSeenAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "needs relisting"}
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-3.5 border-t border-[color:var(--color-hairline-2)]">
        <Fin label="Weekly" value={room.weeklyRate ? formatMoney(room.weeklyRate) : "—"} />
        <Fin label="Balance" value={formatMoney(room.balance ?? 0)} danger={isTerminated} />
        <Fin label="Last paid" value={room.lastPaymentAt ? room.lastPaymentAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"} />
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    OCCUPIED:        { bg: "var(--color-green-bg)", fg: "var(--color-green)", label: "Occupied" },
    VACANT:          { bg: "var(--color-clay-bg)", fg: "var(--color-clay)", label: "Vacant" },
    INACTIVE:        { bg: "var(--color-ink)", fg: "var(--color-paper)", label: "Terminated" },
    MOVING_IN:       { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Moving in" },
    MOVING_OUT:      { bg: "var(--color-amber-bg)", fg: "var(--color-amber)", label: "Moving out" },
    WAITING_APPROVAL:{ bg: "var(--color-slate-bg)", fg: "var(--color-slate)", label: "Pending" },
  }
  const c = map[status] ?? map.VACANT
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1 rounded-sm" style={{ background: c.bg, color: c.fg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {c.label}
    </span>
  )
}

function Fin({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex-1">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--color-ink-3)] font-medium mb-1">{label}</div>
      <div
        className="font-[family-name:var(--font-display)] text-[17px] tracking-[-0.005em]"
        style={{ color: danger ? "var(--color-clay)" : "var(--color-ink)" }}
      >
        {value}
      </div>
    </div>
  )
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase()
}
```

```tsx
// roomos/apps/web/src/components/properties/BedroomGrid.tsx
import { BedroomCard } from "./BedroomCard"
import type { RoomDetail } from "@/lib/property-queries"

export function BedroomGrid({ rooms }: { rooms: RoomDetail[] }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-[color:var(--color-hairline-2)] border border-[color:var(--color-hairline)] mb-14">
      {rooms.map((r) => <BedroomCard key={r.roomId} room={r} />)}
    </div>
  )
}
```

```tsx
// roomos/apps/web/src/components/properties/PropertyDetailRail.tsx
import type { PropertyDetail } from "@/lib/property-queries"
import { LiveFlagsCard } from "./LiveFlagsCard"        // wired in Task 25; create stub now

export function PropertyDetailRail({ p }: { p: PropertyDetail }) {
  return (
    <aside className="space-y-4">
      <RailCard label={<>Property <span className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] px-1.5 py-0.5 rounded-sm text-[10px] tracking-[0.04em]">PadSplit</span></>}>
        <DetailRow k="PadSplit ID" v={p.padsplitPropertyId ?? "—"} mono />
        <DetailRow k="Status" v="Active" />
        <DetailRow k="Market" v={p.marketName ?? "—"} />
      </RailCard>

      <RailCard label="Owner">
        <div className="font-[family-name:var(--font-display)] text-[19px] mb-1">{p.ownerName ?? "Unmapped"}</div>
        {p.ownerEmail ? <div className="text-[12.5px] text-[color:var(--color-ink-2)] leading-relaxed">{p.ownerEmail}</div> : null}
        {p.ownerPhone ? <div className="text-[12.5px] text-[color:var(--color-ink-2)]">{p.ownerPhone}</div> : null}
      </RailCard>

      <LiveFlagsCard flags={p.flags} />

      <RailCard label="Sync history">
        <DetailRow k="Vault" v={p.lastVaultSyncAt ? relativeTime(p.lastVaultSyncAt) : "never"} />
        <DetailRow k="Hospitable" v="N/A (Phase 2B)" />
        <DetailRow k="REI Hub" v="N/A (Phase 2C)" />
      </RailCard>
    </aside>
  )
}

function RailCard({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5 flex items-center justify-between">{label}</div>
      {children}
    </div>
  )
}

function DetailRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 text-sm border-b border-[color:var(--color-hairline-2)] last:border-0">
      <span className="text-[color:var(--color-ink-3)]">{k}</span>
      <span className={`text-[color:var(--color-ink)] font-medium ${mono ? "font-[family-name:var(--font-display)] italic font-normal" : ""}`}>{v}</span>
    </div>
  )
}

function relativeTime(d: Date): string {
  const minutes = Math.round((Date.now() - d.getTime()) / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return d.toLocaleDateString()
}
```

- [ ] **Step 3: Write the page**

```tsx
// roomos/apps/web/src/app/(signed-in)/properties/[propertyId]/page.tsx
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { getPropertyDetail } from "@/lib/property-queries"
import { PropertyHero } from "@/components/properties/PropertyHero"
import { PropertyKpiStrip } from "@/components/properties/PropertyKpiStrip"
import { BedroomGrid } from "@/components/properties/BedroomGrid"
import { PropertyDetailRail } from "@/components/properties/PropertyDetailRail"

export default async function PropertyDetailPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { orgId } = await auth()
  const { propertyId } = await params
  const p = await getPropertyDetail(orgId, propertyId)
  if (!p) notFound()

  return (
    <div className="max-w-[1440px] mx-auto px-10 pt-9 pb-20">
      <PropertyHero p={p} />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-14 mt-9">
        <div>
          <PropertyKpiStrip p={p} />
          <div className="flex items-baseline justify-between mb-5.5">
            <div className="font-[family-name:var(--font-display)] text-[26px]">Bedrooms</div>
            <div className="text-xs text-[color:var(--color-ink-3)]">
              <strong className="text-[color:var(--color-ink-2)] font-medium">{p.totalRooms}</strong> bedrooms · <strong className="text-[color:var(--color-ink-2)] font-medium">{p.occupiedCount}</strong> occupied
            </div>
          </div>
          <BedroomGrid rooms={p.rooms} />
        </div>
        <PropertyDetailRail p={p} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test**

```bash
cd roomos && pnpm --filter @roomos/web dev
```

Open `http://localhost:3000/properties` → click 1311 Morgana → confirm hero, KPI strip, 6 bedroom cards (R1–R6), right rail with property + owner + flags + sync history. Status pills correct (R3 Vacant in clay, R4 Terminated in dark, others Occupied in green). KPI past-due shows R4's $407.90.

- [ ] **Step 5: Commit**

```bash
git add roomos/apps/web/src/lib/property-queries.ts \
        roomos/apps/web/src/app/\(signed-in\)/properties/\[propertyId\]/page.tsx \
        roomos/apps/web/src/components/properties/
git commit -m "web(2a): Property detail page with hero, KPIs, bedroom grid, rail"
```

---

### Task 24: Palette pass over Phase 1C dashboard components

**Files:**
- Modify: `roomos/apps/web/src/components/dashboard/*.tsx` (sweep)
- Modify: `roomos/apps/web/src/components/all-rooms/*.tsx` (sweep)
- Modify: `roomos/apps/web/src/components/room-detail/*.tsx` (sweep)
- Modify: `roomos/apps/web/src/components/nav/Topbar.tsx`

- [ ] **Step 1: Find Phase 1C tokens still referenced**

```bash
cd roomos/apps/web/src
grep -rn "color-due\|color-vacant\|color-moving\|color-flip\|color-occupied\|color-gold" \
       --include="*.tsx" --include="*.css"
```

Expected: a list of locations referencing the alias tokens we kept in Task 20. The aliases keep things working immediately, but we want to remove them.

- [ ] **Step 2: Sweep each file, replace alias references with the new direct tokens**

| Old token | New token |
| --- | --- |
| `color-due` | `color-clay` |
| `color-vacant` | `color-clay` |
| `color-moving` | `color-amber` |
| `color-flip` | `color-amber` |
| `color-occupied` | `color-green` |
| `color-gold` (if any) | `color-coral` |

Use search-and-replace per file. Verify each file renders sensibly afterward by visiting its page.

- [ ] **Step 3: Remove the alias block from globals.css**

In `globals.css`, delete the "Phase-1C compatibility aliases" block added in Task 20.

- [ ] **Step 4: Smoke test the dashboard**

```bash
cd roomos && pnpm --filter @roomos/web dev
```

Visit `/rooms` (Phase 1C home), `/all-rooms`, `/rooms/<id>`, `/properties`, `/properties/<id>`, `/activity`, `/settings/*`. Confirm the cream/coral/clay palette is consistent. No yellow, no PadSplit blue, no Phase 1A gold.

- [ ] **Step 5: Commit**

```bash
git add roomos/apps/web/src/components roomos/apps/web/src/app/globals.css
git commit -m "web(2a): palette sweep across Phase 1C components; alias tokens removed"
```

---

### Task 25: `LiveFlagsCard` component wired to `propertyFlags`

**Files:**
- Create: `roomos/apps/web/src/components/properties/LiveFlagsCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// roomos/apps/web/src/components/properties/LiveFlagsCard.tsx
import type { PropertyDetail } from "@/lib/property-queries"

const SEVERITY_COLOR: Record<string, string> = {
  DANGER: "var(--color-clay)",
  WARN: "var(--color-amber)",
  INFO: "var(--color-slate)",
  OK: "var(--color-green)",
}

export function LiveFlagsCard({ flags }: { flags: PropertyDetail["flags"] }) {
  if (flags.length === 0) {
    return (
      <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
        <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5">Live flags</div>
        <div className="text-sm text-[color:var(--color-ink-3)]">No open flags.</div>
      </div>
    )
  }
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold mb-3.5">Live flags</div>
      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <div key={f.id} className="text-sm leading-snug pl-3.5 relative text-[color:var(--color-ink-2)]">
            <span
              className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
              style={{ background: SEVERITY_COLOR[f.severity] ?? SEVERITY_COLOR.INFO }}
            />
            {f.title}
            {f.body ? <span className="block text-[11.5px] text-[color:var(--color-ink-3)] mt-0.5 tracking-[0.02em]">{f.body}</span> : null}
            <span className="block text-[11.5px] text-[color:var(--color-ink-3)] mt-0.5 tracking-[0.02em]">
              flagged {f.openedAt.toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Visit a property with multiple flags (1311 Morgana). Confirm the rail card shows all open flags with the correct severity color dot.

- [ ] **Step 3: Commit**

```bash
git add roomos/apps/web/src/components/properties/LiveFlagsCard.tsx
git commit -m "web(2a): LiveFlagsCard rail component"
```

---

### Task 26: End-to-end smoke test + finalize deployment doc

**Files:**
- Modify: `docs/superpowers/DEPLOYMENT-2A.md`

- [ ] **Step 1: Run the full local stack**

```bash
cd roomos
launchctl unload ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist 2>/dev/null || true
VAULT_PATH=/Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub \
  pnpm --filter @roomos/worker exec node -r tsx/cjs src/cli.ts vault-sync
pnpm --filter @roomos/web dev
```

Open `http://localhost:3000/properties`.

- [ ] **Step 2: Spot-check three properties**

For each of these, verify the dashboard matches what's true in the vault:

| Property | Address | What to verify |
| --- | --- | --- |
| 1311 Morgana | Jacksonville, FL | 6 bedrooms; R1/R2/R5/R6 Occupied; R3 Vacant; R4 Terminated with $407.90 balance; ≥4 open flags |
| 8041 Osceola | Westminster, CO | 5 bedrooms; 4 occupied; 1 vacant |
| 218 San Marco | St. Augustine, FL | 8 bedrooms; 0 occupied (onboarding) |

If any disagree, find the parser or persist gap and fix before considering 2A shipped.

- [ ] **Step 3: Finalize DEPLOYMENT-2A.md**

Append a "Smoke test" section:

```markdown
## 4. Smoke test

After the launchd agent has fired at least once:

1. Open `https://<railway-domain>/properties`. Expect 59 rows.
2. Click `1311 Morgana Road`. Expect 6 bedrooms, the R3/R4 flags, the past-due value of $407.90 in the KPI strip.
3. Open Railway → Postgres data tab → `sync_runs`. Expect a recent `VAULT_SYNC` row with `status = SUCCESS`.
4. Confirm the old PadSplit launchd plist is gone from `~/Library/LaunchAgents/`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-2A.md
git commit -m "docs(2a): finalize deployment doc with smoke test steps"
```

---

## Self-review notes (post-write)

- **Spec coverage**: §4.1 (vault adapter) → Tasks 3-15. §5 (schema deltas) → Task 2. §6 (dashboard UI per locked mockups) → Tasks 19-25. §7 (owner/GHL push) is explicitly Phase 2D. §8.1 (decommission scraper) → Task 1 + Task 17 + Task 18. §8.3 (dashboard restyle) → Task 20 + 24. ✓
- **Placeholder scan**: no TBDs. Task 23 leaves `weeklyRate` null in `RoomDetail` (commented "wired in Phase 2C") — this is intentional, not a placeholder, because weekly rate comes from REI Hub / member dossier weekly-rate, both of which are downstream-phase work. The Bedroom card handles it gracefully (shows `—`).
- **Type consistency**: `OccupancyStatus`, `FlagSeverity`, `FlagSource`, `SyncKind` are referenced consistently in Tasks 13/14/15/22/23. `padsplitPropertyId` (camelCase TS, snake_case DB via `@map`) used consistently. `vaultFilePath` ditto. `externalMemberId` synthetic format `vault:${padsplitPropertyId}-${roomNumber}-${slug(name)}` defined in Task 12 and used in the seed test in Task 12. ✓
- **Idempotency invariants**: tested explicitly in Task 10 (property), Task 11 (room+listing), Task 12 (member), Task 13 (occupancy), Task 14 (flag), and end-to-end in Task 15. ✓
- **Real-data verification**: Task 4's fixture is a copy of the actual vault file, not a synthetic minimal example — keeps the parser honest against real-world structure. Task 26 spot-checks against three real properties. ✓

---

**Next:** plans for Phase 2B (Hospitable + cross-listing), 2C (REI Hub + long-term lease), 2D (owner statements + GHL push) get their own files in `docs/superpowers/plans/` after 2A ships and the smoke tests pass.
