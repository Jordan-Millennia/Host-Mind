# RoomOS — Phase 1 Design

**Status:** Approved (2026-05-02)
**Operator:** Jordan Ruvalcaba / CoHost Management
**Replaces:** `Channel-Manager/` (will be archived; selectors and session-cookie pattern referenced)

---

## 1. Overview

RoomOS is a coliving room command center for CoHost Management — one operator, ~70 single-family homes, ~300 bedrooms, 250+ active PadSplit members at any time, growing fast. Today the operator and a 5-person team switch between PadSplit, Airbnb, and TurboTenant dashboards to track occupancy, payments, messaging, and follow-ups. RoomOS consolidates that into a single internal app.

Phase 1 lights up the **PadSplit lane only**: discovery + occupancy sync + member financial sync + a status-grouped dashboard + Clerk-backed team auth. Airbnb and TurboTenant are deferred to Phase 2 and Phase 3, each as its own brainstorm → spec → plan cycle.

## 2. Goals & non-goals

**Goals (Phase 1)**
- Single dashboard that shows current occupancy and financial state for every PadSplit-listed room across all properties.
- Two-tier scrape that keeps the data fresh without hammering PadSplit (occupancy ≤30 min stale, member financials ≤2h stale).
- Six internal team members can sign in with role-gated access (admin / agent).
- Day-1 bootstrap from a fresh PadSplit account with zero hand-entered properties.
- Operator can see scraper health at a glance and tell when something needs hands-on attention.

**Non-goals (deferred)**
- Airbnb integration. Phase 2.
- TurboTenant integration. Phase 3.
- Unified inbox / replying to messages. Phase 2+.
- Automation engine (rule builder, templates). Phase 4+.
- Owner portal (read-only, owner-scoped). Schema is ready; UI is Phase 2+.
- Selling RoomOS to other operators. Schema is multi-tenant-ready (single seeded org); productizing is its own future project.

## 3. Architecture

Three deploy zones, one external surface:

```
Users (browser)
   │  HTTPS · Clerk session
   ▼
[ Railway · always-on cloud ]
  - Next.js 14 (App Router) — UI, Server Actions
  - Postgres — source of truth
  - Redis — BullMQ job queue (scrape jobs + interactive-login jobs)
   │
   │  Worker pulls jobs from Redis over TLS
   │  Writes results to Postgres over TLS
   ▼
[ Mac Studio · home/office ]
  - RoomOS Worker (Node 20, launchd agent)
  - Local cookie jar (~/Library/Application Support/RoomOS/.auth/)
  - Sync heartbeat → web /api/heartbeat every 60s
   │
   │  Headful Chromium · residential IP
   ▼
[ External · padsplit.com/host ]

[ Clerk · auth provider ]  — webhooks → /api/clerk-webhook → team_users upsert
```

**Key properties**
- The Mac Studio is the **only** thing that talks to PadSplit. Real residential IP, real Chrome, real desktop fingerprint — invisible to bot detection.
- **No inbound** to the Mac. Worker only makes outbound TLS connections (Redis, Postgres, heartbeat). No port-forwarding, no VPN.
- **Redis is the buffer.** If the Mac is offline (reboot, internet hiccup), jobs queue up and run when it's back. Zero data loss.
- **Web stays up** independent of the Mac. Even if the scraper is down, the dashboard still works on the last-known data and surfaces a "scraper offline" banner.

### Stack

| Layer | Choice | Rationale |
|---|---|---|
| Web framework | Next.js 14 (App Router) | Server components fit the dashboard's mostly-read workload; Server Actions for mutations. |
| Language | TypeScript end-to-end | One package of types shared between web and worker. |
| ORM | Prisma | Existing Channel-Manager uses Prisma; type-safe; good migration story. |
| DB | Postgres on Railway | Daily snapshot backups, point-in-time recovery available. |
| Job queue | BullMQ + Redis on Railway | Real workload at this scale; handles retries, backoff, scheduling. |
| Auth | Clerk | Magic links + MFA + organizations + RBAC out of the box; future owner-portal user type maps cleanly. |
| Browser automation | Playwright (chromium, headful on Mac) | Channel-Manager already uses it; no `puppeteer-extra-stealth` (residential IP + real machine make stealth tooling unnecessary and risky). |
| UI | Tailwind + shadcn/ui | Operator-app aesthetic; fast to build. |
| Logging | Pino | Structured JSON logs; identical on web and worker. |
| Errors | Sentry | Cheap tier; both web and worker. |
| CI/CD | GitHub Actions | Typecheck + lint + `prisma migrate diff` on PR; merge deploys web. |

