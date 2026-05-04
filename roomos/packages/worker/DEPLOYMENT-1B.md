# Phase 1B — Mac Studio Worker Install

After Phase 1A is shipped to Railway, run these once on Jordan's Mac Studio.

## 1. Clone the repo

```bash
cd ~/Code  # or wherever you keep repos
git clone <your-roomos-remote> roomos-phase-1a
cd roomos-phase-1a
git checkout main  # or whichever branch has Phase 1B merged
```

## 2. Install local dependencies

```bash
cd roomos
pnpm install
pnpm --filter @roomos/worker exec playwright install chromium
```

## 3. Configure worker .env

```bash
cp packages/worker/.env.example packages/worker/.env
$EDITOR packages/worker/.env
```

Required values:
- `DATABASE_URL` — same as the Railway Postgres URL (use the public connection string, not the internal `${{Postgres.DATABASE_URL}}` proxy var).
- `REDIS_URL` — the Railway Redis URL (public).
- `WORKER_API_KEY` — the secret you generated when adding it to Railway env vars.
- `WEB_BASE_URL` — `https://<your-railway-domain>`.
- `WORKER_ID` — something like `"mac-studio-jordan"`.

## 4. One-time interactive PadSplit login

```bash
pnpm worker:dev login --platform padsplit
```

A Chrome window opens. Sign into PadSplit normally (handle 2FA / captcha / device verification as you would in any browser). When the host nav appears, the CLI saves cookies and exits. Verify:

```bash
pnpm worker:dev check
# expects: "padsplit session is active"
```

## 5. (Optional but recommended) Run discovery and occupancy once before going continuous

```bash
pnpm worker:dev run --job padsplit:discovery
pnpm worker:dev run --job padsplit:occupancy
```

After ~10–15 min, the `/rooms` page on Railway will show ~70 properties / ~300 rooms / ~250 active members.

## 6. Install the launchd agent

```bash
./packages/worker/launchd/install.sh
```

Verify:
```bash
launchctl list | grep cohostmgmt
tail -f ~/Library/Logs/RoomOS/worker.log
```

## 7. Verify the dashboard sync pill

Open `https://<your-railway-domain>/rooms`. Top-right should show a **green** sync pill within 1–2 minutes ("Synced N min ago").

## Troubleshooting

- **Pill stays red** — check `~/Library/Logs/RoomOS/worker.log` for connection errors. Likely `REDIS_URL` or `WORKER_API_KEY` mismatch with what Railway has.
- **Cookie jar gone** — re-run `pnpm worker:dev login`.
- **PadSplit selectors moved** — the `padsplit/selectors.ts` file plus the relevant fixtures need updating; tests will fail until they match.

## Stop / restart / uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist  # stop
launchctl load   ~/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist  # start
./packages/worker/launchd/uninstall.sh                                       # remove
```
