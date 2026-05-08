# RoomOS — Vault-Fed Pivot Design

**Status:** Draft (2026-05-08)
**Operator:** Jordan Ruvalcaba / CoHost Management
**Pivots from:** [`2026-05-02-roomos-phase-1-design.md`](./2026-05-02-roomos-phase-1-design.md) — replaces the input layer only
**Preserves:** web stack, Postgres schema (with adapter additions), Clerk auth + RBAC, Phase 1 dashboard UX (now refined per the mockups committed alongside this spec)

---

## 1. Why this pivot

RoomOS Phase 1 shipped a Next.js + Postgres + Clerk + Mac Studio architecture. The web stack, schema, and auth all work. The single broken layer is **the input** — a Playwright-based PadSplit scraper running on the Mac Studio. Recent commits show a steady stream of bugs in that layer (regex parsing, occupancy upserts, status-text matching, session expiry), which has left the dashboard untrustworthy.

Meanwhile, two other systems have been quietly producing reliable, current operational data without anyone designing them as data sources:

- **Codex `padsplit-message-responder`** runs the PadSplit + Airbnb inboxes and writes everything it learns back to the **CoHost Knowledge Hub vault** (`~/Documents/CoHost-Knowledge-Hub/`). 59 property files + 361 member dossiers, with structured frontmatter and tables, are kept current as a side effect of inbox handling. Snapshot folders prove the vault is being maintained at least daily.
- **`daily-income-dashboard` skill** scrapes PadSplit + Hospitable + REI Hub and produces a daily HTML income report.

So the strategic move is not to fix the broken duplicate scraper — it's to **retire it and feed RoomOS from the systems already producing the truth**. Three input adapters replace one scraper:

- **Vault adapter** → PadSplit occupancy, members, flags, interaction logs (from the vault)
- **Hospitable adapter** → Airbnb bookings, financials, calendar
- **REI Hub adapter** → long-term lease (TurboTenant-style) financials and per-property revenue

The Postgres schema, dashboard, and owner-portal-ready RBAC stay intact.

---

## 2. Goals & non-goals

**Goals**

- One dashboard shows current occupancy + financial state for every room across PadSplit, Airbnb, and long-term-lease platforms.
- Per-room platform mix supported. The Phase 1 schema's `platform_listings (room_id, platform)` table already models this.
- Mixed freshness: occupancy ≤ 15 min, financials ≤ 2 h, owner statements monthly.
- Cross-listing radar: when a room appears on PadSplit and Airbnb simultaneously, surface it inline as a double-booking risk.
- Owner statement generation, monthly. PDF + XLSX → Drive; summary numbers → GHL custom fields per owner-contact.
- Unified rent roll XLSX export, on demand.
- Mac Studio PadSplit scraper retired.

**Non-goals (out of scope here)**

- Inbound message replies. Owned by Codex `padsplit-message-responder`.
- eKey provisioning + lock management. Owned by `padsplit-access-manager`.
- Income dashboard regeneration. The `daily-income-dashboard` skill stays as-is; RoomOS reads its outputs rather than duplicating its scraping.
- A vault writer (RoomOS-side edits flowing back to vault `.md` files). Read-only this phase; conflict resolution rule: vault wins.
- Multi-org / SaaS productization. Schema is multi-tenant-ready (single seeded org); productizing remains a future project.

---

## 3. Architecture

```
[ Mac Studio · home/office ]
  ├── Codex padsplit-message-responder   ──writes──▶  CoHost Knowledge Hub vault (local .md files)
  ├── daily-income-dashboard              ──writes──▶  CoSpace_Income_Dashboard.html (daily)
  └── RoomOS Worker (Node 20, launchd)
        ├── Vault adapter         (every 15 min)   ──TLS──▶ Railway Postgres
        ├── Hospitable adapter    (every 30 min)   ──TLS──▶ Railway Postgres
        ├── REI Hub adapter       (every 2 h)      ──TLS──▶ Railway Postgres
        └── Heartbeat             (every 60 s)     ──HTTPS─▶ Railway /api/heartbeat

[ Railway · cloud ]
  ├── Next.js 14 (App Router) — UI, Server Actions
  ├── Postgres — source of truth for the dashboard
  ├── Redis — BullMQ job queue
  └── Cron jobs:
        ├── monthly_statement_generator   (1st of month, 6am ET)
        └── ghl_owner_sync                 (daily, 7am ET)

[ External services ]
  CoHost vault (local FS)  ·  Hospitable  ·  REI Hub  ·  GHL  ·  Google Drive
```