## 4. Data model

Eleven tables. Every domain table carries `org_id` from day one (single seeded "CoHost Management" org; multi-tenant later is cheap).

### Core entities

- **`orgs`** — `id`, `name`, `created_at`. One seeded row.
- **`owners`** — your billing clients. `id`, `org_id`, `name`, `email`, `phone`, `billing_terms`, `statement_email`, `notes`, `created_at`, `updated_at`.
- **`properties`** — the 70 single-family homes. `id`, `org_id`, `owner_id`, `name`, `address`, `city`, `state`, `zip`, `market`, `created_at`, `updated_at`.
- **`rooms`** — the 300 bedrooms. `id`, `org_id`, `property_id`, `name`, `room_number`, `max_occupancy`, `created_at`, `updated_at`.
- **`platform_listings`** — the join. One row per `(room_id, platform)`. `id`, `org_id`, `room_id`, `platform` (enum: PADSPLIT, AIRBNB, TURBOTENANT, …), `external_listing_id`, `external_property_id`, `is_active`, `last_synced_at`, `session_status` (enum: ACTIVE, EXPIRED, FAILED).
  - Unique `(room_id, platform)` — a room can be on multiple platforms but only once per platform.

### Occupancy & financial state

- **`members`** — PadSplit members (people who live in rooms). Distinct from `team_users`. `id`, `org_id`, `platform`, `external_member_id`, `name`, `email`, `phone`, `photo_url`, `profile_url`, `first_seen_at`. Unique `(platform, external_member_id)`.
- **`occupancies`** — who is/was living where. `id`, `org_id`, `listing_id`, `room_id`, `member_id`, `status` (enum: OCCUPIED, MOVING_IN, MOVING_OUT, VACANT, NEEDS_FLIP, WAITING_APPROVAL, INACTIVE), `move_in_date`, `lease_end_date`, **denormalized financial state**: `current_balance`, `days_past_due`, `last_payment_at`, `last_payment_amount`, `last_financial_sync_at`. Audit columns: `scraped_at`, `created_at`, `updated_at`.
  - Unique partial index: at most one row per `listing_id` where `status IN (OCCUPIED, MOVING_IN, MOVING_OUT)`. Historical rows preserved.
- **`payment_events`** — append-only ledger. `id`, `org_id`, `member_id`, `occupancy_id`, `amount`, `event_type` (PAYMENT, ADJUSTMENT), `event_date`, `source` (PADSPLIT_SCRAPE), `external_event_id` (for dedup), `raw_json`, `detected_at`. Unique `(member_id, external_event_id)` for idempotent inserts.

### Auth, ops, audit

- **`team_users`** — RoomOS users. `id`, `org_id`, `clerk_user_id`, `email`, `role` (admin / agent / owner — owner unused Phase 1), `owner_id` (nullable, used for the future owner portal), `created_at`, `updated_at`.
- **`sync_runs`** — every scrape attempt. `id`, `org_id`, `kind` (DISCOVERY / OCCUPANCY / FINANCIAL), `platform`, `started_at`, `completed_at`, `status` (RUNNING / SUCCESS / PARTIAL / FAILED), `items_synced`, `errors_json`, `screenshots_json`. Drives the "Scraper offline" banner and the per-room "last synced" tooltips.
- **`audit_log`** — append-only mutation record. `id`, `org_id`, `actor_user_id` (nullable for system actions), `action`, `entity_type`, `entity_id`, `metadata_json`, `created_at`.

### Key invariants

- All domain queries scoped by `org_id` (enforced by middleware + a `withOrg()` Prisma extension).
- One active occupancy per listing. Historical occupancies are immutable.
- Payment events never updated, only inserted. `external_event_id` makes inserts idempotent.
- `members` is platform-scoped — a person who's a PadSplit member and (later) an Airbnb guest is two distinct rows linked at the application layer; we do not auto-deduplicate humans across platforms.

## 5. PadSplit scraper

Three jobs, three cadences. All run on the Mac Studio worker, all serial (one Playwright context, ever), all jittered.

| Job | Cadence | Page loads / cycle | Purpose |
|---|---|---|---|
| `padsplit:discovery` | Once at setup, then weekly | Paginated `/host/rooms` (~6 pages) | Reconcile: create new Property/Room/PlatformListing rows; flag deactivated rooms |
| `padsplit:occupancy` | Every 30 min | ~70 property pages (`/host/listing/<id>`) | Status, member name, move-in, lease-end per room card |
| `padsplit:financials` | Every 2 h | ~250 member pages (one per occupied listing) | Balance, days past due, last payment |

