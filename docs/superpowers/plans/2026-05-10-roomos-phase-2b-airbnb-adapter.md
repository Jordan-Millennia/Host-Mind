# RoomOS Phase 2B — Airbnb Direct Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape `airbnb.com/hosting` every 30 minutes from the Mac Studio launchd worker; map each Airbnb listing to a RoomOS `Room` by address + title; upsert `PlatformListing` (`platform=AIRBNB`), `Occupancy` rows for active bookings, and `PaymentEvent` rows from completed payouts. Surface a "cross-listing" warning when the same `room_id` carries both `PADSPLIT` and `AIRBNB` active rows. Give the operator a Settings → Airbnb page to confirm or override inferred mappings.

**Architecture:** New `roomos/packages/worker/src/airbnb/` package alongside the existing `vault/` package. Same scheduler process; new BullMQ recurring job `airbnb-sync` at 30-min cadence. Authenticated Playwright session backed by a local cookie jar populated by a one-shot `airbnb-login` CLI command. Schema change: `PlatformListing.roomId` becomes nullable so unmapped listings can land in the DB before Jordan confirms. New `(platform, externalListingId)` unique key replaces `(roomId, platform)` as the lookup key on writes. New `Settings → Airbnb` page lists unmapped listings; clicking a row pins it to a Room.

**Tech Stack:** TypeScript / Node 20 / pnpm. Prisma 5 (existing). Playwright (already in worker package — `pw_headful_test.ts` predecessor). Vitest. Next.js 16 App Router (existing).

---

## Source spec & predecessors

- Master spec: `docs/superpowers/specs/2026-05-08-roomos-vault-fed-pivot-design.md`, section **4.2 Airbnb adapter** describes the design end-to-end. Section 8 step 5 ("Light up Airbnb adapter") is the deliverable. Section 9.1 captures the listing → room mapping open question.
- Phase 2A: `docs/superpowers/plans/2026-05-08-roomos-phase-2a-vault-foundation.md`. **Patterns to mirror exactly** — parser-test scaffold, persist-test scaffold, launchd plist shape, scheduler integration, DEPLOYMENT-2A.md structure.
- Phase 1B (retired) is the reference for the Playwright session shape: `roomos/packages/worker/src/playwright/session.ts` (persistent storage state) and `roomos/packages/worker/src/padsplit/login.ts` (interactive headful login). Both stay in tree per Phase 2A Task 17; the new `airbnb/login.ts` mirrors their structure.
- Property queries: `roomos/apps/web/src/lib/property-queries.ts` from Phase 2A — extended in Task 17 with a `getCrossListedRooms` helper.

## What this plan does NOT cover (deferred)

- **REI Hub / TurboTenant long-term lease adapter** → Phase 2C.
- **Owner statements + GHL push** → Phase 2D.
- **Auto-preventing cross-listing conflicts** (e.g. blocking an Airbnb booking when a PadSplit member is in the same room). Phase 2B *warns*; auto-prevention is Phase 2D or later.
- **Hospitable integration** — explicitly out of scope (per the spec rev on 2026-05-08).
- **Per-guest member dossiers** — Airbnb guests are tracked as `Occupancy.member` rows but we do not generate vault-style dossier markdown for them.

## Decisions locked

- **Session lifecycle.** A one-shot `worker airbnb-login` CLI command opens a headful Chromium against `airbnb.com/login`. Jordan logs in once (handles MFA / captcha / device verification). On success the Playwright context's `storage_state` is written to `~/Library/Application Support/RoomOS/.auth/airbnb.json` encrypted with a Keychain-backed key (same pattern as Phase 1B's `padsplit.json`). The recurring `airbnb-sync` job loads the same storage state on every run.
- **No new persistent table for "mappings."** The mapping IS `PlatformListing.roomId`. Unmapped = `roomId IS NULL`. Confirmed mappings have `roomId` set (either by the matcher heuristic or by Jordan via the Settings UI).
- **`PlatformListing.roomId` becomes nullable.** Schema migration. The existing `@@unique([roomId, platform])` is dropped (Postgres allows multiple `(NULL, AIRBNB)` rows but the constraint with `roomId NOT NULL` previously prevented unmapped listings from being inserted at all). A new `@@unique([platform, externalListingId])` (where `externalListingId IS NOT NULL`) takes over as the lookup key for the vault and Airbnb writers. The vault writer (Phase 2A) is updated to populate `externalListingId = padsplitPropertyId + ":" + roomNumber` so it has a stable per-(property, room) identifier; this is the smallest possible change to the vault upsert.
- **Match heuristic.** For each listing:
  1. Normalize address (strip "Unit X", "Apt Y", suite suffixes; lowercase; collapse abbreviations: `Northwest`→`NW`, `Street`→`St`, etc.).
  2. Find candidate properties whose normalized `address` matches the normalized listing address.
  3. If the listing title contains `Room N` / `R[N]` and exactly one candidate property has a room with that number, set `roomId` directly.
  4. If the listing covers the whole house (no room qualifier in title), and the candidate property has exactly one room (or a single "master" room) → that room.
  5. Anything ambiguous: leave `roomId = NULL`. Raise a `WARN` `PropertyFlag` on the candidate property: "Airbnb listing 'X' could not be matched to a specific room. Confirm in Settings → Airbnb."
- **Cross-listing radar.** A pure derived query: `SELECT room_id FROM platform_listings WHERE room_id IS NOT NULL AND is_active = true GROUP BY room_id HAVING count(DISTINCT platform) > 1`. Surfaced as:
  - A red banner on the affected property's detail page (LiveFlagsCard already exists from Phase 2A; we add a new system-generated flag with `source = MANUAL` and a stable `sourceRef = "cross-listing-${room_id}"` so it's idempotent across recomputes).
  - A column on the Properties list (re-uses the existing "Platform" column area).
- **Cadence.** Every 30 minutes via BullMQ `repeat: { every: 30 * 60 * 1000 }`, registered in `scheduler.ts` alongside the existing 15-min vault-sync.
- **No new tables.** All Airbnb data lives in the existing `platform_listings`, `occupancies`, `payment_events`, `members`, `property_flags` shapes.
- **Airbnb member identity strategy.** Mirrors Phase 2A's vault synthetic-ID fallback. Real Airbnb guest user IDs aren't always exposed in the host UI; when missing, `externalMemberId = "airbnb-guest:${confirmationCode}"`. When the host UI does expose a user ID, use it directly. The unique constraint `(platform, externalMemberId)` on `Member` already exists from Phase 1.
- **HTML fixtures.** Captured ONCE manually via the Chrome MCP (see "Pre-execution prep" below). Stored under `roomos/packages/worker/tests/fixtures/airbnb/`. Sub-agent tasks parse these — they don't re-capture.

---

## File structure (locked in before tasks)

```
roomos/
├── packages/
│   ├── db/
│   │   └── prisma/
│   │       ├── schema.prisma                                # MODIFIED (Task 2)
│   │       └── migrations/<ts>_phase_2b_airbnb/
│   │           └── migration.sql                            # NEW (Task 2)
│   └── worker/
│       ├── src/
│       │   ├── airbnb/                                      # NEW package
│       │   │   ├── types.ts                                 # Task 3
│       │   │   ├── session.ts                               # Task 5 — read/write storage_state
│       │   │   ├── login.ts                                 # Task 6 — interactive login
│       │   │   ├── parsers/
│       │   │   │   ├── listings.ts                          # Task 7
│       │   │   │   ├── calendar.ts                          # Task 8
│       │   │   │   └── transactions.ts                      # Task 9
│       │   │   ├── matcher.ts                               # Task 10 — room match heuristic
│       │   │   ├── persist/
│       │   │   │   ├── listing.ts                           # Task 11
│       │   │   │   ├── occupancy.ts                         # Task 12
│       │   │   │   └── payment.ts                           # Task 13
│       │   │   ├── cross-listing.ts                         # Task 14 — derived query + flag write
│       │   │   └── sync.ts                                  # Task 15 — orchestrator
│       │   ├── jobs/
│       │   │   └── airbnb-sync.ts                           # Task 16
│       │   ├── scheduler.ts                                 # MODIFIED — Task 17
│       │   └── cli.ts                                       # MODIFIED — Task 17 (airbnb-sync + airbnb-login commands)
│       ├── tests/
│       │   ├── airbnb/
│       │   │   ├── listings.test.ts                         # Task 7
│       │   │   ├── calendar.test.ts                         # Task 8
│       │   │   ├── transactions.test.ts                     # Task 9
│       │   │   ├── matcher.test.ts                          # Task 10
│       │   │   ├── persist-listing.test.ts                  # Task 11
│       │   │   ├── persist-occupancy.test.ts                # Task 12
│       │   │   ├── persist-payment.test.ts                  # Task 13
│       │   │   ├── cross-listing.test.ts                    # Task 14
│       │   │   └── sync.integration.test.ts                 # Task 15
│       │   └── fixtures/airbnb/
│       │       ├── hosting-listings.html                    # captured pre-execution
│       │       ├── hosting-calendar-12345.html              # captured pre-execution
│       │       └── hosting-transactions.html                # captured pre-execution
├── apps/web/src/
│   ├── lib/property-queries.ts                              # MODIFIED — Task 18 (getCrossListedRooms + getUnmappedAirbnbListings)
│   ├── app/(signed-in)/settings/
│   │   ├── airbnb/page.tsx                                  # NEW — Task 19 (mapping confirmation page)
│   │   └── airbnb/actions.ts                                # NEW — Task 19 (Server Actions: confirmMapping/dismiss)
│   ├── components/
│   │   ├── settings/SettingsTabs.tsx                        # MODIFIED — Task 19 (add Airbnb tab)
│   │   └── properties/
│   │       └── CrossListingBadge.tsx                        # NEW — Task 20 (banner used in PropertiesTable + PropertyHero)
│   └── components/properties/PropertiesTable.tsx            # MODIFIED — Task 20 (show CrossListingBadge per-row)
└── docs/superpowers/DEPLOYMENT-2B.md                        # NEW — Task 1, finalized in Task 21
```

## Conventions

- **TDD throughout** parsers + persist + matcher + cross-listing-flag writer.
- **Server components by default** in the web layer; the only client component is the Settings → Airbnb action button.
- **Idempotency invariants** (assert in tests):
  - Re-running `airbnb-sync` with no Airbnb-side change → 0 inserts beyond a fresh `sync_runs` row.
  - Adding a listing → 1 new `PlatformListing` row (if new) or update (if existing, by `(platform, externalListingId)`).
  - Adding a confirmed booking → 1 new `Occupancy` row (closed prior if status changed).
  - Adding a payout transaction → 1 new `PaymentEvent` row keyed by Airbnb confirmation code; re-running produces 0 new rows.
  - Cross-listing flag → 1 row keyed by `(propertyId, MANUAL, "cross-listing-${roomId}")`; re-running produces 0 new rows; if the cross-listing condition clears (one of the listings deactivates), the flag's `closed_at` is set.