**Why this shape**

- Mac Studio still runs the worker because the vault is local and Hospitable / REI Hub adapters benefit from the same residential IP + interactive Chrome that the message-responder already uses for non-API scraping.
- Worker is outbound-only (Redis, Postgres, heartbeat). No inbound, no port-forwarding.
- Web stays up independent of the Mac. If the worker silences, the dashboard surfaces a "Sync stale" pill on the existing top bar (already implemented Phase 1).
- Redis remains the buffer for transient outages.

---

## 4. Adapters

### 4.1 Vault adapter

**Reads** (filesystem, no network):

- `*.md` at vault root — one per property. Frontmatter (`padsplit-property-id`, `address`, `market`, `state`, `rooms`, `platform`, `flags`, `last-updated`) plus structured `## Current Members` table.
- `members/*.md` — per-member dossiers. Frontmatter has `member-id`, `weekly-rate`, `move-in-date`, `phone-cached`, `email-cached`, `status`, `balance`.
- `_RISK-LEDGER.md`, `_REVENUE.md`, `_INDEX.md` — written by the message-responder; provide cross-property roll-ups and risk signals.
- Property file's `## Open Maintenance Items` table → maintenance flags.
- Property file's `## Flags & Alerts` blockquote → live operational flags shown in the dashboard right rail.
- Property file's `## Interaction Log` → activity timeline entries (most recent N).

**Writes** (Postgres, idempotent):

- Upserts `properties` keyed by `padsplit-property-id` from frontmatter.
- Upserts `rooms` — one row per `R[N]` line in the Current Members table. `room_number` parsed from the row prefix.
- Upserts `members` keyed first by `member-id` from the dossier file, falling back to a generated key from `(property_id, member_name)` with a conflict warning if the same name appears on multiple properties.
- Upserts the active `occupancies` row per `(listing_id)`. Status mapping:
  - `Active` → `OCCUPIED`
  - `VACATED` / `Vacant` → previous occupancy closed (set `lease_end_date`), new `VACANT` row inserted.
  - `TERMINATED` → previous occupancy closed; `INACTIVE` row inserted with `current_balance` set from member dossier.
  - `Booking applicant` (parsed from Flags) → `WAITING_APPROVAL` placeholder occupancy with `member_id = null`.
- Inserts a `property_flags` row for every entry in `## Flags & Alerts`. Severity inferred from emoji prefix (🔴/⚠️ → DANGER, ⚠️ → WARN, 📋 → INFO, ✅ → OK).
- Writes a `sync_runs` row with `kind = VAULT_SYNC` per cycle.

**Cadence:** every 15 minutes, launchd-driven. Skipped if the previous run is still in flight.

**Conflict resolution:** vault is authoritative. If a RoomOS UI edit ever conflicts with the vault, the vault overwrites RoomOS state on the next sync. UI-side edits are disabled for vault-sourced fields in this phase; the UI is a read renderer.

### 4.2 Hospitable adapter

**Reads** (preferred: Hospitable API; fallback: scraping the dashboard the way `daily-income-dashboard` already does):

- Per-property booking calendar (room/unit-keyed if Hospitable separates rooms; otherwise property-level for whole-house Airbnb).
- Net revenue, average nightly rate, occupancy %, reservations, cancellations, length of stay.

**Writes:**

- Upserts an `AIRBNB` row in `platform_listings` for each Hospitable-tracked unit.
- Upserts `occupancies` for active bookings: `OCCUPIED` for the current stay; `MOVING_IN` / `MOVING_OUT` for the 24 h windows around check-in/out.
- Inserts `payment_events` from Hospitable's net-revenue line items, keyed by Hospitable transaction ID for idempotency.

**Cadence:** every 30 minutes.

**Open question:** Jordan's Hospitable API access is unconfirmed. If unavailable, this adapter reuses the same JS-extraction pattern that `daily-income-dashboard` already uses, just running more frequently and writing to Postgres instead of an HTML file.

### 4.3 REI Hub adapter

