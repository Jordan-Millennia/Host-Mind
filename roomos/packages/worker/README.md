# @roomos/worker

PadSplit scraper that runs on Jordan's Mac Studio. See `DEPLOYMENT-1B.md` for install instructions.

## Quick reference

- One-time interactive login: `pnpm --filter @roomos/worker dev login --platform padsplit`
- Run discovery once now: `pnpm --filter @roomos/worker dev run --job padsplit:discovery`
- Start the scheduler (continuous mode, used by launchd): `pnpm --filter @roomos/worker dev scheduler`
- Print version + heartbeat health: `pnpm --filter @roomos/worker dev version`

## Logs

`~/Library/Logs/RoomOS/worker.log` — daily rotation, 14 day retention.