---

## Pre-execution prep (Jordan does once, with my help)

**Capture Airbnb HTML fixtures via the Chrome MCP** before dispatching Task 7. The implementer subagents can't reach a live `airbnb.com/hosting` page; they need real captured HTML to write parser tests against.

Three pages to capture from a signed-in browser:

1. `https://www.airbnb.com/hosting/listings` — Full DOM after listings load. Save to `roomos/packages/worker/tests/fixtures/airbnb/hosting-listings.html`.
2. `https://www.airbnb.com/hosting/calendar/<any-listing-id>` — One listing's calendar with current + upcoming bookings. Save to `…/hosting-calendar-12345.html`.
3. `https://www.airbnb.com/hosting/transactions` — Recent transactions page. Save to `…/hosting-transactions.html`.

If Jordan hasn't done the interactive login yet (Task 6 hasn't run), this can happen in his normal Chrome session. The fixture HTML doesn't need to be from the same browser as the eventual scrape.

**This is a manual step — sub-agents cannot do it for you. Capture the fixtures, commit them under `tests/fixtures/airbnb/`, then dispatch Task 7 onward.**

---

## Tasks

### Task 1: Bootstrap the Phase 2B deployment doc

**Files:**
- Create: `docs/superpowers/DEPLOYMENT-2B.md`

- [ ] **Step 1: Write the deployment doc skeleton**

```markdown
<!-- docs/superpowers/DEPLOYMENT-2B.md -->
# RoomOS Phase 2B — Manual Deployment Steps

Run these once after Phase 2B code lands on `main`.

## 1. Apply the Phase 2B database migration

From the deploy environment (`railway run --service Postgres` or equivalent):

\`\`\`bash
cd roomos
pnpm install
pnpm --filter @roomos/db exec prisma migrate deploy
pnpm db:generate
\`\`\`

Confirm:
\`\`\`bash
psql "$DATABASE_URL" -c "\d platform_listings" | grep -E "room_id|external_listing_id"
\`\`\`

`room_id` should be nullable; a new unique index on `(platform, external_listing_id)` should be present.

## 2. Interactive Airbnb login (one-time on Mac Studio)

\`\`\`bash
cd roomos
pnpm --filter @roomos/worker exec tsx src/cli.ts airbnb-login
\`\`\`

A headful Chromium window opens at `airbnb.com/login`. Sign in, handle any MFA. When you land on `/hosting`, the worker captures the storage state and exits. Cookie jar lands at `~/Library/Application Support/RoomOS/.auth/airbnb.json`.

## 3. Restart the launchd worker

The new `airbnb-sync` recurring job is registered automatically when the scheduler restarts:

\`\`\`bash
launchctl kickstart -k gui/$(id -u)/com.cohostmgmt.roomos.vault
\`\`\`

Tail logs and confirm both `vault-sync` and `airbnb-sync` recurring jobs are scheduled:

\`\`\`bash
tail -f ~/Library/Logs/RoomOS/vault.stdout.log
\`\`\`

Look for two `INFO: scheduler running` log lines mentioning each job.

## 4. Smoke test

(Filled in by Task 21.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-2B.md
git commit -m "docs(2b): start Phase 2B deployment doc"
```

---

### Task 2: Prisma schema delta — nullable `roomId`, new unique on `(platform, externalListingId)`

**Files:**
- Modify: `roomos/packages/db/prisma/schema.prisma`
- Create: `roomos/packages/db/prisma/migrations/<ts>_phase_2b_airbnb/migration.sql`

- [ ] **Step 1a: Add `AIRBNB_SYNC` to the SyncKind enum**

In `roomos/packages/db/prisma/schema.prisma`, find the `enum SyncKind { ... }` block. Add `AIRBNB_SYNC`:

```prisma
enum SyncKind {
  DISCOVERY
  OCCUPANCY
  FINANCIAL
  INTERACTIVE_LOGIN
  VAULT_SYNC
  AIRBNB_SYNC
}
```

- [ ] **Step 1b: Update `PlatformListing` in schema.prisma**

Find the `model PlatformListing { ... }` block. Change:

```prisma
  roomId              String         @map("room_id")
```

To:

```prisma
  roomId              String?        @map("room_id")
```

Remove the existing `@@unique([roomId, platform])` and replace with the new key:

```prisma
  @@unique([platform, externalListingId], map: "platform_listings_platform_external_listing_id_key")
```

(The old `roomId_platform` unique would have allowed multiple `(NULL, AIRBNB)` rows anyway, but we drop it to be explicit and avoid Prisma generating two competing unique keys.)

Also change the `Room` ↔ `PlatformListing` relation:

```prisma
  // Inside model Room
  listings PlatformListing[]
```

stays the same — Prisma handles nullable foreign keys via the optional side.

And on the `PlatformListing` model, change:

```prisma
  room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)
```

To:

```prisma
  room Room? @relation(fields: [roomId], references: [id], onDelete: SetNull)
```

The `SetNull` cascade means: when a Room is deleted, the listing stays but loses its mapping (good — it surfaces as unmapped again rather than disappearing).

- [ ] **Step 2: Generate the migration offline**

```bash
cd roomos
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
mkdir -p packages/db/prisma/migrations/${TIMESTAMP}_phase_2b_airbnb
pnpm --filter @roomos/db exec prisma migrate diff \
  --from-schema-datasource packages/db/prisma/schema.prisma \
  --to-schema-datamodel packages/db/prisma/schema.prisma \
  --script > packages/db/prisma/migrations/${TIMESTAMP}_phase_2b_airbnb/migration.sql
```

Wait — `--from-schema-datasource` and `--to-schema-datamodel` against the same file produce empty output. Use this instead, against the prior committed schema:

```bash
git show HEAD~:roomos/packages/db/prisma/schema.prisma > /tmp/prev-schema.prisma
pnpm --filter @roomos/db exec prisma migrate diff \
  --from-schema-datamodel /tmp/prev-schema.prisma \
  --to-schema-datamodel packages/db/prisma/schema.prisma \
  --script > packages/db/prisma/migrations/${TIMESTAMP}_phase_2b_airbnb/migration.sql
rm /tmp/prev-schema.prisma
```

- [ ] **Step 3: Inspect the generated migration SQL**

It should contain (in any order):
- `ALTER TABLE "platform_listings" ALTER COLUMN "room_id" DROP NOT NULL;`
- `DROP INDEX "platform_listings_room_id_platform_key";`
- `CREATE UNIQUE INDEX "platform_listings_platform_external_listing_id_key" ON "platform_listings"("platform", "external_listing_id");`
- `ALTER TABLE "platform_listings" DROP CONSTRAINT "platform_listings_room_id_fkey", ADD CONSTRAINT "platform_listings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;`

If Prisma generates additional incidental DDL, leave it; if anything is missing from the above, manually add it to the migration.sql before committing.

- [ ] **Step 4: Apply to local roomos_dev to verify it parses cleanly**

```bash
cd roomos
DATABASE_URL=postgresql://postgres@localhost:5432/roomos_dev pnpm --filter @roomos/db exec prisma migrate deploy
DATABASE_URL=postgresql://postgres@localhost:5432/roomos_dev pnpm db:generate
psql -h localhost -U postgres -d roomos_dev -c "\d platform_listings" | grep -E "room_id|external_listing_id" | head -4
```

Expected: `room_id` is now nullable; new unique index exists.