**Reads** REI Hub dashboard (same approach as `daily-income-dashboard`'s REI Hub block):

- `/dashboard` → revenue last-12-months, portfolio value, property count.
- `/transactions/booked` → all transaction rows (date, type, property, description, amount), paginated.

**Writes:**

- Inserts `payment_events` keyed by the REI Hub transaction ID (currently encoded in the row; we'll need to introspect — see open questions).
- Updates `properties.market_value` if portfolio reports it.
- Long-term-lease properties (TurboTenant-style) get a `LONG_TERM_LEASE` row in `platform_listings` so they appear in the same rent roll.

**Cadence:** every 2 hours.

---

## 5. Data model deltas

The Phase 1 schema mostly stays. Additions:

- `platform_listings.platform` enum gains `LONG_TERM_LEASE` (REI Hub).
- New table **`property_flags`**: `id, org_id, property_id, room_id (nullable), severity (DANGER|WARN|INFO|OK), title, body, source (VAULT_SYNC|HOSPITABLE|REI_HUB|MANUAL), opened_at, closed_at, source_ref`.
- `sync_runs.kind` enum gains `VAULT_SYNC`, `HOSPITABLE_SYNC`, `REI_HUB_SYNC` (replaces `DISCOVERY` / `OCCUPANCY` / `FINANCIAL`).
- `members` gets `member_dossier_path` — the vault file path, for cross-linking from the UI.
- `properties` gets `vault_file_path` — same purpose.
- New `WAITING_APPROVAL` value already exists in the Phase 1 `occupancies.status` enum; we use it for booking applicants surfaced from vault flags.

The existing partial unique index on `occupancies` (one active row per listing) is preserved.

---

## 6. Dashboard UI

Locked in via mockups committed to `.superpowers/brainstorm/62120-1778263597/content/`:

- `properties-list-v2.html` — Properties list view (clones PadSplit's column structure; adds restrained owner sub-text and a global sync pill).
- `property-detail.html` — Property detail view (KPI strip + bedroom grid + right rail with property/owner/flags/sync).

**Design language:**

- Cream paper (`#F4EDE2`), Source Serif 4 for display, Switzer for body.
- Restrained coral accent (`#B14D2C`) used sparingly: active tab underline, primary toggle, italic period after page titles.
- Forest green / muted clay / warm amber status palette — newspaper colors, not signal-light colors.
- Hairline borders, no shadows, generous row padding.
- 40 ms staggered fade-and-rise on row entry.

**UI components inventory:**

- Top bar: brand mark + global nav + sync pulse pill + user avatar (sticky).
- KPI strip: Occupancy / MTD Earnings / Past Due / Days on Market.
- Per-room card: status pill, member info, weekly/balance/last-paid trio, optional flag annotation block.
- Right rail: Property details card (with PadSplit ID copy link), Owner card with GHL sync status, Live Flags list, Sync history.

**What we do NOT build in this phase:**

- Editing UI for vault-sourced fields (read-only).
- A custom donut renderer beyond the table-cell donut shown in mockups.
- Per-room photos. Typography does the work; we can revisit if the team strongly wants thumbnails later.

---

## 7. Owner statements & GHL push

**Monthly cycle, on the 1st of each month, 6 am ET:**

1. `monthly_statement_generator` cron iterates over each `owners` row, scoped to the seeded org.
2. For each owner: pull last month's `payment_events` joined to `properties` with `owner_id = $owner_id`, deduct CoHost management fee, generate a styled XLSX + PDF statement.
3. Drop both files in Google Drive under the owner's folder (path resolved via owner record).
4. Push summary numbers into GHL custom fields on the owner's contact record (mapping below).
5. Send the owner an email via GHL with the Drive link.

**GHL custom field mapping per owner-contact:**

| Field | Source |
| --- | --- |
| `roomos_last_statement_date` | statement run date |
| `roomos_last_month_gross` | sum of `payment_events.amount` for owner's properties, last month |
| `roomos_last_month_net` | gross minus management fee + reimbursable expenses |
| `roomos_active_properties` | count of `properties` for owner with `status = ACTIVE` |
| `roomos_avg_occupancy_pct` | weighted average across owner's rooms over the last 30 days |
| `roomos_balance_due_to_co` | unpaid management fees on prior statements |

**Daily delta push, 7 am ET:**

A lighter `ghl_owner_sync` cron updates `roomos_avg_occupancy_pct` and `roomos_active_properties` daily so the owner-side CRM reflects current state without waiting for the 1st.

---

## 8. Migration plan

Sequenced so each step is independently shippable.

1. **Decommission the Mac Studio PadSplit scraper.** Disable the launchd agent. Keep the screenshots/error directories for archival.
2. **Build the vault adapter** as a new worker job. Run it on the Mac Studio (vault is local; output goes to Railway Postgres over TLS). Same launchd pattern as the existing scraper but a different input.
3. **Refresh the Phase 1 dashboard styling** to match the locked design language (mockups in `.superpowers/brainstorm/`). This is a CSS-and-typography pass over the existing components — no backend changes.
4. **Add `property_flags` table + migration**, surface the right-rail flags list in the property detail view.
5. **Light up Hospitable adapter** (Airbnb-only properties first; whole-house). Surface the cross-listing radar on the Properties list when a `room_id` has both `PADSPLIT` and `AIRBNB` rows in `platform_listings` with `is_active = true`.
6. **Light up REI Hub adapter.** Long-term-lease properties join the rent roll.
7. **Owner statement generator** as a monthly cron. PDF + XLSX + Drive drop.
8. **GHL push** as the daily + monthly cron.

---

## 9. Open questions

1. **Hospitable API access.** Does Jordan have it? If yes, that's the path. If no, reuse the JS-extraction pattern from `daily-income-dashboard` and accept the lower fidelity (no per-room mapping for Airbnb).
2. **REI Hub transaction IDs.** REI Hub doesn't expose a stable per-row ID in the visible DOM. We'll need to either inspect a row's React props (the same trick used by the message-responder for emails) or generate a dedup hash from `(date, property, type, amount, description)` — fragile if any field is normalized differently between scrapes. Ship hash-based dedup first, monitor for duplicates, switch to React-extracted IDs if needed.
3. **Vault member-name collisions.** Same name on two properties (very rare but possible) breaks the fallback key. Mitigation: vault adapter logs a `WARN` flag for duplicates, defers writing the conflicting occupancies until Jordan resolves manually.
4. **Read-only-or-not for vault-sourced UI.** This phase locks vault fields as read-only in RoomOS. If team feedback is "we want to edit a member's name in the dashboard," Phase 3 adds a vault writer (markdown round-trip is non-trivial).
5. **Cross-listing rule.** Right now we'd flag a room on both PadSplit and Airbnb as a double-booking risk. But hybrid co-living is intentional in some properties (PadSplit member in R1, Airbnb in master suite, shared kitchen). The rule should be: warn only when the **same room** is on two platforms simultaneously, not when the same property has two platforms across different rooms. The data model supports this distinction; the UI surface needs the right copy.

---

## 10. Success criteria

This pivot ships when:

- Mac Studio PadSplit scraper is retired; no Sentry errors are coming from it.
- Properties list page renders all 59 active properties with current occupancy donuts and an owner column. Sync pill shows < 15 min stale during business hours.
- Property detail page renders correct member assignments, balances, and live flags for at least three spot-checked properties (1311 Morgana, 8041 Osceola, 218 San Marco).
- Hospitable adapter pulls at least one Airbnb-only property into the same dashboard (e.g., 7728 Linkside Loop).
- REI Hub adapter pulls at least one long-term-lease property into the same dashboard.
- An owner statement generates without error for one CoHost-managed owner; the PDF + XLSX land in Drive and the GHL custom fields update on that owner's contact.
- Cross-listing radar fires (correctly, per the rule above) on at least one test case.

---

## 11. References

- `2026-05-02-roomos-phase-1-design.md` — original RoomOS spec; preserved schema and dashboard architecture.
- `~/.codex/skills/padsplit-message-responder/SKILL.md` — primary writer to the vault.
- `~/Documents/Claude/Scheduled/daily-income-dashboard/SKILL.md` — pattern reference for Hospitable + REI Hub scraping.
- `~/Documents/CoHost-Knowledge-Hub/` — vault root; primary input.
- `.superpowers/brainstorm/62120-1778263597/content/properties-list-v2.html` — Properties list mockup, locked.
- `.superpowers/brainstorm/62120-1778263597/content/property-detail.html` — Property detail mockup, locked.
