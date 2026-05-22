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
pnpm --filter @roomos/worker exec tsx src/cli.ts airbnb-login
```

A headful Chromium window opens at `airbnb.com/login`. Sign in, handle any MFA. When you land on `/hosting`, the worker captures the storage state and exits. Cookie jar lands at `~/Library/Application Support/RoomOS/.auth/airbnb.json`.

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

(Filled in by Task 21.)
