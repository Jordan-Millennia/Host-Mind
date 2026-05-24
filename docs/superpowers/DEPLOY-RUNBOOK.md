<!-- docs/superpowers/DEPLOY-RUNBOOK.md -->
# RoomOS — Full Deploy Runbook (Phases 2A → 2C)

One ordered pass to take everything on `main` live. **Web → Railway, worker → Mac Studio (launchd).**
Per-phase detail lives in DEPLOYMENT-2A/2B/2C.md; this is the consolidated sequence.

Legend: 🤖 = I can do/prep remotely · 🙋 = needs you (your machine / accounts).

---

## 1. Database migrations — run once against prod 🤖🙋
From anywhere with the prod `DATABASE_URL` (e.g. `railway run --service Postgres`):
```bash
cd roomos
DATABASE_URL=postgresql://… pnpm --filter @roomos/db exec prisma migrate deploy
```
Applies `phase_2a_vault`, `phase_2b_airbnb`, `phase_2c_automation`. Verify:
```bash
psql "$DATABASE_URL" -c '\d occupancies' | grep -E 'access_code|turno'
psql "$DATABASE_URL" -c '\d rooms'       | grep -E 'ghl_'
```

## 2. Web app → Railway 🙋
- Env on the web service: existing (`DATABASE_URL`, Clerk keys, `WEB_BASE_URL`) **plus**
  `TURNO_WEBHOOK_SECRET=<random>` and optional `SLACK_WEBHOOK_URL`.
- Deploy: push to `main` (if Railway auto-deploys) or `railway up`. Confirm `/properties` loads.

## 3. Worker → Mac Studio 🙋
```bash
cd <repo>/roomos && git pull && pnpm install
pnpm --filter @roomos/db exec prisma generate
```
Add to the worker `.env` (each optional — absent = that integration stays idle):
```
GHL_API_KEY=pit-…        GHL_LOCATION_ID=VVZsPyxTZG6H9vdXfe1o
TTLOCK_CLIENT_ID=…       TTLOCK_ACCESS_TOKEN=…
# TURNO_API_KEY=…        (add in step 5)
```
One-time headful logins (a browser opens — sign in, finish MFA):
```bash
pnpm --filter @roomos/worker exec tsx src/cli.ts login --platform padsplit
pnpm --filter @roomos/worker exec tsx src/cli.ts login --platform airbnb
pnpm --filter @roomos/worker exec tsx src/cli.ts check  --platform airbnb   # → "airbnb session is active"
```
Restart the scheduler + watch:
```bash
launchctl kickstart -k gui/$(id -u)/com.cohostmgmt.roomos.vault
tail -f ~/Library/Logs/RoomOS/vault.stdout.log
```
Within ~15 min expect: `vault-sync: complete`, `airbnb-sync: complete`, `room side-effects reconciled`.

## 4. TTLock lock-map — turns on door codes 🤖🙋
Door codes stay idle until `config/lock-map.json` exists (safe default). Build it from the live account:
1. Export locks via the TTLock MCP (`ttlock_list_locks`, `response_format=json`) → `locks.json`. *(Ask me — I can pull this.)*
2. ```bash
   pnpm --filter @roomos/worker exec tsx src/cli.ts build-lock-map --locks ./locks.json
   ```
3. This writes **`config/lock-map.json`** (confident matches only) + **`config/lock-map-review.json`** (everything else, with a suggested room + score). **Review the second file and move confirmed entries into the first** — door codes are physical security, so nothing low-confidence is mapped automatically.
4. Each mapped room's **TTLock gateway must be online** (several were offline at last check) or its code can't sync.

## 5. Turno — when you have the key 🙋
- Worker `.env`: `TURNO_API_KEY=…`
- Confirm Turno's endpoint paths in `packages/worker/src/automation/turno.ts` against the live API.
- In Turno, register the webhook → `https://<railway-app>/api/webhooks/turno`, header `x-turno-secret: <TURNO_WEBHOOK_SECRET>`.

## 6. Embed in GHL 🙋
Add `https://<railway-app>` as a GHL iFrame widget (or a blank funnel page with an `<iframe>`), ~900px tall.

---

## Smoke test (after first reconcile)
- `/properties` shows cross-listing badges; `/settings/airbnb` shows unmapped listings (or empty).
- Postgres: a recent `SUCCESS` row in `sync_runs` for `VAULT_SYNC` and `AIRBNB_SYNC`; `rooms.ghl_stage_id` populating; GHL Room Tracker stages moving on their own.