- [ ] **Step 5: Update DEPLOYMENT-2B.md §1 with the verification psql command** (already in Task 1's draft — confirm it matches the generated SQL).

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/db/prisma/schema.prisma \
        roomos/packages/db/prisma/migrations/*_phase_2b_airbnb \
        docs/superpowers/DEPLOYMENT-2B.md
git commit -m "schema(2b): platform_listings.room_id nullable; unique on (platform, external_listing_id)"
```

---

### Task 3: Airbnb types module

**Files:**
- Create: `roomos/packages/worker/src/airbnb/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// Airbnb adapter — typed shapes for parser output and persist input.

export type AirbnbListingRow = {
  airbnbListingId: string          // Airbnb's internal numeric ID
  title: string                     // listing title — used for room# extraction
  address: string                   // street address as shown in host UI
  listingType: "entire_home" | "private_room" | "shared_room" | "unknown"
  status: "active" | "snoozed" | "in_progress" | "unlisted" | "unknown"
}

export type AirbnbBookingRow = {
  airbnbListingId: string
  confirmationCode: string          // primary key for occupancy uniqueness
  guestName: string                 // first name only in host UI
  guestUserId: string | null        // not always exposed
  checkIn: string                   // ISO date "2026-05-12"
  checkOut: string                  // ISO date
  status: "confirmed" | "pending" | "canceled" | "completed" | "unknown"
}

export type AirbnbTransactionRow = {
  confirmationCode: string          // joins to AirbnbBookingRow
  payoutDate: string                // ISO date
  grossAmount: number               // dollars
  netAmount: number                 // dollars (after Airbnb fee)
  type: "payout" | "refund" | "adjustment" | "unknown"
}

export type AirbnbSyncResult = {
  listingsParsed: number
  bookingsParsed: number
  transactionsParsed: number
  listingsUpserted: number
  bookingsUpserted: number
  paymentEventsUpserted: number
  mappingsAuto: number              // listings auto-matched to a room
  mappingsAmbiguous: number         // listings that need Jordan's confirmation
  crossListings: number             // rooms with both PADSPLIT + AIRBNB active
  errors: { stage: string; reason: string }[]
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/packages/worker/src/airbnb/types.ts
git commit -m "airbnb(2b): parser/persist types"
```

---

### Task 4: Add `node-keytar` for cookie-jar encryption (or document plain-file fallback)

**Files:**
- Modify: `roomos/packages/worker/package.json`

- [ ] **Step 1: Check if keytar is already installed**

```bash
cd roomos
grep keytar packages/worker/package.json || echo "not installed"
```

- [ ] **Step 2: If not installed, add it**

```bash
pnpm --filter @roomos/worker add keytar
```

If `keytar` build fails on the install machine (it's a native module — needs python + a C++ toolchain), abort and fall back to a plaintext cookie jar with a clear note in DEPLOYMENT-2B.md §2: "Cookie jar at `~/Library/Application Support/RoomOS/.auth/airbnb.json` is plaintext; macOS file permissions are the only protection. Do not check in. Lock down with `chmod 600`."

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/package.json roomos/pnpm-lock.yaml
git commit -m "airbnb(2b): keytar dep for cookie-jar encryption"
```

---

### Task 5: Airbnb session reader/writer

**Files:**
- Create: `roomos/packages/worker/src/airbnb/session.ts`

- [ ] **Step 1: Write the session helpers**

```typescript
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const AUTH_DIR = join(homedir(), "Library", "Application Support", "RoomOS", ".auth")
const STORAGE_PATH = join(AUTH_DIR, "airbnb.json")

/** Returns the absolute path the Playwright `storage_state` should be loaded from / written to. */
export function airbnbStorageStatePath(): string {
  mkdirSync(AUTH_DIR, { recursive: true })
  return STORAGE_PATH
}

/** True iff a saved Airbnb storage state exists. */
export function airbnbSessionExists(): boolean {
  return existsSync(STORAGE_PATH)
}

/** Reads the storage state into a JS object. Throws if missing. */
export function loadAirbnbStorageState(): unknown {
  if (!existsSync(STORAGE_PATH)) {
    throw new Error(`Airbnb session not found at ${STORAGE_PATH}. Run 'worker airbnb-login' first.`)
  }
  return JSON.parse(readFileSync(STORAGE_PATH, "utf-8"))
}

/** Writes (overwrites) the storage state. Locks file mode to 600. */
export function saveAirbnbStorageState(state: unknown): void {
  mkdirSync(AUTH_DIR, { recursive: true })
  writeFileSync(STORAGE_PATH, JSON.stringify(state, null, 2))
  chmodSync(STORAGE_PATH, 0o600)
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/packages/worker/src/airbnb/session.ts
git commit -m "airbnb(2b): storage_state read/write helpers"
```

---

### Task 6: Interactive Airbnb login command

**Files:**
- Create: `roomos/packages/worker/src/airbnb/login.ts`

- [ ] **Step 1: Write the login function**

```typescript
import { chromium } from "playwright"
import { airbnbStorageStatePath, saveAirbnbStorageState } from "./session"
import { log } from "../log"

const LOGIN_URL = "https://www.airbnb.com/login"
const HOST_DASHBOARD_URL = "https://www.airbnb.com/hosting"

const HOST_DASHBOARD_READY_RE = /\/hosting(\/|$)/

/**
 * Opens a headful Chromium at airbnb.com/login. Waits for the user to land on
 * /hosting (= login complete). Captures cookies + storage_state, writes them
 * to the persistent jar, and exits.
 *
 * Idempotent: re-running while signed in goes straight to /hosting and saves
 * a fresh storage_state.
 */
export async function airbnbInteractiveLogin(): Promise<void> {
  const browser = await chromium.launch({ headless: false, channel: "chrome" })
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" })
    log.info("Awaiting interactive login. Sign in and complete any MFA.")
    // Wait up to 10 minutes for the URL to settle on /hosting.
    await page.waitForURL(HOST_DASHBOARD_READY_RE, { timeout: 10 * 60 * 1000 })
    log.info("Login detected. Saving storage state.")
    const state = await context.storageState()
    saveAirbnbStorageState(state)
    log.info({ path: airbnbStorageStatePath() }, "Storage state saved.")
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/packages/worker/src/airbnb/login.ts
git commit -m "airbnb(2b): interactive login captures storage_state"
```

---

### Task 7: Listings page parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/parsers/listings.ts`
- Test: `roomos/packages/worker/tests/airbnb/listings.test.ts`
- Fixture: `roomos/packages/worker/tests/fixtures/airbnb/hosting-listings.html` (captured in Pre-execution prep)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseHostingListings } from "../../src/airbnb/parsers/listings"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/airbnb/hosting-listings.html"),
  "utf-8",
)

describe("parseHostingListings", () => {
  it("returns at least one listing row", () => {
    const rows = parseHostingListings(FIXTURE)
    expect(rows.length).toBeGreaterThan(0)
  })

  it("every row has airbnbListingId + title + address", () => {
    const rows = parseHostingListings(FIXTURE)
    for (const r of rows) {
      expect(r.airbnbListingId).toMatch(/^\d+$/)
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.address.length).toBeGreaterThan(0)
    }
  })

  it("returns an empty array if the page has no listings markup", () => {
    expect(parseHostingListings("<html><body><div>no listings here</div></body></html>")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- airbnb/listings
```

Expected: FAIL — module not found.

- [ ] **Step 3: Inspect the fixture HTML to find selectors**

Open `tests/fixtures/airbnb/hosting-listings.html` in a browser or read it directly. Identify:
- The container element wrapping each listing card (likely `[data-testid^="listing-card"]` or similar).
- Within each card: the listing ID (often in a `href` like `/hosting/listings/<id>`), the title text, the address text, the listing-type indicator, and status pill.

**Critical:** Airbnb's host dashboard markup uses generated class names and aggressive React rehydration. Stable hooks are `data-testid` attributes (where present) or anchor `href` patterns. Avoid coupling to class names — they change weekly.

- [ ] **Step 4: Write the parser**

Use `jsdom` (already in worker package per Phase 1B) to parse the DOM. Sketch:

```typescript
import { JSDOM } from "jsdom"
import type { AirbnbListingRow } from "../types"

const LISTING_HREF_RE = /\/hosting\/listings\/(\d+)/

export function parseHostingListings(html: string): AirbnbListingRow[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const rows: AirbnbListingRow[] = []
  // Each listing card has at least one anchor pointing at /hosting/listings/<id>.
  // Group anchors by the captured ID to dedupe (one card may contain several anchors).
  const seen = new Set<string>()
  for (const anchor of Array.from(doc.querySelectorAll("a[href*='/hosting/listings/']"))) {
    const href = anchor.getAttribute("href") ?? ""
    const m = href.match(LISTING_HREF_RE)
    if (!m) continue
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    const card = anchor.closest("[role='row'], [data-testid], li, article") ?? anchor.parentElement
    if (!card) continue
    const title = (card.querySelector("[data-testid='listing-title'], h2, h3")?.textContent ?? "").trim()
    const address = (card.querySelector("[data-testid='listing-address']")?.textContent ?? "").trim()
    if (!title || !address) continue
    rows.push({
      airbnbListingId: id,
      title,
      address,
      listingType: inferType(card),
      status: inferStatus(card),
    })
  }
  return rows
}

function inferType(card: Element): AirbnbListingRow["listingType"] {
  const text = card.textContent?.toLowerCase() ?? ""
  if (text.includes("entire")) return "entire_home"
  if (text.includes("private room")) return "private_room"
  if (text.includes("shared")) return "shared_room"
  return "unknown"
}

function inferStatus(card: Element): AirbnbListingRow["status"] {
  const text = card.textContent?.toLowerCase() ?? ""
  if (text.includes("snoozed")) return "snoozed"
  if (text.includes("in progress")) return "in_progress"
  if (text.includes("unlisted")) return "unlisted"
  return "active"
}
```

**Selector caveat:** the exact `data-testid` strings vary by Airbnb's deploy. The implementer should adjust the selectors after inspecting the actual fixture HTML. If `[data-testid='listing-title']` doesn't match the fixture, fall back to the first `h2` or `h3` inside the card.

- [ ] **Step 5: Run test, iterate selectors until 3/3 pass**

```bash
cd roomos && pnpm --filter @roomos/worker test -- airbnb/listings
```

If a test fails because Airbnb's actual markup doesn't fit the assumed shape (e.g. no `data-testid='listing-address'`), update the parser to use whatever stable hook the fixture HTML actually exposes. **Do not adjust the test expectations** — they encode the contract this adapter needs.

- [ ] **Step 6: Commit**

```bash
git add roomos/packages/worker/src/airbnb/parsers/listings.ts \
        roomos/packages/worker/tests/airbnb/listings.test.ts \
        roomos/packages/worker/tests/fixtures/airbnb/hosting-listings.html
git commit -m "airbnb(2b): listings parser (TDD)"
```

---

### Task 8: Calendar page parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/parsers/calendar.ts`
- Test: `roomos/packages/worker/tests/airbnb/calendar.test.ts`
- Fixture: `roomos/packages/worker/tests/fixtures/airbnb/hosting-calendar-12345.html`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseHostingCalendar } from "../../src/airbnb/parsers/calendar"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/airbnb/hosting-calendar-12345.html"),
  "utf-8",
)

describe("parseHostingCalendar", () => {
  it("returns each booking on the calendar with check-in/out dates", () => {
    const rows = parseHostingCalendar(FIXTURE, "12345")
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.airbnbListingId).toBe("12345")
      expect(r.confirmationCode).toMatch(/^[A-Z0-9]{6,}$/)
      expect(r.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.checkOut).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it("returns [] when the calendar has no bookings", () => {
    const empty = `<html><body><div role="main">No bookings yet</div></body></html>`
    expect(parseHostingCalendar(empty, "12345")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd roomos && pnpm --filter @roomos/worker test -- airbnb/calendar
```

- [ ] **Step 3: Inspect the fixture to find selectors, write the parser**

Calendar bookings on `airbnb.com/hosting/calendar/<id>` typically render as colored bars across day cells with hover-cards exposing the confirmation code and guest name. The DOM hook varies; commonly `[data-reservation-code]` or `[data-testid="reservation-bar"]`. Inspect the fixture and pick whatever stable hook is present.

```typescript
import { JSDOM } from "jsdom"
import type { AirbnbBookingRow } from "../types"

const CONFIRMATION_CODE_RE = /\b[A-Z0-9]{6,12}\b/

export function parseHostingCalendar(html: string, airbnbListingId: string): AirbnbBookingRow[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const rows: AirbnbBookingRow[] = []
  // Adjust selector based on the actual fixture markup.
  const bars = doc.querySelectorAll("[data-reservation-code], [data-testid='reservation-bar']")
  for (const bar of Array.from(bars)) {
    const code = bar.getAttribute("data-reservation-code") ?? extractCode(bar.textContent ?? "")
    if (!code) continue
    const checkIn = bar.getAttribute("data-check-in") ?? ""
    const checkOut = bar.getAttribute("data-check-out") ?? ""
    if (!checkIn || !checkOut) continue
    rows.push({
      airbnbListingId,
      confirmationCode: code,
      guestName: (bar.querySelector("[data-testid='guest-name']")?.textContent ?? "").trim(),
      guestUserId: bar.getAttribute("data-guest-user-id"),
      checkIn,
      checkOut,
      status: inferBookingStatus(bar),
    })
  }
  return rows
}

function extractCode(text: string): string | null {
  const m = text.match(CONFIRMATION_CODE_RE)
  return m ? m[0] : null
}

function inferBookingStatus(el: Element): AirbnbBookingRow["status"] {
  const cls = el.className?.toString().toLowerCase() ?? ""
  if (cls.includes("canceled")) return "canceled"
  if (cls.includes("pending")) return "pending"
  if (cls.includes("completed")) return "completed"
  return "confirmed"
}
```

- [ ] **Step 4: Iterate against fixture until tests pass**

```bash
cd roomos && pnpm --filter @roomos/worker test -- airbnb/calendar
```

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/airbnb/parsers/calendar.ts \
        roomos/packages/worker/tests/airbnb/calendar.test.ts \
        roomos/packages/worker/tests/fixtures/airbnb/hosting-calendar-12345.html
git commit -m "airbnb(2b): calendar parser (TDD)"
```

---

### Task 9: Transactions page parser (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/parsers/transactions.ts`
- Test: `roomos/packages/worker/tests/airbnb/transactions.test.ts`
- Fixture: `roomos/packages/worker/tests/fixtures/airbnb/hosting-transactions.html`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseHostingTransactions } from "../../src/airbnb/parsers/transactions"

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/airbnb/hosting-transactions.html"),
  "utf-8",
)

describe("parseHostingTransactions", () => {
  it("returns each payout/refund row with a confirmation code", () => {
    const rows = parseHostingTransactions(FIXTURE)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.confirmationCode).toMatch(/^[A-Z0-9]{6,}$/)
      expect(r.payoutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof r.grossAmount).toBe("number")
      expect(typeof r.netAmount).toBe("number")
    }
  })

  it("returns [] when no transactions are visible", () => {
    expect(parseHostingTransactions("<html><body></body></html>")).toEqual([])
  })
})
```

- [ ] **Step 2: Run + verify fails, write parser, run + pass**

Same pattern as Task 7/8. Parse the transactions table — typically a `<table>` with rows containing date, confirmation code, type, amount, fee, net. Adjust selectors against the actual fixture.

```typescript
import { JSDOM } from "jsdom"
import type { AirbnbTransactionRow } from "../types"

export function parseHostingTransactions(html: string): AirbnbTransactionRow[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const rows: AirbnbTransactionRow[] = []
  for (const tr of Array.from(doc.querySelectorAll("table tbody tr"))) {
    const cells = Array.from(tr.querySelectorAll("td"))
    if (cells.length < 5) continue
    const dateText = (cells[0]?.textContent ?? "").trim()
    const codeText = (cells[1]?.textContent ?? "").trim()
    const typeText = (cells[2]?.textContent ?? "").trim().toLowerCase()
    const grossText = (cells[3]?.textContent ?? "").trim()
    const netText = (cells[4]?.textContent ?? "").trim()
    const isoDate = isoFromHuman(dateText)
    if (!isoDate) continue
    rows.push({
      confirmationCode: codeText,
      payoutDate: isoDate,
      grossAmount: dollars(grossText),
      netAmount: dollars(netText),
      type:
        typeText.includes("refund") ? "refund" :
        typeText.includes("adjust") ? "adjustment" :
        typeText.includes("payout") ? "payout" : "unknown",
    })
  }
  return rows
}

function dollars(s: string): number {
  return Number(s.replace(/[^0-9.\-]/g, ""))
}

function isoFromHuman(s: string): string | null {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/parsers/transactions.ts \
        roomos/packages/worker/tests/airbnb/transactions.test.ts \
        roomos/packages/worker/tests/fixtures/airbnb/hosting-transactions.html
git commit -m "airbnb(2b): transactions parser (TDD)"
```

---

### Task 10: Room matcher (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/matcher.ts`
- Test: `roomos/packages/worker/tests/airbnb/matcher.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { matchListingToRoom } from "../../src/airbnb/matcher"

const ORG_ID = "org-test-2b-matcher"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B MATCHER" } })
})

async function seedProperty(address: string, rooms: string[]): Promise<{ propertyId: string; roomIds: Record<string, string> }> {
  const p = await prisma.property.create({
    data: { orgId: ORG_ID, address, padsplitPropertyId: `m-${Date.now()}-${Math.random()}` },
  })
  const roomIds: Record<string, string> = {}
  for (const rn of rooms) {
    const r = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: p.id, roomNumber: rn } })
    roomIds[rn] = r.id
  }
  return { propertyId: p.id, roomIds }
}

describe("matchListingToRoom", () => {
  it("matches by 'Room N' in title when property has that room", async () => {
    const { roomIds } = await seedProperty("1311 Morgana Rd, Jacksonville, FL", ["R1", "R2", "R3"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "1",
      title: "Cozy Private Room R2 — Jacksonville",
      address: "1311 Morgana Rd Jacksonville FL",
      listingType: "private_room",
      status: "active",
    })
    expect(result.roomId).toBe(roomIds["R2"])
    expect(result.ambiguous).toBe(false)
  })

  it("matches entire_home listings to the single room when property has one room", async () => {
    const { roomIds } = await seedProperty("7728 Linkside Loop, Kissimmee, FL", ["R1"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "2",
      title: "Whole house in Kissimmee",
      address: "7728 Linkside Loop, Kissimmee, FL",
      listingType: "entire_home",
      status: "active",
    })
    expect(result.roomId).toBe(roomIds["R1"])
  })

  it("returns null roomId and ambiguous=true when no room can be inferred", async () => {
    await seedProperty("999 Unknown St", ["R1", "R2"])
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "3",
      title: "Stay in our home",
      address: "999 Unknown St",
      listingType: "entire_home",   // can't pick a single room
      status: "active",
    })
    expect(result.roomId).toBeNull()
    expect(result.ambiguous).toBe(true)
    expect(result.candidatePropertyId).not.toBeNull()
  })

  it("returns null propertyId when no property matches the address at all", async () => {
    const result = await matchListingToRoom(ORG_ID, {
      airbnbListingId: "4",
      title: "Random place",
      address: "404 Nowhere Ln",
      listingType: "entire_home",
      status: "active",
    })
    expect(result.roomId).toBeNull()
    expect(result.candidatePropertyId).toBeNull()
  })
})
```

- [ ] **Step 2: Run + verify fails, write matcher, run + pass**

```typescript
import { prisma } from "@roomos/db"
import type { AirbnbListingRow } from "./types"

export type MatchResult = {
  roomId: string | null
  candidatePropertyId: string | null
  ambiguous: boolean
}

export async function matchListingToRoom(orgId: string, listing: AirbnbListingRow): Promise<MatchResult> {
  const normalizedListing = normalizeAddress(listing.address)
  if (!normalizedListing) return { roomId: null, candidatePropertyId: null, ambiguous: false }

  const properties = await prisma.property.findMany({ where: { orgId } })
  const candidate = properties.find((p) => normalizeAddress(p.address) === normalizedListing)
  if (!candidate) return { roomId: null, candidatePropertyId: null, ambiguous: false }

  const rooms = await prisma.room.findMany({ where: { propertyId: candidate.id } })
  if (rooms.length === 0) return { roomId: null, candidatePropertyId: candidate.id, ambiguous: true }

  // Title "Room N" / "R N" / "RN"?
  const roomNumberInTitle = listing.title.match(/\bR\s*0*(\d+)\b/i) ?? listing.title.match(/\broom\s+0*(\d+)\b/i)
  if (roomNumberInTitle) {
    const want = `R${roomNumberInTitle[1]}`.toUpperCase()
    const match = rooms.find((r) => r.roomNumber?.toUpperCase() === want)
    if (match) return { roomId: match.id, candidatePropertyId: candidate.id, ambiguous: false }
  }

  // Entire home + single room → that room
  if (listing.listingType === "entire_home" && rooms.length === 1) {
    return { roomId: rooms[0]!.id, candidatePropertyId: candidate.id, ambiguous: false }
  }

  // Anything else: ambiguous
  return { roomId: null, candidatePropertyId: candidate.id, ambiguous: true }
}

function normalizeAddress(s: string): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .replace(/\bnortheast\b/g, "ne")
    .replace(/\bnorthwest\b/g, "nw")
    .replace(/\bsoutheast\b/g, "se")
    .replace(/\bsouthwest\b/g, "sw")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\broad\b/g, "rd")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcircle\b/g, "cir")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bunit\s+[a-z0-9]+\b/g, "")
    .replace(/\bapt\s+[a-z0-9]+\b/g, "")
    .replace(/[,.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/matcher.ts \
        roomos/packages/worker/tests/airbnb/matcher.test.ts
git commit -m "airbnb(2b): room-match heuristic (TDD)"
```

---

### Task 11: PlatformListing upserter for Airbnb (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/persist/listing.ts`
- Test: `roomos/packages/worker/tests/airbnb/persist-listing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbListing } from "../../src/airbnb/persist/listing"

const ORG_ID = "org-test-2b-listing"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B LISTING" } })
})

describe("upsertAirbnbListing", () => {
  it("creates a new PlatformListing with platform=AIRBNB and the given roomId", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: `t-${Date.now()}` },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: property.id, roomNumber: "R1" } })

    const id = await upsertAirbnbListing(ORG_ID, {
      airbnbListingId: "12345",
      roomId: room.id,
      isActive: true,
    })
    const row = await prisma.platformListing.findUnique({ where: { id } })
    expect(row?.platform).toBe("AIRBNB")
    expect(row?.externalListingId).toBe("12345")
    expect(row?.roomId).toBe(room.id)
    expect(row?.isActive).toBe(true)
  })

  it("accepts a NULL roomId for unmapped listings", async () => {
    const id = await upsertAirbnbListing(ORG_ID, {
      airbnbListingId: "67890",
      roomId: null,
      isActive: true,
    })
    const row = await prisma.platformListing.findUnique({ where: { id } })
    expect(row?.roomId).toBeNull()
  })

  it("is idempotent and updates roomId when Jordan later confirms a mapping", async () => {
    const property = await prisma.property.create({
      data: { orgId: ORG_ID, address: "x", padsplitPropertyId: `t-${Date.now()}` },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: property.id, roomNumber: "R1" } })

    const a = await upsertAirbnbListing(ORG_ID, { airbnbListingId: "55555", roomId: null, isActive: true })
    const b = await upsertAirbnbListing(ORG_ID, { airbnbListingId: "55555", roomId: room.id, isActive: true })
    expect(b).toBe(a)
    const row = await prisma.platformListing.findUnique({ where: { id: a } })
    expect(row?.roomId).toBe(room.id)
  })
})
```

- [ ] **Step 2: Run + verify fails, write upserter, run + pass**

```typescript
import { prisma } from "@roomos/db"

export type UpsertAirbnbListingInput = {
  airbnbListingId: string
  roomId: string | null
  isActive: boolean
}

export async function upsertAirbnbListing(orgId: string, input: UpsertAirbnbListingInput): Promise<string> {
  const existing = await prisma.platformListing.findUnique({
    where: { platform_externalListingId: { platform: "AIRBNB", externalListingId: input.airbnbListingId } },
  })
  const data = {
    orgId,
    platform: "AIRBNB" as const,
    externalListingId: input.airbnbListingId,
    roomId: input.roomId,
    isActive: input.isActive,
    lastSyncedAt: new Date(),
  }
  if (existing) {
    await prisma.platformListing.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.platformListing.create({ data })
  return created.id
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/persist/listing.ts \
        roomos/packages/worker/tests/airbnb/persist-listing.test.ts
git commit -m "airbnb(2b): platform_listing upserter (TDD)"
```

---

### Task 12: Occupancy upserter for Airbnb bookings (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/persist/occupancy.ts`
- Test: `roomos/packages/worker/tests/airbnb/persist-occupancy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbOccupancyForBooking } from "../../src/airbnb/persist/occupancy"

const ORG_ID = "org-test-2b-occ"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seed() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B OCC" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  const l = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: r.id, platform: "AIRBNB", externalListingId: `${Date.now()}`, isActive: true },
  })
  return { listing: l }
}

describe("upsertAirbnbOccupancyForBooking", () => {
  it("creates an OCCUPIED occupancy for a confirmed current stay", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await upsertAirbnbOccupancyForBooking({
      orgId: ORG_ID,
      listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "ABC123",
        guestName: "Alice",
        guestUserId: null,
        checkIn: today,
        checkOut: tomorrow,
        status: "confirmed",
      },
    })
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("OCCUPIED")
  })

  it("creates a MOVING_OUT occupancy when checkOut is today", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    await upsertAirbnbOccupancyForBooking({
      orgId: ORG_ID,
      listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "MOV456",
        guestName: "Bob",
        guestUserId: null,
        checkIn: yesterday,
        checkOut: today,
        status: "confirmed",
      },
    })
    const row = await prisma.occupancy.findFirst({ where: { listingId: listing.id } })
    expect(row?.status).toBe("MOVING_OUT")
  })

  it("idempotent on the same confirmation code", async () => {
    const { listing } = await seed()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const args = {
      orgId: ORG_ID, listingId: listing.id,
      booking: {
        airbnbListingId: listing.externalListingId!,
        confirmationCode: "DUP789", guestName: "Carol", guestUserId: null,
        checkIn: today, checkOut: tomorrow, status: "confirmed" as const,
      },
    }
    await upsertAirbnbOccupancyForBooking(args)
    await upsertAirbnbOccupancyForBooking(args)
    const rows = await prisma.occupancy.findMany({ where: { listingId: listing.id } })
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run + verify fails, write upserter, run + pass**

```typescript
import { prisma } from "@roomos/db"
import type { OccupancyStatus } from "@roomos/db"
import type { AirbnbBookingRow } from "../types"

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function statusFor(booking: AirbnbBookingRow, now: Date): OccupancyStatus | null {
  if (booking.status === "canceled") return null
  const today = now.toISOString().slice(0, 10)
  if (booking.checkIn === today) return "MOVING_IN"
  if (booking.checkOut === today) return "MOVING_OUT"
  if (booking.checkIn < today && booking.checkOut > today) return "OCCUPIED"
  if (booking.checkIn > today) return null   // future booking — don't write yet
  return "INACTIVE"                            // past completed
}

async function upsertGuestMember(orgId: string, booking: AirbnbBookingRow): Promise<string> {
  const externalMemberId = booking.guestUserId ?? `airbnb-guest:${booking.confirmationCode}`
  const existing = await prisma.member.findUnique({
    where: { platform_externalMemberId: { platform: "AIRBNB", externalMemberId } },
  })
  if (existing) return existing.id
  const created = await prisma.member.create({
    data: { orgId, platform: "AIRBNB", externalMemberId, name: booking.guestName },
  })
  return created.id
}

export type UpsertAirbnbOccupancyInput = {
  orgId: string
  listingId: string
  booking: AirbnbBookingRow
}

export async function upsertAirbnbOccupancyForBooking(input: UpsertAirbnbOccupancyInput): Promise<void> {
  const status = statusFor(input.booking, new Date())
  if (!status) return

  // Idempotency: existing occupancy keyed by listing + member with matching dates and status
  const memberId = await upsertGuestMember(input.orgId, input.booking)

  const existing = await prisma.occupancy.findFirst({
    where: {
      listingId: input.listingId,
      memberId,
      moveInDate: new Date(input.booking.checkIn),
    },
  })
  if (existing) {
    if (existing.status !== status) {
      await prisma.occupancy.update({ where: { id: existing.id }, data: { status, leaseEndDate: new Date(input.booking.checkOut) } })
    }
    return
  }

  // Close any open occupancy on this listing if a new booking starts
  const open = await prisma.occupancy.findFirst({
    where: { listingId: input.listingId, leaseEndDate: null },
    orderBy: { createdAt: "desc" },
  })
  if (open && open.memberId !== memberId) {
    await prisma.occupancy.update({ where: { id: open.id }, data: { leaseEndDate: new Date() } })
  }

  await prisma.occupancy.create({
    data: {
      orgId: input.orgId,
      listingId: input.listingId,
      memberId,
      status,
      moveInDate: new Date(input.booking.checkIn),
      leaseEndDate: new Date(input.booking.checkOut),
      scrapedAt: new Date(),
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/persist/occupancy.ts \
        roomos/packages/worker/tests/airbnb/persist-occupancy.test.ts
git commit -m "airbnb(2b): booking → occupancy upserter (TDD)"
```

---

### Task 13: PaymentEvent inserter from transactions (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/persist/payment.ts`
- Test: `roomos/packages/worker/tests/airbnb/persist-payment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { upsertAirbnbPayment } from "../../src/airbnb/persist/payment"

const ORG_ID = "org-test-2b-pay"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedWithBooking() {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B PAY" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  const l = await prisma.platformListing.create({
    data: { orgId: org.id, roomId: r.id, platform: "AIRBNB", externalListingId: `${Date.now()}`, isActive: true },
  })
  const m = await prisma.member.create({
    data: { orgId: org.id, platform: "AIRBNB", externalMemberId: `airbnb-guest:CODE${Date.now()}`, name: "Guest" },
  })
  const occ = await prisma.occupancy.create({
    data: { orgId: org.id, listingId: l.id, memberId: m.id, status: "OCCUPIED" },
  })
  return { memberId: m.id, occupancyId: occ.id }
}

describe("upsertAirbnbPayment", () => {
  it("creates a PaymentEvent keyed by Airbnb confirmation code", async () => {
    const { memberId, occupancyId } = await seedWithBooking()
    await upsertAirbnbPayment({
      orgId: ORG_ID,
      memberId,
      occupancyId,
      transaction: { confirmationCode: "ABC1", payoutDate: "2026-05-08", grossAmount: 240, netAmount: 215, type: "payout" },
    })
    const rows = await prisma.paymentEvent.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
    expect(Number(rows[0]!.amount)).toBeCloseTo(215)
    expect(rows[0]!.source).toBe("AIRBNB_SCRAPE")
  })

  it("idempotent on the same confirmation code", async () => {
    const { memberId, occupancyId } = await seedWithBooking()
    const args = {
      orgId: ORG_ID, memberId, occupancyId,
      transaction: { confirmationCode: "DUP1", payoutDate: "2026-05-08", grossAmount: 240, netAmount: 215, type: "payout" as const },
    }
    await upsertAirbnbPayment(args)
    await upsertAirbnbPayment(args)
    const rows = await prisma.paymentEvent.findMany({ where: { memberId } })
    expect(rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run + verify fails, write inserter, run + pass**

```typescript
import { prisma } from "@roomos/db"
import type { AirbnbTransactionRow } from "../types"

export type UpsertAirbnbPaymentInput = {
  orgId: string
  memberId: string
  occupancyId: string | null
  transaction: AirbnbTransactionRow
}

export async function upsertAirbnbPayment(input: UpsertAirbnbPaymentInput): Promise<void> {
  const externalEventId = `airbnb:${input.transaction.confirmationCode}:${input.transaction.payoutDate}:${input.transaction.type}`
  const existing = await prisma.paymentEvent.findUnique({
    where: { memberId_externalEventId: { memberId: input.memberId, externalEventId } },
  })
  if (existing) return
  await prisma.paymentEvent.create({
    data: {
      orgId: input.orgId,
      memberId: input.memberId,
      occupancyId: input.occupancyId,
      amount: input.transaction.netAmount,
      eventType: input.transaction.type === "refund" ? "ADJUSTMENT" : "PAYMENT",
      eventDate: new Date(input.transaction.payoutDate),
      source: "AIRBNB_SCRAPE",
      externalEventId,
      rawJson: input.transaction as unknown as Record<string, unknown>,
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/persist/payment.ts \
        roomos/packages/worker/tests/airbnb/persist-payment.test.ts
git commit -m "airbnb(2b): transaction → payment_event inserter (TDD)"
```

---

### Task 14: Cross-listing detector + flag writer (TDD)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/cross-listing.ts`
- Test: `roomos/packages/worker/tests/airbnb/cross-listing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { detectAndFlagCrossListings } from "../../src/airbnb/cross-listing"

const ORG_ID = "org-test-2b-cross"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
})

async function seedRoomWith(...platforms: Array<"PADSPLIT" | "AIRBNB">) {
  const org = await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B CROSS" } })
  const p = await prisma.property.create({ data: { orgId: org.id, address: "x", padsplitPropertyId: `t-${Date.now()}` } })
  const r = await prisma.room.create({ data: { orgId: org.id, propertyId: p.id, roomNumber: "R1" } })
  for (const pl of platforms) {
    await prisma.platformListing.create({
      data: {
        orgId: org.id, roomId: r.id, platform: pl,
        externalListingId: `${pl}-${Date.now()}-${Math.random()}`, isActive: true,
      },
    })
  }
  return { propertyId: p.id, roomId: r.id }
}

describe("detectAndFlagCrossListings", () => {
  it("writes a DANGER flag when a room has both PADSPLIT and AIRBNB active", async () => {
    const { propertyId, roomId } = await seedRoomWith("PADSPLIT", "AIRBNB")
    const result = await detectAndFlagCrossListings(ORG_ID)
    expect(result.flagged).toBe(1)
    const flags = await prisma.propertyFlag.findMany({ where: { propertyId, closedAt: null } })
    expect(flags).toHaveLength(1)
    expect(flags[0]!.severity).toBe("DANGER")
    expect(flags[0]!.sourceRef).toBe(`cross-listing-${roomId}`)
  })

  it("does NOT flag a room with only PADSPLIT", async () => {
    await seedRoomWith("PADSPLIT")
    const result = await detectAndFlagCrossListings(ORG_ID)
    expect(result.flagged).toBe(0)
  })

  it("closes a previously-open cross-listing flag when the condition clears", async () => {
    const { propertyId, roomId } = await seedRoomWith("PADSPLIT", "AIRBNB")
    await detectAndFlagCrossListings(ORG_ID)
    // Deactivate the Airbnb listing
    await prisma.platformListing.updateMany({ where: { roomId, platform: "AIRBNB" }, data: { isActive: false } })
    await detectAndFlagCrossListings(ORG_ID)
    const flags = await prisma.propertyFlag.findMany({ where: { propertyId, sourceRef: `cross-listing-${roomId}` } })
    expect(flags).toHaveLength(1)
    expect(flags[0]!.closedAt).not.toBeNull()
  })

  it("idempotent — repeated runs with the same state produce no duplicates", async () => {
    await seedRoomWith("PADSPLIT", "AIRBNB")
    await detectAndFlagCrossListings(ORG_ID)
    await detectAndFlagCrossListings(ORG_ID)
    const count = await prisma.propertyFlag.count({ where: { orgId: ORG_ID } })
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 2: Run + verify fails, write detector, run + pass**

```typescript
import { prisma } from "@roomos/db"

export type CrossListingResult = { flagged: number; closed: number }

export async function detectAndFlagCrossListings(orgId: string): Promise<CrossListingResult> {
  // Step 1: Find every room with >1 distinct active platform.
  const activeListings = await prisma.platformListing.findMany({
    where: { orgId, isActive: true, roomId: { not: null } },
    select: { roomId: true, platform: true, room: { select: { propertyId: true } } },
  })
  const byRoom = new Map<string, { platforms: Set<string>; propertyId: string }>()
  for (const l of activeListings) {
    if (!l.roomId || !l.room) continue
    const entry = byRoom.get(l.roomId) ?? { platforms: new Set(), propertyId: l.room.propertyId }
    entry.platforms.add(l.platform)
    byRoom.set(l.roomId, entry)
  }

  const crossListedRoomIds = new Set<string>()
  for (const [roomId, entry] of byRoom.entries()) {
    if (entry.platforms.size > 1) crossListedRoomIds.add(roomId)
  }

  // Step 2: Open a DANGER flag for any cross-listed room (idempotent via upsert).
  let flagged = 0
  for (const roomId of crossListedRoomIds) {
    const entry = byRoom.get(roomId)!
    const sourceRef = `cross-listing-${roomId}`
    await prisma.propertyFlag.upsert({
      where: { propertyId_source_sourceRef: { propertyId: entry.propertyId, source: "MANUAL", sourceRef } },
      create: {
        orgId, propertyId: entry.propertyId, roomId,
        severity: "DANGER",
        title: "Cross-listed room — risk of double-booking",
        body: `This room is active on both PadSplit and Airbnb. Confirm bookings cannot overlap.`,
        source: "MANUAL", sourceRef,
      },
      update: { closedAt: null }, // re-open if it had been auto-closed before
    })
    flagged++
  }

  // Step 3: Auto-close any cross-listing flag whose room is no longer cross-listed.
  const openFlags = await prisma.propertyFlag.findMany({
    where: { orgId, source: "MANUAL", sourceRef: { startsWith: "cross-listing-" }, closedAt: null },
  })
  let closed = 0
  for (const f of openFlags) {
    const roomId = f.sourceRef?.replace("cross-listing-", "")
    if (roomId && !crossListedRoomIds.has(roomId)) {
      await prisma.propertyFlag.update({ where: { id: f.id }, data: { closedAt: new Date() } })
      closed++
    }
  }

  return { flagged, closed }
}
```

- [ ] **Step 3: Commit**

```bash
git add roomos/packages/worker/src/airbnb/cross-listing.ts \
        roomos/packages/worker/tests/airbnb/cross-listing.test.ts
git commit -m "airbnb(2b): cross-listing detector + auto-flag (TDD)"
```

---

### Task 15: `syncAirbnb()` orchestrator (integration test)

**Files:**
- Create: `roomos/packages/worker/src/airbnb/sync.ts`
- Test: `roomos/packages/worker/tests/airbnb/sync.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

The test uses captured fixtures (Tasks 7–9) rather than hitting live Airbnb. It mocks the Playwright session by passing pre-parsed listing/booking/transaction rows directly into a `syncAirbnb` exported helper that accepts injected data — the live runner just substitutes Playwright HTML fetches.

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { prisma } from "@roomos/db"
import { syncAirbnbWithRows } from "../../src/airbnb/sync"
import type { AirbnbListingRow, AirbnbBookingRow, AirbnbTransactionRow } from "../../src/airbnb/types"

const ORG_ID = "org-test-2b-sync"

beforeEach(async () => {
  await prisma.org.deleteMany({ where: { id: ORG_ID } })
  await prisma.org.create({ data: { id: ORG_ID, name: "TEST ORG 2B SYNC" } })
})

describe("syncAirbnbWithRows (integration)", () => {
  it("end-to-end: 1 listing matches 1 vault property → upserts listing + booking + transaction", async () => {
    // Pre-seed a property + room as if vault sync had run.
    const p = await prisma.property.create({
      data: { orgId: ORG_ID, address: "7728 Linkside Loop, Kissimmee, FL", padsplitPropertyId: "21664" },
    })
    const room = await prisma.room.create({ data: { orgId: ORG_ID, propertyId: p.id, roomNumber: "R1" } })

    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)

    const listings: AirbnbListingRow[] = [{
      airbnbListingId: "99001", title: "Cozy retreat in Kissimmee", address: "7728 Linkside Loop, Kissimmee, FL",
      listingType: "entire_home", status: "active",
    }]
    const bookings: AirbnbBookingRow[] = [{
      airbnbListingId: "99001", confirmationCode: "HMABCDEF",
      guestName: "Alice", guestUserId: null, checkIn: today, checkOut: future, status: "confirmed",
    }]
    const transactions: AirbnbTransactionRow[] = [{
      confirmationCode: "HMABCDEF", payoutDate: today, grossAmount: 540, netAmount: 487, type: "payout",
    }]

    const result = await syncAirbnbWithRows({ orgId: ORG_ID, listings, bookings, transactions })
    expect(result.errors).toEqual([])
    expect(result.listingsUpserted).toBe(1)
    expect(result.bookingsUpserted).toBe(1)
    expect(result.paymentEventsUpserted).toBe(1)
    expect(result.mappingsAuto).toBe(1)
    expect(result.mappingsAmbiguous).toBe(0)

    const pl = await prisma.platformListing.findUnique({
      where: { platform_externalListingId: { platform: "AIRBNB", externalListingId: "99001" } },
    })
    expect(pl?.roomId).toBe(room.id)
  })

  it("idempotent — second call with same rows produces no new rows", async () => {
    await prisma.property.create({
      data: { orgId: ORG_ID, address: "7728 Linkside Loop", padsplitPropertyId: "21664-2" },
    })
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    const args = {
      orgId: ORG_ID,
      listings: [{ airbnbListingId: "44", title: "x", address: "7728 Linkside Loop", listingType: "entire_home" as const, status: "active" as const }],
      bookings: [{ airbnbListingId: "44", confirmationCode: "ABC", guestName: "g", guestUserId: null, checkIn: today, checkOut: future, status: "confirmed" as const }],
      transactions: [{ confirmationCode: "ABC", payoutDate: today, grossAmount: 1, netAmount: 1, type: "payout" as const }],
    }
    await syncAirbnbWithRows(args)
    const before = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    await syncAirbnbWithRows(args)
    const after = await prisma.occupancy.count({ where: { orgId: ORG_ID } })
    expect(after).toBe(before)
  })

  it("writes a SyncRun row with kind=AIRBNB_SYNC and status=SUCCESS", async () => {
    await syncAirbnbWithRows({ orgId: ORG_ID, listings: [], bookings: [], transactions: [] })
    const run = await prisma.syncRun.findFirst({
      where: { orgId: ORG_ID, kind: "AIRBNB_SYNC" },
      orderBy: { startedAt: "desc" },
    })
    expect(run?.status).toBe("SUCCESS")
  })
})
```

**Note:** `SyncKind` enum needs an `AIRBNB_SYNC` value added in Task 2's schema migration. If Task 2 missed it, add it here before the test will pass.

- [ ] **Step 2: Write the orchestrator**

```typescript
import { prisma } from "@roomos/db"
import { log } from "../log"
import { upsertAirbnbListing } from "./persist/listing"
import { upsertAirbnbOccupancyForBooking } from "./persist/occupancy"
import { upsertAirbnbPayment } from "./persist/payment"
import { matchListingToRoom } from "./matcher"
import { detectAndFlagCrossListings } from "./cross-listing"
import type { AirbnbBookingRow, AirbnbListingRow, AirbnbSyncResult, AirbnbTransactionRow } from "./types"

export type SyncAirbnbRowsInput = {
  orgId: string
  listings: AirbnbListingRow[]
  bookings: AirbnbBookingRow[]
  transactions: AirbnbTransactionRow[]
}

export async function syncAirbnbWithRows(input: SyncAirbnbRowsInput): Promise<AirbnbSyncResult> {
  const result: AirbnbSyncResult = {
    listingsParsed: input.listings.length, bookingsParsed: input.bookings.length, transactionsParsed: input.transactions.length,
    listingsUpserted: 0, bookingsUpserted: 0, paymentEventsUpserted: 0,
    mappingsAuto: 0, mappingsAmbiguous: 0, crossListings: 0, errors: [],
  }
  const run = await prisma.syncRun.create({
    data: { orgId: input.orgId, kind: "AIRBNB_SYNC", platform: "AIRBNB", status: "RUNNING" },
  })

  try {
    // listing → PlatformListing (with mapping attempt)
    const listingIdByAirbnbId = new Map<string, string>()
    for (const l of input.listings) {
      try {
        const match = await matchListingToRoom(input.orgId, l)
        if (match.roomId) result.mappingsAuto++
        else result.mappingsAmbiguous++
        const id = await upsertAirbnbListing(input.orgId, {
          airbnbListingId: l.airbnbListingId,
          roomId: match.roomId,
          isActive: l.status === "active",
        })
        listingIdByAirbnbId.set(l.airbnbListingId, id)
        result.listingsUpserted++
      } catch (err) {
        result.errors.push({ stage: `listing:${l.airbnbListingId}`, reason: String((err as Error).message) })
      }
    }

    // booking → Occupancy (skip if no listing match)
    for (const b of input.bookings) {
      const listingId = listingIdByAirbnbId.get(b.airbnbListingId)
      if (!listingId) continue
      try {
        await upsertAirbnbOccupancyForBooking({ orgId: input.orgId, listingId, booking: b })
        result.bookingsUpserted++
      } catch (err) {
        result.errors.push({ stage: `booking:${b.confirmationCode}`, reason: String((err as Error).message) })
      }
    }

    // transaction → PaymentEvent (find member via occupancy)
    for (const t of input.transactions) {
      try {
        const occupancy = await prisma.occupancy.findFirst({
          where: {
            orgId: input.orgId,
            member: { platform: "AIRBNB", externalMemberId: `airbnb-guest:${t.confirmationCode}` },
          },
          select: { id: true, memberId: true },
        })
        if (!occupancy?.memberId) continue
        await upsertAirbnbPayment({
          orgId: input.orgId,
          memberId: occupancy.memberId,
          occupancyId: occupancy.id,
          transaction: t,
        })
        result.paymentEventsUpserted++
      } catch (err) {
        result.errors.push({ stage: `transaction:${t.confirmationCode}`, reason: String((err as Error).message) })
      }
    }

    // Cross-listing detection (runs across the full org, not just touched rooms)
    const cross = await detectAndFlagCrossListings(input.orgId)
    result.crossListings = cross.flagged

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: result.errors.length > 0 ? "PARTIAL" : "SUCCESS",
        itemsSynced: result.listingsUpserted + result.bookingsUpserted + result.paymentEventsUpserted,
        errorsJson: result.errors.length > 0 ? result.errors : undefined,
      },
    })
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: "FAILED", errorsJson: { fatal: String(err) } },
    })
    throw err
  }
  return result
}
```

- [ ] **Step 3: Run all tests + suite**

```bash
cd roomos && pnpm --filter @roomos/worker test
```

Expect all new airbnb tests pass + Phase 2A's 57 tests + 2 skipped still pass.

- [ ] **Step 4: Commit**

```bash
git add roomos/packages/worker/src/airbnb/sync.ts \
        roomos/packages/worker/tests/airbnb/sync.integration.test.ts
git commit -m "airbnb(2b): syncAirbnbWithRows orchestrator (integration TDD)"
```

---

### Task 16: BullMQ job wrapper + live scraper

**Files:**
- Create: `roomos/packages/worker/src/jobs/airbnb-sync.ts`

- [ ] **Step 1: Write the live job wrapper**

This is the version that actually drives Playwright against airbnb.com. It loads the saved storage state, navigates to each page, captures HTML, runs the parsers, then calls `syncAirbnbWithRows`.

```typescript
import { chromium } from "playwright"
import { getOrg } from "../persist"
import { log } from "../log"
import { airbnbSessionExists, airbnbStorageStatePath, saveAirbnbStorageState } from "../airbnb/session"
import { parseHostingListings } from "../airbnb/parsers/listings"
import { parseHostingCalendar } from "../airbnb/parsers/calendar"
import { parseHostingTransactions } from "../airbnb/parsers/transactions"
import { syncAirbnbWithRows } from "../airbnb/sync"
import type { AirbnbBookingRow, AirbnbListingRow, AirbnbTransactionRow } from "../airbnb/types"

const LISTINGS_URL = "https://www.airbnb.com/hosting/listings"
const CALENDAR_URL = (id: string) => `https://www.airbnb.com/hosting/calendar/${id}`
const TRANSACTIONS_URL = "https://www.airbnb.com/hosting/transactions"

const NAV_OPTS = { waitUntil: "networkidle" as const, timeout: 60_000 }
const JITTER = () => 2000 + Math.random() * 4000

export async function processAirbnbSync() {
  if (!airbnbSessionExists()) {
    log.warn("Airbnb storage state missing — skipping airbnb-sync. Run 'worker airbnb-login' first.")
    return { skipped: true }
  }
  const org = await getOrg()
  const browser = await chromium.launch({ headless: true, channel: "chrome" })
  try {
    const context = await browser.newContext({ storageState: airbnbStorageStatePath() })
    const page = await context.newPage()

    // 1. /hosting/listings
    await page.goto(LISTINGS_URL, NAV_OPTS)
    const listingsHtml = await page.content()
    const listings: AirbnbListingRow[] = parseHostingListings(listingsHtml)

    // 2. /hosting/calendar/<id> for each listing (jittered)
    const bookings: AirbnbBookingRow[] = []
    for (const l of listings) {
      await new Promise((r) => setTimeout(r, JITTER()))
      await page.goto(CALENDAR_URL(l.airbnbListingId), NAV_OPTS)
      const html = await page.content()
      bookings.push(...parseHostingCalendar(html, l.airbnbListingId))
    }

    // 3. /hosting/transactions
    await new Promise((r) => setTimeout(r, JITTER()))
    await page.goto(TRANSACTIONS_URL, NAV_OPTS)
    const txnsHtml = await page.content()
    const transactions: AirbnbTransactionRow[] = parseHostingTransactions(txnsHtml)

    // 4. Drive the orchestrator
    const result = await syncAirbnbWithRows({ orgId: org.id, listings, bookings, transactions })
    log.info({ result }, "airbnb-sync: complete")

    // 5. Persist refreshed storage state (cookies may rotate)
    saveAirbnbStorageState(await context.storageState())

    return result
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/packages/worker/src/jobs/airbnb-sync.ts
git commit -m "airbnb(2b): live Playwright job wrapper"
```

---

### Task 17: Wire airbnb-sync into scheduler + CLI

**Files:**
- Modify: `roomos/packages/worker/src/scheduler.ts`
- Modify: `roomos/packages/worker/src/cli.ts`

- [ ] **Step 1: Read scheduler.ts to find the vault-sync registration pattern**

```bash
cat roomos/packages/worker/src/scheduler.ts
```

- [ ] **Step 2: Register airbnb-sync at 30-min cadence**

In `scheduler.ts`, near the `vault-sync` `queue.add` call:

```typescript
import { processAirbnbSync } from "./jobs/airbnb-sync"

// (inside startScheduler, after vault-sync registration)
await queue.add(
  "airbnb-sync",
  {},
  {
    repeat: { every: 30 * 60 * 1000 },
    jobId: "airbnb-sync-recurring",
    removeOnComplete: 100,
    removeOnFail: 50,
  },
)
```

Update the cleanup block to include `airbnb-sync`:

```typescript
if (r.name.startsWith("padsplit:") || r.name === "vault-sync" || r.name === "airbnb-sync") {
  await queue.removeRepeatableByKey(r.key)
  log.info({ name: r.name, key: r.key }, "removed pre-existing repeatable")
}
```

Update the worker dispatch map:

```typescript
startWorker({
  "vault-sync": processVaultSync,
  "airbnb-sync": processAirbnbSync,
  "padsplit:discovery": processDiscovery,
  // ...rest unchanged
})
```

- [ ] **Step 3: Add CLI commands**

In `cli.ts`, after the `vault-sync` case:

```typescript
import { processAirbnbSync } from "./jobs/airbnb-sync"
import { airbnbInteractiveLogin } from "./airbnb/login"

// ... in switch (command)
case "airbnb-sync": {
  const result = await processAirbnbSync()
  log.info(result, "airbnb-sync complete")
  break
}
case "airbnb-login": {
  await airbnbInteractiveLogin()
  break
}
```

- [ ] **Step 4: Typecheck**

```bash
cd roomos && pnpm --filter @roomos/worker test
```

- [ ] **Step 5: Commit**

```bash
git add roomos/packages/worker/src/scheduler.ts roomos/packages/worker/src/cli.ts
git commit -m "airbnb(2b): scheduler + CLI integration (30-min cadence)"
```

---

### Task 18: Property queries — `getUnmappedAirbnbListings` + `getCrossListedRooms`

**Files:**
- Modify: `roomos/apps/web/src/lib/property-queries.ts`

- [ ] **Step 1: Append helpers**

```typescript
export type UnmappedAirbnbListing = {
  listingId: string
  externalListingId: string
  candidatePropertyId: string | null
  candidatePropertyAddress: string | null
  lastSyncedAt: Date | null
}

export async function getUnmappedAirbnbListings(orgId: string): Promise<UnmappedAirbnbListing[]> {
  const rows = await prisma.platformListing.findMany({
    where: { orgId, platform: "AIRBNB", roomId: null, isActive: true },
    select: { id: true, externalListingId: true, lastSyncedAt: true },
  })
  // For each unmapped row, expose any candidate property derived from the latest
  // PropertyFlag with sourceRef matching `airbnb-unmapped-${externalListingId}` (the
  // matcher writes a flag when it identifies a candidate property but not a room).
  // For Phase 2B v1, just return the row without candidate info — operator can pick
  // any property in the dropdown on the Settings page.
  return rows.map((r) => ({
    listingId: r.id,
    externalListingId: r.externalListingId ?? "",
    candidatePropertyId: null,
    candidatePropertyAddress: null,
    lastSyncedAt: r.lastSyncedAt,
  }))
}

export type CrossListedRoom = {
  roomId: string
  propertyId: string
  propertyAddress: string
  roomNumber: string
  platforms: string[]
}

export async function getCrossListedRooms(orgId: string): Promise<CrossListedRoom[]> {
  const listings = await prisma.platformListing.findMany({
    where: { orgId, isActive: true, roomId: { not: null } },
    select: {
      platform: true, roomId: true,
      room: { select: { roomNumber: true, propertyId: true, property: { select: { address: true } } } },
    },
  })
  const byRoom = new Map<string, CrossListedRoom>()
  for (const l of listings) {
    if (!l.roomId || !l.room?.property) continue
    const key = l.roomId
    const entry = byRoom.get(key) ?? {
      roomId: key,
      propertyId: l.room.propertyId,
      propertyAddress: l.room.property.address,
      roomNumber: l.room.roomNumber ?? "",
      platforms: [],
    }
    if (!entry.platforms.includes(l.platform)) entry.platforms.push(l.platform)
    byRoom.set(key, entry)
  }
  return Array.from(byRoom.values()).filter((r) => r.platforms.length > 1)
}
```

- [ ] **Step 2: Commit**

```bash
git add roomos/apps/web/src/lib/property-queries.ts
git commit -m "web(2b): cross-listed-rooms + unmapped-airbnb-listings queries"
```

---

### Task 19: Settings → Airbnb mapping page

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/settings/airbnb/page.tsx`
- Create: `roomos/apps/web/src/app/(signed-in)/settings/airbnb/actions.ts`
- Modify: `roomos/apps/web/src/components/settings/SettingsTabs.tsx`

- [ ] **Step 1: Add an "Airbnb" tab to SettingsTabs**

Read the existing tabs component, find the array of tabs (likely Owners / Team / Integrations / etc.). Add:

```typescript
{ href: "/settings/airbnb", label: "Airbnb" },
```

- [ ] **Step 2: Server Action for confirming mappings**

```typescript
// roomos/apps/web/src/app/(signed-in)/settings/airbnb/actions.ts
"use server"

import { prisma } from "@roomos/db"
import { requireSignedIn } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function confirmMapping(formData: FormData) {
  const { orgId, role } = await requireSignedIn()
  if (role !== "ADMIN") throw new Error("Admin only")
  const listingId = String(formData.get("listingId") ?? "")
  const roomId = String(formData.get("roomId") ?? "")
  if (!listingId || !roomId) throw new Error("listingId and roomId required")
  await prisma.platformListing.update({
    where: { id: listingId },
    data: { roomId },
  })
  await prisma.auditLog.create({
    data: { orgId, action: "AIRBNB_MAPPING_CONFIRMED", entityType: "PlatformListing", entityId: listingId, metadataJson: { roomId } },
  })
  revalidatePath("/settings/airbnb")
}

export async function dismissListing(formData: FormData) {
  const { orgId, role } = await requireSignedIn()
  if (role !== "ADMIN") throw new Error("Admin only")
  const listingId = String(formData.get("listingId") ?? "")
  if (!listingId) throw new Error("listingId required")
  await prisma.platformListing.update({ where: { id: listingId }, data: { isActive: false } })
  await prisma.auditLog.create({
    data: { orgId, action: "AIRBNB_LISTING_DISMISSED", entityType: "PlatformListing", entityId: listingId },
  })
  revalidatePath("/settings/airbnb")
}
```

- [ ] **Step 3: Write the page**

```tsx
import { requireSignedIn } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { getUnmappedAirbnbListings } from "@/lib/property-queries"
import { confirmMapping, dismissListing } from "./actions"

export default async function AirbnbSettingsPage() {
  const { orgId } = await requireSignedIn()
  const unmapped = await getUnmappedAirbnbListings(orgId)
  // Get all rooms with property labels for the picker.
  const rooms = await prisma.room.findMany({
    where: { orgId },
    include: { property: { select: { address: true } } },
    orderBy: [{ property: { address: "asc" } }, { roomNumber: "asc" }],
  })

  return (
    <div className="max-w-[1100px] mx-auto px-10 pt-10 pb-20">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-ink-3)] font-medium mb-3">
        Settings · Integrations
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-none font-normal tracking-[-0.02em] mb-2">
        Airbnb mapping<span className="italic text-[color:var(--color-coral)]">.</span>
      </h1>
      <p className="text-sm text-[color:var(--color-ink-2)] mb-8">
        Confirm which RoomOS room each unmapped Airbnb listing belongs to. Listings stay unmapped when the matcher couldn't infer a unique room — usually because the property has multiple rooms and the listing title didn't say "Room N".
      </p>

      {unmapped.length === 0 ? (
        <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)] p-8 text-center text-sm text-[color:var(--color-ink-3)]">
          No unmapped Airbnb listings. 🎉
        </div>
      ) : (
        <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-hairline)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--color-hairline)] text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)] font-semibold">
                <th className="text-left px-5 py-4">Airbnb listing</th>
                <th className="text-left px-5 py-4">Last seen</th>
                <th className="text-left px-5 py-4">Assign to room</th>
                <th className="text-right px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unmapped.map((u) => (
                <tr key={u.listingId} className="border-b border-[color:var(--color-hairline-2)] last:border-0">
                  <td className="px-5 py-4 font-[family-name:var(--font-display)] italic text-[color:var(--color-ink-2)]">{u.externalListingId}</td>
                  <td className="px-5 py-4 text-xs text-[color:var(--color-ink-3)]">{u.lastSyncedAt?.toLocaleString() ?? "—"}</td>
                  <td className="px-5 py-4">
                    <form action={confirmMapping} className="flex gap-2 items-center">
                      <input type="hidden" name="listingId" value={u.listingId} />
                      <select name="roomId" required className="border border-[color:var(--color-hairline)] bg-[color:var(--color-paper)] text-sm px-3 py-2 rounded-sm">
                        <option value="">— pick a room —</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.property.address.split(",")[0]} · {r.roomNumber}
                          </option>
                        ))}
                      </select>
                      <button className="bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-sm font-medium px-4 py-2 rounded-sm">Confirm</button>
                    </form>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <form action={dismissListing}>
                      <input type="hidden" name="listingId" value={u.listingId} />
                      <button className="text-xs text-[color:var(--color-clay)] hover:underline">Dismiss</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd roomos && pnpm --filter @roomos/web exec tsc --noEmit
git add roomos/apps/web/src/app/\(signed-in\)/settings/airbnb roomos/apps/web/src/components/settings/SettingsTabs.tsx
git commit -m "web(2b): Settings → Airbnb mapping page"
```

---

### Task 20: CrossListingBadge component + Properties list integration

**Files:**
- Create: `roomos/apps/web/src/components/properties/CrossListingBadge.tsx`
- Modify: `roomos/apps/web/src/lib/property-queries.ts` (extend `PropertyRow` with `crossListedRoomCount`)
- Modify: `roomos/apps/web/src/components/properties/PropertiesTable.tsx`

- [ ] **Step 1: Write the badge**

```tsx
export function CrossListingBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      title={`${count} room(s) listed on both PadSplit and Airbnb`}
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
      style={{ background: "var(--color-clay-bg)", color: "var(--color-clay)" }}
    >
      ⚠ {count} cross-listed
    </span>
  )
}
```

- [ ] **Step 2: Extend `getPropertiesForList` to count cross-listed rooms per property**

In `property-queries.ts`, modify the existing `getPropertiesForList` to attach a `crossListedRoomCount` derived from a single extra query before the map:

```typescript
// At the top of getPropertiesForList, after fetching `properties`:
const crossListed = await getCrossListedRooms(orgId)
const crossCountByProperty = new Map<string, number>()
for (const r of crossListed) {
  crossCountByProperty.set(r.propertyId, (crossCountByProperty.get(r.propertyId) ?? 0) + 1)
}
// In the .map(), include:
//   crossListedRoomCount: crossCountByProperty.get(p.id) ?? 0,
```

Also extend `PropertyRow`:

```typescript
export type PropertyRow = {
  // ...existing fields
  crossListedRoomCount: number
}
```

- [ ] **Step 3: Render the badge in PropertiesTable**

In `PropertiesTable.tsx`, add the badge inside the Address cell, right after the address-name `<Link>`:

```tsx
<div className="addr-cell">
  <Link href={`/properties/${r.id}`}>{r.address.split(",")[0]}</Link>
  <CrossListingBadge count={r.crossListedRoomCount} />
  <div className="addr-sub">...</div>
</div>
```

(Adjust the layout to keep address on one line and the badge inline.)

- [ ] **Step 4: Typecheck + commit**

```bash
cd roomos && pnpm --filter @roomos/web exec tsc --noEmit
git add roomos/apps/web/src/components/properties/CrossListingBadge.tsx \
        roomos/apps/web/src/components/properties/PropertiesTable.tsx \
        roomos/apps/web/src/lib/property-queries.ts
git commit -m "web(2b): cross-listing badge on properties list"
```

---

### Task 21: E2E smoke + finalize DEPLOYMENT-2B.md

**Files:**
- Modify: `docs/superpowers/DEPLOYMENT-2B.md`

- [ ] **Step 1: Run airbnb-sync end-to-end against the prod stack from the Mac Studio**

```bash
cd "/Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/<worktree>/roomos"
# DATABASE_URL pointed at prod (e.g. via railway run --service Postgres -- bash -c '...')
DATABASE_URL=postgresql://... pnpm --filter @roomos/worker exec tsx src/cli.ts airbnb-login
DATABASE_URL=postgresql://... pnpm --filter @roomos/worker exec tsx src/cli.ts airbnb-sync
```

Confirm:
- `sync_runs` has a recent `AIRBNB_SYNC` row with `status = SUCCESS` or `PARTIAL`.
- `platform_listings` has new rows with `platform = AIRBNB`.
- The Properties page shows the cross-listing badge on at least one expected property.
- The Settings → Airbnb page shows any unmapped listings (or is empty, if the matcher matched everything).

- [ ] **Step 2: Finalize DEPLOYMENT-2B.md §4 with the verification queries**

Append to DEPLOYMENT-2B.md:

```markdown
## 4. Smoke test

After the first scheduled `airbnb-sync` run (~30 min after `launchctl kickstart`):

1. Open `/settings/airbnb` on prod. Expect the unmapped-listings table (or empty state) to render. Confirm any ambiguous mappings by picking a room.
2. Open `/properties` on prod. Expect a red `⚠ N cross-listed` badge on each property with a room on both PadSplit and Airbnb.
3. In Postgres:
   \`\`\`sql
   SELECT count(*) FROM platform_listings WHERE platform = 'AIRBNB' AND room_id IS NOT NULL;
   SELECT count(*) FROM platform_listings WHERE platform = 'AIRBNB' AND room_id IS NULL;
   SELECT count(*) FROM sync_runs WHERE kind = 'AIRBNB_SYNC' AND status = 'SUCCESS' AND started_at > NOW() - INTERVAL '1 hour';
   SELECT count(*) FROM property_flags WHERE source = 'MANUAL' AND source_ref LIKE 'cross-listing-%' AND closed_at IS NULL;
   \`\`\`
   Expect: a mix of mapped + unmapped listings; at least one `SUCCESS` run in the last hour; cross-listing flag count = number of cross-listed rooms.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-2B.md
git commit -m "docs(2b): finalize Phase 2B deployment doc with smoke test"
```

---

## Self-review notes (post-write)

- **Spec coverage**: §4.2 Airbnb adapter → Tasks 5–17. §5 schema deltas (`AIRBNB_SYNC` in SyncKind, nullable roomId, new unique key) → Task 2. §6 dashboard UI (cross-listing radar) → Task 20. §8 step 5 (light up Airbnb adapter + Settings UI + cross-listing radar) → Tasks 19 + 20. §9.1 listing-to-room mapping open question → Task 10 matcher heuristic + Task 19 Settings UI for the operator confirmation step. ✓
- **Placeholder scan**: no TBDs. Some parser tasks (7, 8, 9) instruct the implementer to *adjust selectors against the actual fixture HTML* — this is intentional because Airbnb's markup is captured live and varies by deploy. The tests encode the contract; the parser implementation has freedom to use whatever stable hook the fixture exposes. Not a placeholder.
- **Type consistency**: `airbnbListingId` (string) consistent everywhere. `confirmationCode` consistent. `externalMemberId` synthetic format `airbnb-guest:${confirmationCode}` defined in Task 12 and referenced in Task 15. `PlatformListing.externalListingId` and the new `(platform, externalListingId)` unique key referenced in Tasks 2/11/15. ✓
- **Idempotency**: tested explicitly in Tasks 11/12/13/14/15. ✓
- **Real-data verification**: smoke test in Task 21 spot-checks against your real prod stack with real Airbnb data.

---

**Next:** plans for Phase 2C (REI Hub long-term lease adapter) and Phase 2D (owner statements + GHL push) get their own files after 2B ships.