**Scraping policy**
- Concurrency: 1 Playwright context. Never parallel. (At our scale, parallelism reads as bot-like.)
- Jitter: 3–8s random delay between page loads. Each job paces itself across its full window — `padsplit:occupancy` walks 70 pages spread over the 30-min window, not in a 5-min burst.
- User agent: real Chrome's UA. No `puppeteer-extra-stealth` (we don't need it on a residential IP with a real desktop, and importing it signals "I'm trying to evade detection").
- Cookies: persistent browser context backed by `~/Library/Application Support/RoomOS/.auth/padsplit.json`, encrypted at rest using a key from macOS Keychain.

**Resilience**
- Idempotent: re-running a job produces no duplicate rows (upserts keyed by external IDs; payment events keyed by `external_event_id`).
- Session check at job start: `padsplitLogin()` navigates to `/host/dashboard` and looks for the `host-app-bar` testid. If absent → mark `platform_listings.session_status = EXPIRED` and emit a `session_refresh_required` event (Slack + dashboard banner).
- Selector failure → fullpage screenshot to `~/Library/Application Support/RoomOS/screenshots/`, error JSON written to `sync_runs.errors_json`, screenshot path uploaded to web for in-app viewing.
- BullMQ retries: 3 attempts, exponential backoff 30s / 2m / 10m. After all retries → `sync_runs.status = FAILED`, alert fires.

**Observability**
- One `sync_runs` row per job execution.
- Dashboard "Sync status" pill in the top bar:
  - Green: most recent SUCCESS for any job < 60 min ago.
  - Amber: most recent SUCCESS 1–4 h ago.
  - Red: most recent SUCCESS > 4 h ago, or last attempt FAILED, or worker heartbeat silent > 5 min.
- Per-room: "Last synced X min ago" tooltip on every card; shown explicitly in the room detail right rail.

**Reused from Channel-Manager**
- URL map (`/host/dashboard`, `/host/rooms`, `/host/listing/<id>`).
- Verified `data-testid` selectors: `host-app-bar`, `rooms-table__property-link`, `room-card`, status text regex `(Occupied|Vacant|Moving in|Moving out|Needs flip|Waiting for approval|Inactive)`.
- Persistent storage-state pattern from `adapters/base/src/playwright-session.js`.
- Headful interactive login policy (no programmatic credential submission).

**New in RoomOS**
- Member-profile drill-down for financials (Channel-Manager only scrapes the property detail page).
- Heartbeat endpoint (Channel-Manager has no health signal).
- Worker-to-Redis/Postgres egress (Channel-Manager runs locally with SQLite).

## 6. Dashboard

Hybrid layout: status-grouped home + all-rooms tab.

### Home view ("Rooms")

KPI strip across the top:
- Total Rooms
- Past Due (count + total $)
- Vacant (count + vacancy %)
- Moving This Week (count, split out / in)

Below the KPIs, status-grouped sections, each showing a card grid (4-wide), with a "View all" link if the section has more than 8 rooms:
1. **Past Due** (red stripe) — member name, days past due, balance.
2. **Vacant** (red stripe, lighter) — property/room, days vacant, last move-out date.
3. **Moving This Week** (blue stripe) — direction (← out / → in), member name, date.
4. **Needs Flip** (purple stripe) — recently vacated, awaiting cleaning/prep.
5. **Occupied** (green stripe) — collapsed by default with "+247 occupied rooms" affordance.

### All Rooms tab

Filterable, sortable, exportable table:
- Search box (room, address, member name)
- Status filter chips (All / Past Due / Vacant / Moving / Occupied)
- Owner filter dropdown
- Property filter dropdown
- Columns: Property · Room | Owner | Member | Status | Move-in | Lease end | Balance
- Pagination: 50 per page; ~6 pages for 300 rooms.
- "Export CSV" button (everything matching current filters).

### Room detail view

Reached by clicking any card or row.
- Header: property + room, owner, market, platform IDs, "Open in PadSplit ↗" deep-link, "Refresh now" button (queues an immediate `padsplit:financials` job for that listing).
- Current occupancy card: avatar (initials), member name, past-due pill, member tenure, four stats (Balance / Last paid / Last payment date / Avg-per-week).
- Activity timeline: interleaves status changes, payment events, scrape runs.
- Right rail:
  - Listings on this room (PadSplit ✓; Airbnb/TurboTenant faded "Not listed" until later phases)
  - Sync metadata (last occupancy sync / last financial sync / next financial sync / last selector failure)
  - Quick actions (placeholder buttons; most are Phase 2+)

