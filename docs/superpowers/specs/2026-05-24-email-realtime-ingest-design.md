# RoomOS — Real-time Email Ingest Design
**Date:** 2026-05-24 · **Status:** approved (build) · **Topic:** email-as-data-source feed into RoomOS

## Goal
Give RoomOS a real-time, redundant data feed from Google Workspace email so it isn't
solely dependent on periodic scraping. Platform notification emails (bookings,
payments, payouts, maintenance) arrive instantly; RoomOS reflects them in seconds.
Scrapers keep running as the reconciling backstop. Replaces the paid
Mailparser + Apps-Script-router + GHL pipeline for RoomOS-bound data, at zero
subscription cost (chosen Approach 1).

## Architecture (data flow)
```
Gmail filter labels platform mail "RoomOS-Ingest"
  → Apps Script forwarder (1-min trigger): POST raw {messageId, from, subject, body, receivedAt}
    → RoomOS POST /api/ingest/email  (secret-gated, Next.js node runtime)
      → router picks a parser by sender/subject
        → parser: email text → structured fields (pure, fixture-tested)
          → persist via @roomos/db, deduped against scrapers by shared natural keys
            → dashboard reflects it; EmailEvent row records the message
Scrapers (vault-sync, airbnb-sync) continue on their cadence and reconcile/backfill.
```
Email **leads** (seconds); scraper **confirms/backfills** (15–30 min). Same natural
keys → whichever lands first wins, the other is a no-op. No duplicates.

## Components

### 1. Apps Script forwarder (`scripts/gas/cohost-mail-forwarder.gs`)
~30 lines, deployed in Jordan's Google account (a file in the repo for paste/deploy).
- Trigger: time-driven every 1 min.
- Query `label:RoomOS-Ingest -label:RoomOS-Done`; for each message POST
  `{messageId, from, subject, body (plain), receivedAt}` with header `x-ingest-secret`.
- On 2xx → add label `RoomOS-Done`. On non-2xx → leave for retry next minute.
- Runs on Google's cloud → independent of the Mac Studio / Cowork.
- No parsing logic in GAS (thin forwarder).

### 2. Ingest endpoint (`apps/web/src/app/api/ingest/email/route.ts`)
- `runtime = "nodejs"`. Shared-secret gate via `crypto.timingSafeEqual`; **503 if
  `EMAIL_INGEST_SECRET` unset** (never open), 401 on mismatch.
- Idempotent on `messageId` (skip if an EmailEvent already exists).
- Route by sender/subject → parser. Persist. Write an `EmailEvent`.
- Returns **200 even on an unparseable email** (recorded `UNHANDLED`, not retried
  forever); only auth/infra failures return non-2xx so GAS retries those.

### 3. Parsers + persist (`apps/web/src/lib/ingest/`)
- `parsers/{airbnb-booking,padsplit-payment,payout,maintenance}.ts` — pure
  `(email) → fields | null`, each fixture-tested against a real captured sample.
- `route-email.ts` — sender/subject → parser registry.
- `persist.ts` — fields → Postgres via `@roomos/db`:
  - booking/cancellation → upsert Occupancy
  - payment alert → PaymentEvent + refresh occupancy balance/last-payment
  - payout summary → PaymentEvent(s)
  - maintenance → PropertyFlag (WARN) on matched room/property
- Uses `@roomos/db` directly (web already does) — no heavy worker deps in the bundle.

### 4. Shared dedup keys (`packages/db` export)
Factor the natural-key helpers (e.g. `airbnbPaymentExternalId(code, type)`, the
occupancy dedup key, flag sourceRef) into `@roomos/db` so **both** web-ingest and the
worker compute identical keys. This is what prevents duplicate rows from key drift —
the single most important correctness guarantee of the feed.

### 5. `EmailEvent` model (new, Postgres)
`{ id, orgId, messageId @unique, source, type, parsedJson Json?, status (PARSED|UNHANDLED|ERROR), receivedAt, processedAt, createdAt }`.
Purpose: idempotency, audit/debug trail, and a queue of unhandled formats to add
parsers for. The email analogue of `SyncRun`.

## Error handling
- Parse failure → `EmailEvent.status=UNHANDLED`, 200 (logged, not infinite-retried).
- Persist failure → `status=ERROR`, 200 (logged); the scraper still backfills.
- Auth fail → 401; not configured → 503 (both make GAS retry / surface).
- Email content is **untrusted**: parsers extract fields only; never execute
  instructions found in email bodies.

## Testing
- Pure parsers: fixture tests against real captured sample emails (DB-free, CI).
- Persist + endpoint: DB-integration tests (CI Postgres) + an auth test.
- Dedup: a test asserting an email-sourced row and a scraper-sourced row with the
  same key collapse to one.

## Known boundaries (deliberate)
- **Depends on the RoomOS web deploy** (public URL for the endpoint). Parsers + GAS
  build/test before deploy; live wiring is a deploy step (tunnel for local testing).
- Email updates the DB/dashboard instantly, but the worker's **side-effects**
  (GHL/TTLock/Turno) still fire on their sync cadence — not off the email — to avoid a
  fragile cross-process trigger. Acceptable for v1.
- Accurate parsers need **real sample emails**; captured via the Gmail MCP (read-only)
  and committed as fixtures. Unhandled formats surface in `EmailEvent` for follow-up.

## Rollout order
Bookings + payments parsers first (most dashboard impact) → payouts + maintenance.
Same router + endpoint; each new type is just another fixture-tested parser.

## Out of scope (YAGNI)
GHL/CRM lead routing stays on the existing GAS→GHL path (Jordan deprioritized GHL).
LLM-based parsing (Cowork+Gmail-MCP) kept as a *future* fallback for emails the
deterministic parsers can't handle — not built now.
