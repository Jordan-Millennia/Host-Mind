<!-- docs/superpowers/DEPLOYMENT-2B.md -->
# RoomOS Phase 2B — Manual Deployment Steps

Run these once after Phase 2B code lands on `main`.

## 1. Apply the Phase 2B database migration

From the deploy environment (`railway run --service Postgres` or equivalent):

```bash
cd roomos
pnpm install
pnpm --filter @roomos/db exec prisma migrate deploy
pnpm db:generate
```

Confirm:
```bash
psql "$DATABASE_URL" -c "\d platform_listings" | grep -E "room_id|external_listing_id"
```

`room_id` should be nullable; a new unique index on `(platform, external_listing_id)` should be present.

## 2. Interactive Airbnb login (one-time on Mac Studio)

```bash
cd roomos
pnpm --filter @roomos/worker exec tsx src/cli.ts login --platform airbnb
```

A headful Chromium window opens at `airbnb.com/login`. Sign in, handle any MFA. When you land on `/hosting`, the worker captures the storage state and exits. Cookie jar lands at `~/Library/Application Support/RoomOS/.auth/airbnb.json`. Verify the saved session with:

```bash
pnpm --filter @roomos/worker exec tsx src/cli.ts check --platform airbnb
```

It should log `airbnb session is active`.

**Cookie-jar encryption (decision):** the Airbnb jar reuses Phase-1B's mechanism — AES-256-GCM with the 32-byte key derived from the macOS Keychain via the `security` CLI (`packages/worker/src/keychain.ts`, service `com.cohostmgmt.roomos`), sealed into a versioned envelope (`packages/worker/src/cookies.ts`), written mode `0600`. **No `keytar`/native dependency was added** — same protection PadSplit's `padsplit.json` already uses.

## 3. Restart the launchd worker

The new `airbnb-sync` recurring job is registered automatically when the scheduler restarts:

```bash
launchctl kickstart -k gui/$(id -u)/com.cohostmgmt.roomos.vault
```

Tail logs and confirm both `vault-sync` and `airbnb-sync` recurring jobs are scheduled:

```bash
tail -f ~/Library/Logs/RoomOS/vault.stdout.log
```

Look for two `INFO: scheduler running` log lines mentioning each job.

## 4. Smoke test

First, run one sync by hand on the Mac Studio (don't wait for the 30-min schedule),
with `DATABASE_URL` pointed at prod:

```bash
cd roomos
DATABASE_URL=postgresql://… pnpm --filter @roomos/worker exec tsx src/cli.ts airbnb-sync
```

Expect a result log with `listingsUpserted`, `bookingsUpserted`, `mappingsAuto`,
`mappingsAmbiguous`, and `crossListings` counts (and `errors: []` for a clean run;
a few non-fatal `errors` mark the run `PARTIAL`, which is fine).

Then verify in the app + database:

1. Open `/settings/airbnb` on prod. Expect the unmapped-listings table (or empty state)
   to render. Confirm any ambiguous mappings by picking a room. ("Ambiguous" = the
   matcher found the property but couldn't pick a unique room — e.g. a multi-room
   property whose listing title didn't say "Room N".)
2. Open `/properties` on prod. Expect a red `⚠ N cross-listed` badge on each property
   with a room active on both PadSplit and Airbnb.
3. In Postgres:
   ```sql
   SELECT count(*) FROM platform_listings WHERE platform = 'AIRBNB' AND room_id IS NOT NULL;
   SELECT count(*) FROM platform_listings WHERE platform = 'AIRBNB' AND room_id IS NULL;
   SELECT count(*) FROM sync_runs WHERE kind = 'AIRBNB_SYNC' AND status IN ('SUCCESS','PARTIAL') AND started_at > NOW() - INTERVAL '1 hour';
   SELECT count(*) FROM property_flags WHERE source = 'MANUAL' AND source_ref LIKE 'cross-listing-%' AND closed_at IS NULL;
   ```
   Expect: a mix of mapped + unmapped listings; at least one recent `SUCCESS`/`PARTIAL`
   run; the cross-listing flag count equals the number of cross-listed rooms.

After the manual run passes, the scheduler picks it up automatically every 30 min
(see §3) — no further action needed.

> **Bookings join note:** the `/hosting/reservations/all` table doesn't expose a
> listing's numeric id, so each booking is matched to its listing by title
> (`attachListingIdsByTitle`). A booking whose listing title doesn't exactly match a
> row on `/hosting/listings` is left unassigned (no occupancy) rather than mapped to
> the wrong room. If expected occupancies are missing, check for title drift between
> the two pages first.