### Sync indicator (top bar)

Three states: green (synced < 60 min), amber (1–4h), red (>4h or offline). Clicking opens a panel listing recent `sync_runs` with status and any error screenshots inline.

## 7. Auth & RBAC

- **Clerk Organization** = "CoHost Management" (single org Phase 1; the multi-tenant primitive sits there ready for the future).
- **Roles** (Clerk role enum):
  - `admin` — Jordan + 1–2 trusted leads. Full dashboard, settings, scraper controls, financial export.
  - `agent` — the rest of the team. Dashboard, room detail, member detail. No settings, no automation, no exports.
  - `owner` — exists in the enum but unused in Phase 1. Phase-2 owner-portal users will be created with this role and a `team_users.owner_id`. Server middleware will scope all queries to that owner.
- **Clerk webhook** at `/api/clerk-webhook` upserts `team_users` on user.created/updated/deleted.
- **Server-side gate**: every Server Action and API route resolves `{org_id, role, owner_id}` from the Clerk session, attaches it to the request context, and gates with a single `requireRole()` helper. RBAC checks live in one place.
- **MFA** enforced by Clerk organization policy (required for `admin`, optional for `agent`). Configured in the Clerk dashboard, not in app code, so Jordan can change the policy without a deploy.

## 8. Bootstrap flow (first-run setup)

1. **Sign in via Clerk** — Jordan creates the org, becomes its first admin.
2. **Connect PadSplit** — Settings → Integrations shows a "Log into PadSplit" button. Clicking it enqueues a `padsplit:interactive_login` job in Redis (BullMQ). The Mac Studio worker picks it up and spawns a **headful Chromium window** with PadSplit's login page. Jordan logs in once on the Mac (handles 2FA, captchas, device verification — anything PadSplit throws). When the host nav loads, the worker saves cookies to the local jar and updates `platform_listings.session_status = ACTIVE`. Note: this step assumes Jordan is at the Mac when he clicks the button. Remote bootstrap is a Phase 2 concern.
3. **Discovery scrape** — RoomOS auto-queues a one-shot `padsplit:discovery` job. Worker walks `/host/rooms` paginated, creates Property + Room + PlatformListing rows for everything PadSplit knows about. Takes ~10–15 min.
4. **Map owners** — dashboard surfaces "Unmapped properties (70)" panel. Two paths:
   - CSV import: download a template (auto-filled with property addresses), fill the `owner_name` column, upload. RoomOS upserts `owners` and assigns `properties.owner_id`.
   - Click-and-assign: per-property dropdown for one-off corrections.
5. **Invite team** — Clerk handles invitation emails for the 5 team members; each gets a link, signs up, lands as `agent` role by default. Admin role is upgraded manually by an existing admin via Settings → Team (writes to Clerk Organization Membership; webhook syncs the role change back to `team_users`).
6. **Continuous sync** — the BullMQ scheduler kicks the recurring jobs in: `padsplit:occupancy` every 30 min, `padsplit:financials` every 2h, `padsplit:discovery` weekly.

## 9. Operational concerns

