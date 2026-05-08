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

## 2. Apply the Phase 2A database migration

From the deploy environment with `DATABASE_URL` pointing at the production Railway Postgres:

```bash
cd roomos
pnpm install
pnpm --filter @roomos/db exec prisma migrate deploy
```

Confirm with:
```bash
psql "$DATABASE_URL" -c '\dt property_flags' -c '\d property_flags'
```

## 3. Install the new vault-sync agent

(Filled in by Task 18 of the implementation plan.)

## 4. Set the VAULT_PATH env var

In `roomos/packages/worker/.env.local`:

```
VAULT_PATH=/Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub
```

## 5. Smoke test

(Filled in by Task 26.)
