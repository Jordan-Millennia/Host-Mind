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
pnpm db:generate
```

Confirm with:
```bash
psql "$DATABASE_URL" -c '\dt property_flags' -c '\d property_flags'
```

## 3. Install the new vault-sync agent

```bash
cd roomos/packages/worker/launchd
./install.sh --vault --vault-path /Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub
```

Expected: `~/Library/LaunchAgents/com.cohostmgmt.roomos.vault.plist` is created and loaded. Confirm with:

```bash
launchctl list | grep cohostmgmt.roomos.vault
```

The first sync should fire within seconds. Tail logs:

```bash
tail -f ~/Library/Logs/RoomOS/vault.stdout.log
```

## 4. Set the VAULT_PATH env var

In `roomos/packages/worker/.env.local`:

```
VAULT_PATH=/Users/jordanruvalcaba/Documents/CoHost-Knowledge-Hub
```

## 5. Smoke test

After the launchd agent has fired at least once (give it ~60 seconds):

1. **Properties list renders.** Open `https://<railway-domain>/properties`. Expect ~20 rows (only properties whose vault file has `padsplit-property-id` in frontmatter — the others are Airbnb-only and surface in Phase 2B). The cream/coral/clay palette should be visible. Each row has an occupancy donut and `<n> of <m> occupied`.

2. **Property detail renders.** Click `1311 Morgana Road`. Expect:
   - 6 bedrooms (R1–R6)
   - 4 occupied, 1 vacant (R3 Katrina), 1 terminated (R4 Javari)
   - Past Due KPI shows **$407.90** (R4 balance)
   - Right-rail "Live flags" lists the open flags from the vault file (booking applicant, eKey not revoked, water-leak resolved, etc.)
   - Sync history rail shows "Vault: <recent>" and "Hospitable / REI Hub: N/A (Phase 2B/2C)"

3. **Sync runs are recorded.** In Postgres:
   ```bash
   psql "$DATABASE_URL" -c "SELECT kind, status, items_synced, completed_at FROM sync_runs WHERE kind='VAULT_SYNC' ORDER BY started_at DESC LIMIT 3;"
   ```
   Expect at least one `SUCCESS` (or `PARTIAL` if some vault files are missing `padsplit-property-id`) row from the last 15 minutes.

4. **Old PadSplit scraper is gone.** Confirm:
   ```bash
   ls ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist 2>/dev/null \
     && echo "ERROR: old worker plist still installed" \
     || echo "OK: old worker plist retired"
   ```

5. **Worker test suite stays green.** Run from a clean checkout:
   ```bash
   cd roomos
   pnpm install
   pnpm db:generate
   pnpm --filter @roomos/worker test
   ```
   Expect: `Tests 57 passed | 2 skipped`. The 2 skipped tests are legacy PadSplit-parser fixtures (broken by recent worker hot-fixes; intentionally skipped per `tests/unit/padsplit-parsers.test.ts` comments). Phase 2B/2C may revisit them.

If any of the above fails, see `docs/superpowers/specs/2026-05-08-roomos-vault-fed-pivot-design.md` §10 for success criteria and §9 for known open questions.