- **Logging**: Pino (structured JSON) on web and worker. Web → Railway stdout. Worker → `~/Library/Logs/RoomOS/worker.log` (rotated daily, kept 14 days) + tail-streamed to web via authenticated POST to `/api/worker-logs` (so worker logs are visible in-app without SSH'ing the Mac).
- **Errors**: Sentry on both web and worker. `sync_runs` failures + selector failures + session-refresh-required events also DM Jordan in Slack via webhook.
- **Backups**:
  - Postgres — Railway daily snapshots + a weekly `pg_dump` to S3 (retention 90 days).
  - Cookie jar — never leaves the Mac. If it dies, repeat bootstrap step 2 (~5 min).
- **Secrets**:
  - Local dev: `.env` (gitignored), template in `.env.example`.
  - Web prod: Railway environment variables.
  - Worker: macOS Keychain (read at process start; nothing in plaintext on disk).
- **Worker lifecycle**: `launchd` agent at `~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist`. RunAtLoad + KeepAlive. Restarts on crash. Logs to launchd's StandardOutPath / StandardErrorPath.
- **Worker deployment (Phase 1)**: Manual. `git pull && npm install && launchctl kickstart -k gui/$(id -u)/com.cohostmgmt.roomos.worker` on the Mac. Self-update is deferred to Phase 2 once we know how often we actually ship worker changes.
- **Worker → web auth**: The worker authenticates to `/api/heartbeat` and `/api/worker-logs` with a static API key (stored in macOS Keychain on the worker, in Railway env vars on the web). Rotated when a team member leaves.
- **CI**: typecheck + lint + `prisma migrate diff` + Vitest unit tests on PR. No deploy from PR. Merge to `main` deploys web to Railway.
- **Time/locale**: All timestamps stored as UTC in Postgres; UI renders in `America/New_York` (CoHost's operating timezone).

## 10. Success criteria

Phase 1 ships when, on a fresh install with the operator's real PadSplit credentials:

1. Bootstrap (sign in → connect PadSplit → discovery → map owners) completes in under 30 minutes.
2. Dashboard loads with all 70 properties / 300 rooms / 250+ active members visible and correctly grouped by status.
3. Occupancy data is no more than 35 minutes stale (30 min cadence + 5 min slack).
4. Financial data is no more than 2h 15min stale.
5. Operator and 5 team members can sign in via Clerk, with role gates correctly applied.
6. The "Scraper offline" banner correctly fires within 5 minutes of the worker process dying.
7. A simulated PadSplit session expiry (manually deleting the cookie jar) produces a `session_refresh_required` alert and does NOT cause silent data staleness.
8. After 7 days of continuous operation, zero member-financial rows have been double-inserted (idempotency holds).

## 11. Open questions / explicitly deferred

- **PadSplit reactivate flow** — Channel-Manager couldn't discover where PadSplit surfaces a "Reactivate room" action. Phase 1 does NOT need to reactivate (we only read), so this stays an open question for the Phase 2 unified-inbox work where reply/action capability comes online.
- **Owner portal UI** — schema is ready (`team_users.owner_id`, `role=owner`); UI deferred.
- **Automation engine** — deferred to Phase 4+.
- **Multi-tenant productization** — schema supports it; productizing for other PM operators is a separate future project.
- **Mobile / responsive** — Phase 1 is desktop-first. Tablets work; phones are out of scope. Operator-tool, not consumer-tool.
- **Real-time inbox SSE** — original spec mentioned SSE for inbox; deferred until inbox arrives in Phase 2.

## 12. What's *not* in Phase 1 (worth restating)

The original RoomOS request listed eight subsystems. Phase 1 contains **four**:

✅ Database schema and migrations
✅ PadSplit scraper (read-only: occupancy + financials + discovery)
✅ Room Command Center dashboard (home + all-rooms + room detail + sync indicator)
✅ Team auth (Clerk, admin/agent roles)

❌ Airbnb scraper — Phase 2
❌ Unified inbox + Playwright reply — Phase 2 (will require revisiting the "send messages on behalf of operator" risk model with a separate brainstorm)
❌ TurboTenant scraper — Phase 3
❌ Automation engine — Phase 4+
❌ Financial rollup view & CSV export — Phase 4+ (the scraper *gathers* the financial data in Phase 1; the reporting UI is later)

Each deferred subsystem gets its own brainstorm → spec → plan → implementation cycle.

## 13. Visual design direction

RoomOS inherits the **CoHost Management brand** established at cohostmgmt.net (and the local `cohost-website/` Next.js source). Refined editorial luxury — cream + gold + Playfair serif — adapted for an internal operator tool. Same brand, back-office tuning.

This is deliberately **not** the HostMind aesthetic. HostMind is the operator's own product (mission-control terminal, dark cyan). RoomOS is the back office of CoHost Management itself; it should feel like the brand.

### Type system

- **Display**: Playfair Display 700/800 — room headers, page titles, KPI numerals. Use italics where the moment calls for it (e.g., status verbs like *Vacant*, *Moving*).
- **Body**: Inter 400/500/600 — paragraph copy, table cells, descriptions.
- **Tabular numbers**: Inter with `font-variant-numeric: tabular-nums` — for balances, dates, counts. Keep the family consistent; lean on tnum for column alignment instead of switching to a mono face.
- **Eyebrow / label**: Inter 11px uppercase, 0.18em letter-spacing, gold or muted charcoal.

No JetBrains Mono. No Space Grotesk. The brand is Playfair + Inter; we don't add a third face.

### Color tokens (CoHost brand)

| Token | Value | Use |
|---|---|---|
| `--cream` | `#F8F6F1` | App background |
| `--paper` | `#FDFCF8` | Card / surface |
| `--paper-2` | `#F2EEE6` | Raised surfaces, table headers |
| `--charcoal` | `#1A1A1A` | Primary text |
| `--ink` | `#0D0D0D` | High-contrast accents (footer, modals) |
| `--muted` | `#6B645A` | Secondary text (warm gray, not cool gray) |
| `--rule` | `rgba(26,26,26,0.08)` | Default 1px borders/rules |
| `--rule-hi` | `rgba(212,168,67,0.4)` | Hover/active borders |
| `--gold` | `#D4A843` | Primary accent, CTAs, active states |
| `--gold-dark` | `#B8932A` | Pressed states, dark-on-cream text accent |
| `--gold-light` | `#E0BC5A` | Hover gold |
| **Status: past due** | `#C45D2E` | Terracotta (warm warning, fits the palette) |
| **Status: vacant** | `#A33D3D` | Muted oxide red |
| **Status: moving** | `#3F5E7A` | Slate blue (cool, neutral) |
| **Status: needs flip** | `#8B6F5C` | Warm taupe |
| **Status: occupied** | `#5A7A4A` | Forest sage (quiet good news) |

The status palette is intentionally earthy — terracotta / sage / slate / taupe — so the dashboard reads like a refined back-office, not a traffic-light SaaS app. Gold is reserved for *interaction* (CTAs, active tabs), never status.

### Visual vocabulary

- **Soft corners** — 4–6px border-radius on cards, 6px on buttons. Not sharp like HostMind, not bubbly like SaaS templates. Borrow from cohost-website's `rounded-lg` / `rounded-xl`.
- **Hairline rules** in `--rule` between rows, sections, header bars.
- **Left-stripe accents** (2px) on status cards using the earth-tone palette above.
- **Gold border-left** on featured / floating-stat cards, à la cohost-website's `.border-l-2 border-l-gold` pattern in the hero.
- **Eyebrow labels** in Inter uppercase 0.18em tracking, gold or muted charcoal: `LAST 30 DAYS`, `ACTIVE OCCUPANCY`.
- **Animated gold border rotation** on at most one featured element per page (the sync indicator panel) — uses the existing `.animate-border-rotate` from `globals.css`. Sparingly.
- **No backdrop-blur, no glass effects, no drop shadows in the bulk of the UI.** A single subtle elevation on the floating-stat card (matches cohost-website's hero stat) is allowed; that's the exception.
- **Italic Playfair** for emphasis only — *one* italicized word per section, never a whole sentence.

### Density

| Element | Value |
|---|---|
| KPI tile padding | 24–28px (the brand is luxurious — give it room) |
| Table row height | 44px |
| Card grid gap | 12–14px |
| Card padding | 18–20px |
| Section spacing | 40–48px |

Looser than HostMind would be — luxury/editorial brands earn trust through whitespace. We sacrifice some information density for the brand to feel right. (The All Rooms tab can run tighter for power-user filtering; the home view stays generous.)

### Motion

- **Page load**: `fadeInUp` 0.6s ease-out, staggered 100–200ms (the existing `.animate-in` + `.delay-*` classes from `globals.css`).
- **Word reveal** on the home view's title, à la the cohost-website hero `WordReveal`. One signature element.
- **Number changes**: cohost-website already has a `NumberTicker` component — reuse for KPI values updating.
- **Hover**: rule color crossfades from `--rule` to `--rule-hi` over 200ms; no scale, no shadow.
- **Floating stat (one place)**: a small floating "Last 30 Days · Owner Distributions" card on the home view (mirrors hero pattern), gentle `animate-float` (3s ease-in-out infinite). Subtle, not bobbing aggressively.

### Anti-patterns (explicit "do not")

- No mission-control / cyan / scan-line / phosphor anything. That's HostMind's lane.
- No `backdrop-filter: blur` glass cards in the bulk of the UI.
- No purple-to-blue gradients (or any gradients beyond the brand's hero overlay).
- No emoji-as-UI-semantics. Status icons are SVG marks or colored stripes.
- No "level up your portfolio" startup-microcopy. Tone matches the brand's existing copy: *"We Run It. You Collect."* — confident, declarative, owner-grade.
- No JetBrains Mono. No Space Grotesk. Two faces (Playfair + Inter), not three.
- No bright SaaS pastels for status. Earth tones only.
- No 16px+ rounded corners that read as Linear/Vercel SaaS template. 4–6px max.
