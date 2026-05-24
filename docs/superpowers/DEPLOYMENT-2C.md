<!-- docs/superpowers/DEPLOYMENT-2C.md -->
# RoomOS Phase 2C — Operational Automation Deployment

Phase 2C closes the loop: every occupancy change automatically updates the **GHL
Room Tracker**, provisions/revokes **TTLock** access codes, and opens **Turno**
cleaning jobs on checkout. All three run as side-effects in the Mac Studio worker
after each sync (vault + airbnb); the Turno *completion* path is a webhook into the
Railway-hosted web app.

**Each integration self-disables when its credentials are absent** — deploy this
safely before you've provisioned all the keys; features light up as creds arrive.

---

## 1. Apply the migration

```bash
cd roomos
DATABASE_URL=postgresql://… pnpm --filter @roomos/db exec prisma migrate deploy
```
Adds nullable columns only (`rooms.ghl_*`, `occupancies.access_code*`, `occupancies.turno_*`) — no locking, no backfill.

## 2. Worker env (Mac Studio) — the automation runs here

Add to the worker `.env` (all optional; a missing key disables just that integration):

```
GHL_API_KEY=pit-…              # GoHighLevel Private Integration Token
GHL_LOCATION_ID=VVZsPyxTZG6H9vdXfe1o
TTLOCK_CLIENT_ID=…             # same TTLock app creds as ttlock-mcp-server
TTLOCK_ACCESS_TOKEN=…
TURNO_API_KEY=…                # once you have it (see §6)
```
The Room Tracker **pipeline id + stage ids** are baked in as constants
(`packages/worker/src/automation/ghl-stages.ts`) — only the API key/location are env.

Restart the worker so the reconcile hooks load:
```bash
launchctl kickstart -k gui/$(id -u)/com.cohostmgmt.roomos.vault
```
Within one cycle (~15 min) the logs show `room side-effects reconciled` with
`ghlUpdated / codesCreated / codesDeleted / cleaningJobsCreated` counts.

## 3. TTLock lock-map

Codes only fire for a room that maps to a lock. The map is
`packages/worker/config/lock-map.json` (or `LOCK_MAP_PATH`), keyed `"Street — Room N"`
→ `lockId` (see `lock-map.example.json`).

Easiest path: **ask Claude to build it** — with the TTLock MCP connected, Claude runs
`ttlock_list_locks`, matches each lock alias to its room, and writes the file. Gateway
mode is used (server-side, no phone), so each mapped room needs a TTLock **gateway**
online.

## 4. Web env (Railway) — Turno completion webhook

The webhook flips a room back to clean/VACANT when Turno reports a job done. Add on Railway:
```
TURNO_WEBHOOK_SECRET=<random-string>   # REQUIRED — the route returns 503 until set (never left open)
SLACK_WEBHOOK_URL=…                     # optional "room is clean" pings
```
Then in Turno → register the webhook:
`https://<your-railway-app>/api/webhooks/turno` with header `x-turno-secret: <TURNO_WEBHOOK_SECRET>`
(or `?secret=` query param).

## 5. Embed the dashboard in GHL

Once the web app is live on Railway:
- GHL → Dashboard → Add Widget → Custom → iFrame → URL `https://<your-railway-app>`, height ~900px; **or**
- GHL → Sites → Funnels → new blank page → Custom Code:
  `<iframe src="https://<your-railway-app>" style="width:100%;height:900px;border:none;"></iframe>`

## 6. Things only you can do

| Step | Why |
|------|-----|
| One-time headful `login --platform padsplit` / `--platform airbnb` on the Mac Studio | Browser + MFA; captures the encrypted session the worker reuses |
| Get the **Turno API key** (Turno → settings/API) | Turno hook stays idle until `TURNO_API_KEY` is set |
| Provide TTLock creds + confirm each mapped room has a **gateway** online | Gateway-mode codes need it |

## 7. Caveats to confirm at go-live

- **Turno endpoints** (`/properties`, `/projects`) follow the documented Bearer shape but
  aren't verified against a live key yet — confirm paths in
  `packages/worker/src/automation/turno.ts` when the key lands (constants at the top, one-line fix).
- **GHL stage ids** are the values from the system brief; if the Room Tracker pipeline was
  rebuilt, refresh them in `ghl-stages.ts`.
- First reconcile is **date-gated**: TTLock codes only for stays with `leaseEnd >= today`,
  Turno jobs only for checkouts within the last 2 days — so go-live won't flood either system
  with historical stays. New TTLock codes are additionally **capped at 25 per reconcile**, so a
  freshly-populated lock-map rolls out over a few 15-min passes instead of bursting the gateway.
