# RoomOS Phase 1B — PadSplit Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Playwright-based scraper running on Jordan's Mac Studio as a launchd agent that walks PadSplit's host UI on three cadences — discovery (weekly), occupancy (every 30 min), member financials (every 2 hours) — and writes results into the Phase 1A Postgres on Railway. Visible payoff: after one interactive login + one discovery run, the dashboard shows ~70 properties / ~300 rooms with their current occupancy and financial state.

**Architecture:** Two-process system. (1) **Worker** lives at `roomos/packages/worker/`, runs on Jordan's Mac Studio as a launchd agent, headful Chromium with persisted cookies, pulls jobs from BullMQ-on-Redis (Railway), writes results directly to Postgres (Railway) via the shared `@roomos/db` package. (2) **Web** gains three new endpoints — `/api/heartbeat`, `/api/screenshots`, and a sync-status read helper — plus a "sync pill" in the Topbar so Jordan sees worker health at a glance. No worker code touches Clerk; auth between worker and web is a shared `WORKER_API_KEY`.

**Tech Stack:** Node 22 (matches Railway nixpacks), TypeScript 5, Playwright (chromium, headful on Mac), BullMQ + ioredis, Pino, dotenv, Vitest (fixture-based scraper tests), Zod (env). New runtime infra: Redis on Railway. Reuses Phase 1A's Prisma schema unchanged.

---

## Source spec & predecessors

- Master spec: `docs/superpowers/specs/2026-05-02-roomos-phase-1-design.md` (sections 5, 8, 9 cover scraper / bootstrap / ops).
- Phase 1A plan: `docs/superpowers/plans/2026-05-02-roomos-phase-1a-foundation.md` (delivered the schema, web app, Clerk auth, brand).
- Channel-Manager source: `Channel-Manager/adapters/padsplit/` and `Channel-Manager/adapters/base/` — verified PadSplit selectors (April 2026), persistent storage-state pattern. Port these; do not rewrite.

## What this plan does NOT cover (deferred to later)

- **Bootstrap UI** — "Connect PadSplit" button in Settings, the unmapped-properties → owners assignment UI, team invites in-app. Phase 1D.
- **Full home view + all-rooms table + room detail UI.** Phase 1C.
- **Sentry / Slack alerts.** Defer until 1C/1D when there's more UI to alert on; Phase 1B logs locally and exposes errors via the sync-status pill.
- **Worker auto-update.** Manual `git pull && launchctl kickstart` for now (deferred from Phase 1A's `roomos/DEPLOYMENT.md`).
- **Replying to PadSplit messages / outbound actions** — Phase 2 (unified inbox).

## Decisions locked (autonomous calls — see `feedback_decision_pace.md`)

- Worker package at `roomos/packages/worker/`, name `@roomos/worker`.
- Redis: Railway's official "Redis" plugin (single instance, ~$5/mo). Add to the existing Railway project as a new service.
- BullMQ queue: single queue `padsplit`, four job names: `padsplit:discovery`, `padsplit:occupancy`, `padsplit:financials`, `padsplit:interactive_login`.
- Logger: Pino. Worker logs to `~/Library/Logs/RoomOS/worker.log` (rotated daily, 14d retention) and to console.
- Worker → web auth: shared `WORKER_API_KEY` env var (random 64 hex chars; in macOS Keychain on the Mac, in Railway env vars on the web).
- Cookie jar: `~/Library/Application Support/RoomOS/.auth/padsplit.json`, encrypted at rest with AES-256-GCM. Encryption key stored in macOS Keychain via the `security` CLI.
- Screenshots-on-error: stored locally at `~/Library/Application Support/RoomOS/screenshots/`, then POSTed to web `/api/screenshots` for inline viewing.
- Tests: fixture-based using saved HTML snapshots committed under `roomos/packages/worker/tests/fixtures/`. No live PadSplit calls in CI.

## What changes on the web side

- Two new API routes: `POST /api/heartbeat` (worker pings every 60s) and `POST /api/screenshots` (worker uploads error screenshots).
- One new helper: `lib/sync-status.ts` reads the most recent `sync_runs` row + the latest heartbeat to compute the pill state (green/amber/red).
- One new component: `components/nav/SyncPill.tsx` rendered in the Topbar.
- One new schema migration: a `worker_heartbeats` singleton table (one row per worker, just `id`, `worker_id`, `last_seen_at`).

---

## File structure (locked in before tasks)

```
roomos/
├── packages/
│   ├── db/                              # unchanged from Phase 1A
│   │   └── prisma/
│   │       ├── schema.prisma            # MODIFIED — adds WorkerHeartbeat model
│   │       └── migrations/
│   │           └── <ts>_worker_heartbeat/
│   └── worker/                          # NEW — the entire scraper lives here
│       ├── package.json
│       ├── tsconfig.json
│       ├── .env.example
│       ├── README.md
│       ├── tests/
│       │   ├── fixtures/
│       │   │   ├── padsplit-rooms-list.html
│       │   │   ├── padsplit-listing-detail.html
│       │   │   └── padsplit-member-profile.html
│       │   └── unit/
│       │       ├── padsplit-parsers.test.ts    # parses fixture HTML, asserts shape
│       │       └── jitter.test.ts              # delay distribution sanity
│       ├── launchd/
│       │   ├── com.cohostmgmt.roomos.worker.plist.template
│       │   ├── install.sh
│       │   └── uninstall.sh
│       ├── DEPLOYMENT-1B.md             # Mac Studio install steps for Jordan
│       └── src/
│           ├── env.ts                   # zod-validated env loader (DATABASE_URL, REDIS_URL, WORKER_API_KEY, WEB_BASE_URL, SLACK_WEBHOOK_URL?)
│           ├── log.ts                   # pino logger (file + console)
│           ├── keychain.ts              # macOS Keychain read/write helpers (security CLI shell-out)
│           ├── cookies.ts               # encrypted cookie jar I/O
│           ├── http.ts                  # tiny client for POST to web /api endpoints (uses WORKER_API_KEY)
│           ├── playwright/
│           │   ├── session.ts           # withPlaywrightSession() — one context, persisted state
│           │   └── stealth-config.ts    # ua, viewport, no stealth plugin (residential IP)
│           ├── padsplit/
│           │   ├── urls.ts              # /host/dashboard, /host/rooms, /host/listing/<id>
│           │   ├── selectors.ts         # data-testid / class selectors (verified Apr 2026)
│           │   ├── login.ts             # interactive headful login flow
│           │   ├── parsers.ts           # pure HTML→data parsers (testable)
│           │   ├── discovery.ts         # walk /host/rooms, return Property/Room/Listing rows
│           │   ├── occupancy.ts         # walk per-property pages, return Member+Occupancy rows
│           │   └── financials.ts        # walk per-member profile, return balance/payment rows
│           ├── jobs/
│           │   ├── padsplit-discovery.ts        # BullMQ processor for padsplit:discovery
│           │   ├── padsplit-occupancy.ts        # BullMQ processor for padsplit:occupancy
│           │   ├── padsplit-financials.ts       # BullMQ processor for padsplit:financials
│           │   └── padsplit-interactive-login.ts# BullMQ processor for padsplit:interactive_login
│           ├── queue.ts                 # BullMQ queue + worker setup, job registration
│           ├── scheduler.ts             # cron-style repeat-job registration on startup
│           ├── heartbeat.ts             # 60s ping to /api/heartbeat
│           ├── persist.ts               # write helpers: upsertProperty, upsertRoom, recordSyncRun, etc.
│           ├── jitter.ts                # randomized delay helper, used between page loads
│           └── cli.ts                   # `pnpm worker <login|run|scheduler|version>` entrypoint
│
└── apps/
    └── web/
        └── src/
            ├── app/
            │   ├── api/
            │   │   ├── heartbeat/route.ts          # NEW
            │   │   └── screenshots/route.ts        # NEW
            │   └── (signed-in)/
            │       └── (existing — Topbar gains SyncPill in Task 11)
            ├── lib/
            │   ├── sync-status.ts                  # NEW — read sync_runs + heartbeat, return pill state
            │   └── worker-auth.ts                  # NEW — verify WORKER_API_KEY on inbound requests
            └── components/
                └── nav/
                    └── SyncPill.tsx                 # NEW — server component, renders pill
```

## Conventions (additive to Phase 1A)

- Worker is **server-only TypeScript**; no React, no Next runtime. Plain Node 22.
- Pino structured logs; every log line includes `worker_id`, `job_id`, and a tag (e.g., `tag: "padsplit/discovery"`).
- Every BullMQ job processor follows the same skeleton: write a `sync_runs` row at start, do work, update the row at end with status + error JSON.
- Pure parsers (`padsplit/parsers.ts`) take a string of HTML and return typed data. They have no Playwright import, no DB import, no I/O. This makes them trivially fixture-testable.
- The job processors compose: `(playwright session) → fetch HTML → call parsers → persist results`.
- Random jitter between every PadSplit page load (3–8s, gaussian biased toward 5s).
- One Playwright context per worker process. Never parallel jobs against PadSplit.

---

## Task 0: Pre-flight — provision Redis + verify Phase 1A reachable

This is a **manual gate**. Surface to the user; commit nothing.

- [ ] **Step 1: Add Redis to the existing Railway project**

In the Railway dashboard for the `roomos-prod` project:
1. **+ New → Database → Redis.** Wait for provisioning.
2. Copy the auto-generated `REDIS_URL` (visible on the Redis service's Variables tab).
3. On the **web** service → Variables, paste:
   ```
   REDIS_URL=${{Redis.REDIS_URL}}
   WORKER_API_KEY=<generate via: openssl rand -hex 32>
   ```
4. Re-deploy the web service so the new env vars are loaded.

- [ ] **Step 2: Confirm the deployed Phase 1A app is healthy**

Open `https://<railway-domain>/`. Sign in with your real Clerk account. Land on `/rooms` → "No rooms — yet." empty state. Open Railway's Postgres → Data → `team_users` and confirm your user row exists with `role: AGENT` (or `ADMIN` if you upgraded yourself).

If Phase 1A is not deployed/healthy, stop here. Phase 1B has nothing to write to.

- [ ] **Step 3: Note the WORKER_API_KEY for Mac Studio**

You'll paste this into the Mac Studio's macOS Keychain in Task 12. For now, copy the value to your password manager. **Do not commit it anywhere.**

---

## Task 1: Worker package scaffold + env + logger

**Files:**
- Create: `roomos/packages/worker/package.json`
- Create: `roomos/packages/worker/tsconfig.json`
- Create: `roomos/packages/worker/.env.example`
- Create: `roomos/packages/worker/README.md`
- Create: `roomos/packages/worker/src/env.ts`
- Create: `roomos/packages/worker/src/log.ts`
- Modify: `roomos/package.json` (add `worker:*` scripts)

- [ ] **Step 1: Create the package directory and files**

Run from the worktree root:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
mkdir -p packages/worker/src packages/worker/tests/fixtures packages/worker/tests/unit packages/worker/launchd
```

Create `packages/worker/package.json`:
```json
{
  "name": "@roomos/worker",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/cli.js",
  "bin": { "roomos-worker": "./dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "lint": "echo 'no lint'",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@roomos/db": "workspace:*",
    "bullmq": "^5.34.0",
    "ioredis": "^5.4.1",
    "playwright": "^1.49.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^4.0.0"
  }
}
```

Create `packages/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"]
}
```

Create `packages/worker/.env.example`:
```bash
# DB & queue (point at the same Railway Postgres + Redis as the web app)
DATABASE_URL=""
REDIS_URL=""

# Web auth (must match the value on the web side)
WORKER_API_KEY=""
WEB_BASE_URL="https://<your-railway-domain>"

# Optional — Slack alerts (Phase 1C)
SLACK_WEBHOOK_URL=""

# Worker identity
WORKER_ID="mac-studio-jordan"
LOG_LEVEL="info"
```

Create `packages/worker/README.md`:
```markdown
# @roomos/worker

PadSplit scraper that runs on Jordan's Mac Studio. See `DEPLOYMENT-1B.md` for install instructions.

## Quick reference

- One-time interactive login: `pnpm --filter @roomos/worker dev login --platform padsplit`
- Run discovery once now: `pnpm --filter @roomos/worker dev run --job padsplit:discovery`
- Start the scheduler (continuous mode, used by launchd): `pnpm --filter @roomos/worker dev scheduler`
- Print version + heartbeat health: `pnpm --filter @roomos/worker dev version`

## Logs

`~/Library/Logs/RoomOS/worker.log` — daily rotation, 14 day retention.
```

- [ ] **Step 2: Create the env loader**

Create `packages/worker/src/env.ts`:
```typescript
import { z } from "zod"
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env") })
config({ path: resolve(process.cwd(), ".env.local"), override: true })

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_API_KEY: z.string().min(32),
  WEB_BASE_URL: z.string().url(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  WORKER_ID: z.string().min(1).default("mac-studio-default"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
```

- [ ] **Step 3: Create the logger**

Create `packages/worker/src/log.ts`:
```typescript
import pino from "pino"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { env } from "./env"

const LOG_DIR = resolve(homedir(), "Library", "Logs", "RoomOS")
mkdirSync(LOG_DIR, { recursive: true })

const LOG_FILE = resolve(LOG_DIR, "worker.log")

export const log = pino({
  level: env.LOG_LEVEL,
  base: { worker_id: env.WORKER_ID },
  transport: {
    targets: [
      { target: "pino/file", options: { destination: LOG_FILE, mkdir: true } },
      { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
    ],
  },
})

export type Logger = typeof log
```

- [ ] **Step 4: Add worker scripts to the workspace root**

Edit `roomos/package.json` — add to `scripts`:
```json
"worker:dev": "pnpm --filter @roomos/worker dev",
"worker:build": "pnpm --filter @roomos/worker build",
"worker:scheduler": "pnpm --filter @roomos/worker dev scheduler"
```

(Insert these alongside the existing `db:*` scripts; preserve the rest of the package.json.)

- [ ] **Step 5: Install workspace deps**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm install
```

Verify the install succeeded (Playwright will download chromium browser; that takes ~30s on first run).

- [ ] **Step 6: Sanity check the env loader**

Create a temporary `packages/worker/.env` (gitignored — verify in `git status`):
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/roomos_dev?schema=public"
REDIS_URL="redis://localhost:6379"
WORKER_API_KEY="$(openssl rand -hex 32)"
WEB_BASE_URL="http://localhost:3000"
WORKER_ID="mac-studio-dev"
```

Then test the env loader:
```bash
cd packages/worker
pnpm exec tsx -e "import { env } from './src/env'; console.log(env.WORKER_ID)"
```

Expected output: `mac-studio-dev` (or whatever you set).

If you get a Zod error, fix the `.env` file and try again.

- [ ] **Step 7: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git status --short  # ensure no .env files are staged
git add roomos/
git commit -m "scaffold @roomos/worker package with pino logger and zod env"
```

---

## Task 2: Cookie jar with macOS Keychain encryption

**Files:**
- Create: `roomos/packages/worker/src/keychain.ts`
- Create: `roomos/packages/worker/src/cookies.ts`
- Create: `roomos/packages/worker/tests/unit/cookies.test.ts`

This is **TDD**. The cookie jar reads/writes encrypted JSON; encryption key comes from macOS Keychain.

- [ ] **Step 1: Write the failing test**

Create `packages/worker/tests/unit/cookies.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const mockGetKey = vi.fn()
vi.mock("../../src/keychain", () => ({
  getOrCreateEncryptionKey: () => mockGetKey(),
}))

import { saveCookies, loadCookies, hasCookies } from "../../src/cookies"

describe("cookie jar", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "roomos-cookies-"))
    // 32-byte (256-bit) deterministic key for the test
    mockGetKey.mockResolvedValue(Buffer.from("0".repeat(64), "hex"))
  })

  afterEach?.(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("hasCookies returns false when the file does not exist", async () => {
    expect(await hasCookies("padsplit", tmpDir)).toBe(false)
  })

  it("round-trips a cookies object encrypted at rest", async () => {
    const sample = {
      cookies: [{ name: "session", value: "abc123", domain: ".padsplit.com" }],
      origins: [],
    }
    await saveCookies("padsplit", sample, tmpDir)
    expect(await hasCookies("padsplit", tmpDir)).toBe(true)
    expect(existsSync(resolve(tmpDir, "padsplit.json"))).toBe(true)

    const loaded = await loadCookies("padsplit", tmpDir)
    expect(loaded).toEqual(sample)
  })

  it("encrypts on disk (raw bytes do not contain the cookie value)", async () => {
    await saveCookies("padsplit", { cookies: [{ name: "sess", value: "PLAINTEXT_SECRET", domain: "x" }], origins: [] }, tmpDir)
    const { readFileSync } = await import("node:fs")
    const raw = readFileSync(resolve(tmpDir, "padsplit.json"), "utf-8")
    expect(raw).not.toContain("PLAINTEXT_SECRET")
  })

  it("returns null when load is called before save", async () => {
    expect(await loadCookies("padsplit", tmpDir)).toBeNull()
  })
})
```

(Vitest doesn't have `afterEach` imported in this snippet — fix at implementation time by adding it to the import.)

- [ ] **Step 2: Run the test — confirm it fails**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker test
```

Expected: `Cannot find module '../../src/cookies'`. Good.

- [ ] **Step 3: Implement the keychain helper**

Create `packages/worker/src/keychain.ts`:
```typescript
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const SERVICE = "com.cohostmgmt.roomos"
const ACCOUNT = "cookie-jar-key"

/** Returns the 32-byte AES-256 key. Creates a new one on first call. */
export async function getOrCreateEncryptionKey(): Promise<Buffer> {
  try {
    const hex = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim()
    return Buffer.from(hex, "hex")
  } catch {
    // Not found — generate and store
    const key = randomBytes(32)
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-s", SERVICE,
        "-a", ACCOUNT,
        "-w", key.toString("hex"),
        "-U", // update if exists
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    )
    return key
  }
}
```

- [ ] **Step 4: Implement the cookie jar**

Create `packages/worker/src/cookies.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { homedir } from "node:os"
import { getOrCreateEncryptionKey } from "./keychain"

const DEFAULT_DIR = resolve(homedir(), "Library", "Application Support", "RoomOS", ".auth")

type CookiesPayload = {
  cookies: Array<{ name: string; value: string; domain: string; [k: string]: unknown }>
  origins: unknown[]
}

function jarPath(platform: string, dir = DEFAULT_DIR): string {
  return resolve(dir, `${platform}.json`)
}

export async function hasCookies(platform: string, dir = DEFAULT_DIR): Promise<boolean> {
  try {
    await access(jarPath(platform, dir))
    return true
  } catch {
    return false
  }
}

export async function saveCookies(
  platform: string,
  payload: CookiesPayload,
  dir = DEFAULT_DIR,
): Promise<void> {
  const key = await getOrCreateEncryptionKey()
  await mkdir(dir, { recursive: true, mode: 0o700 })

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8")
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const envelope = {
    v: 1 as const,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  }
  await writeFile(jarPath(platform, dir), JSON.stringify(envelope), { mode: 0o600 })
}

export async function loadCookies(
  platform: string,
  dir = DEFAULT_DIR,
): Promise<CookiesPayload | null> {
  if (!(await hasCookies(platform, dir))) return null
  const key = await getOrCreateEncryptionKey()
  const raw = JSON.parse(await readFile(jarPath(platform, dir), "utf-8"))
  if (raw.v !== 1) throw new Error(`unknown cookie envelope version: ${raw.v}`)

  const iv = Buffer.from(raw.iv, "base64")
  const tag = Buffer.from(raw.tag, "base64")
  const data = Buffer.from(raw.data, "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(plaintext.toString("utf-8")) as CookiesPayload
}
```

- [ ] **Step 5: Run the tests — confirm they pass**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker test
```

Expect: 4 tests pass.

If a test fails on the keychain mock not finding `afterEach`, add `afterEach` to the vitest import in the test file.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "encrypted cookie jar with macOS Keychain key derivation (AES-256-GCM)"
```

---

## Task 3: Playwright session module

**Files:**
- Create: `roomos/packages/worker/src/playwright/session.ts`
- Create: `roomos/packages/worker/src/playwright/stealth-config.ts`

- [ ] **Step 1: Write the stealth-config (browser shape)**

Create `packages/worker/src/playwright/stealth-config.ts`:
```typescript
// Note: deliberately NO puppeteer-extra-stealth. We rely on the residential IP
// and real Mac fingerprint. Importing stealth would be a tell — a real human's
// Chrome doesn't ship those overrides.
export const BROWSER_DEFAULTS = {
  viewport: { width: 1440, height: 900 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  locale: "en-US",
  timezoneId: "America/New_York",
} as const
```

- [ ] **Step 2: Write the session module**

Create `packages/worker/src/playwright/session.ts`:
```typescript
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { hasCookies, loadCookies, saveCookies } from "../cookies"
import { log } from "../log"
import { BROWSER_DEFAULTS } from "./stealth-config"

const SHOT_DIR = resolve(homedir(), "Library", "Application Support", "RoomOS", "screenshots")
mkdirSync(SHOT_DIR, { recursive: true })

export type SessionFn<T> = (ctx: { browser: Browser; context: BrowserContext; page: Page }) => Promise<T>

export type SessionOptions = {
  /** Show the browser window (interactive login). Default: false (headless). */
  headful?: boolean
}

/** Launches Chromium, restores `<platform>.json` cookies if present, runs `fn`,
 *  persists cookies on success, captures screenshot on failure. */
export async function withPlaywrightSession<T>(
  platform: string,
  fn: SessionFn<T>,
  opts: SessionOptions = {},
): Promise<T> {
  const cookieState = (await hasCookies(platform)) ? await loadCookies(platform) : null
  const headless = !opts.headful

  log.debug({ platform, headless, hasCookies: !!cookieState }, "launching browser")
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    ...BROWSER_DEFAULTS,
    storageState: cookieState ? { cookies: cookieState.cookies as never, origins: cookieState.origins as never } : undefined,
  })
  const page = await context.newPage()

  try {
    const result = await fn({ browser, context, page })
    const state = await context.storageState()
    await saveCookies(platform, { cookies: state.cookies as never, origins: state.origins as never })
    return result
  } catch (err) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const shotPath = resolve(SHOT_DIR, `${platform}_err_${ts}.png`)
    try {
      await page.screenshot({ path: shotPath, fullPage: true })
      log.error({ err: (err as Error).message, screenshot: shotPath }, "session failed")
      ;(err as Error & { screenshotPath?: string }).screenshotPath = shotPath
    } catch {
      log.error({ err: (err as Error).message }, "session failed (screenshot also failed)")
    }
    throw err
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
```

- [ ] **Step 3: Sanity check (no test)**

This module is hard to unit-test (requires a real browser). It will be exercised by the integration tasks (4–8). Just ensure typecheck passes:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker typecheck
```

Expect: zero errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "Playwright session helper with persisted cookie state and screenshot-on-error"
```

---

## Task 4: PadSplit URLs + selectors + parsers (port from Channel-Manager)

**Files:**
- Create: `roomos/packages/worker/src/padsplit/urls.ts`
- Create: `roomos/packages/worker/src/padsplit/selectors.ts`
- Create: `roomos/packages/worker/src/padsplit/parsers.ts`
- Create: `roomos/packages/worker/tests/fixtures/padsplit-listing-detail.html`
- Create: `roomos/packages/worker/tests/unit/padsplit-parsers.test.ts`

This is **TDD** — write the parser tests against fixture HTML before the parser logic.

- [ ] **Step 1: Capture a fixture from Channel-Manager**

The Channel-Manager scraper code at `Channel-Manager/adapters/padsplit/src/playwright-ops.js` has the verified selectors, but no fixture HTML is committed there. We'll create a synthetic fixture matching the documented HTML shape.

Create `packages/worker/tests/fixtures/padsplit-listing-detail.html`:
```html
<!doctype html>
<html><body>
<div data-testid="hero__property-address-txt">3216 71st Ave N</div>
<div data-testid="hero__property-city-txt">St Petersburg, FL</div>
<div data-testid="property-status__status">Active</div>
<a data-testid="bedrooms__see-all-lnk" href="#">See all rooms</a>

<div class="Room_root__XM73E">
  <div>ID: 41418</div>
  <span>Occupied</span>
  <a href="/host/member/8888">Marcus T.</a>
  <div>Mar 11, 2025 - present</div>
  <button data-testid="room__more-btn">More</button>
</div>

<div class="Room_root__XM73E">
  <div>ID: 41419</div>
  <span>Vacant</span>
  <div>Apr 4, 2025 - Apr 18, 2026</div>
</div>

<div class="Room_root__XM73E">
  <div>ID: 41420</div>
  <span>Moving in</span>
  <a href="/host/member/9999">Tasha M.</a>
  <div>May 4, 2026 - present</div>
</div>
</body></html>
```

- [ ] **Step 2: Write the parser tests**

Create `packages/worker/tests/unit/padsplit-parsers.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseListingPage } from "../../src/padsplit/parsers"

const fixture = readFileSync(
  resolve(__dirname, "../fixtures/padsplit-listing-detail.html"),
  "utf-8",
)

describe("parseListingPage", () => {
  it("extracts the property header", () => {
    const out = parseListingPage(fixture)
    expect(out.address).toBe("3216 71st Ave N")
    expect(out.city).toBe("St Petersburg, FL")
    expect(out.status).toBe("Active")
  })

  it("returns one room per Room_root card", () => {
    const out = parseListingPage(fixture)
    expect(out.rooms).toHaveLength(3)
  })

  it("parses an occupied room with member + start date", () => {
    const r = parseListingPage(fixture).rooms[0]!
    expect(r.externalRoomId).toBe("41418")
    expect(r.status).toBe("OCCUPIED")
    expect(r.member?.externalMemberId).toBe("8888")
    expect(r.member?.name).toBe("Marcus T.")
    expect(r.moveInDate).toBe("2025-03-11")
    expect(r.leaseEndDate).toBeNull()
  })

  it("parses a vacant room with no member but a date range", () => {
    const r = parseListingPage(fixture).rooms[1]!
    expect(r.externalRoomId).toBe("41419")
    expect(r.status).toBe("VACANT")
    expect(r.member).toBeNull()
    expect(r.moveInDate).toBe("2025-04-04")
    expect(r.leaseEndDate).toBe("2026-04-18")
  })

  it("normalizes 'Moving in' to MOVING_IN", () => {
    const r = parseListingPage(fixture).rooms[2]!
    expect(r.status).toBe("MOVING_IN")
  })
})
```

- [ ] **Step 3: Run the tests — confirm they fail**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker test
```

Expected: `Cannot find module '../../src/padsplit/parsers'` (or similar).

- [ ] **Step 4: Write `urls.ts`**

Create `packages/worker/src/padsplit/urls.ts`:
```typescript
export const PADSPLIT_URLS = {
  dashboard: "https://www.padsplit.com/host/dashboard",
  rooms: "https://www.padsplit.com/host/rooms",
  property: (psPropertyId: string) => `https://www.padsplit.com/host/listing/${psPropertyId}`,
  member: (psMemberId: string) => `https://www.padsplit.com/host/member/${psMemberId}`,
} as const
```

- [ ] **Step 5: Write `selectors.ts`**

Create `packages/worker/src/padsplit/selectors.ts`:
```typescript
// Verified against the live host UI April 2026 (per Channel-Manager source).
// PadSplit's React app uses Material UI and exposes data-testid attributes
// on most interactive elements; we prefer those over class selectors.
export const SELECTORS = {
  // Session marker
  hostNav: '[data-testid="host-app-bar"]',

  // Rooms table page
  roomsSearchField: '[data-testid="host-rooms__search-field"]',
  roomsSortDropdown: '[data-testid="host-rooms__sorting-dropdown"]',
  propertyLink: 'a[data-testid="rooms-table__property-link"]',

  // Listing detail page
  heroAddress: '[data-testid="hero__property-address-txt"]',
  heroCity: '[data-testid="hero__property-city-txt"]',
  propertyStatus: '[data-testid="property-status__status"]',
  bedroomsSeeAllLink: '[data-testid="bedrooms__see-all-lnk"]',
  roomCard: ".Room_root__XM73E",
  roomMoreBtn: '[data-testid="room__more-btn"]',

  // Member profile (financials drill-down — to be verified live in Task 8)
  memberBalance: '[data-testid="member__balance"]',
  memberDaysPastDue: '[data-testid="member__days-past-due"]',
  memberLastPayment: '[data-testid="member__last-payment"]',
} as const
```

(The member profile selectors are best-guesses based on the PadSplit UI patterns; Task 8 verifies them against the live page and corrects if needed.)

- [ ] **Step 6: Write `parsers.ts`**

Create `packages/worker/src/padsplit/parsers.ts`:
```typescript
import { JSDOM } from "jsdom"
import type { OccupancyStatus } from "@roomos/db"

// Map PadSplit's status text to our enum values
const STATUS_MAP: Record<string, OccupancyStatus> = {
  occupied: "OCCUPIED",
  vacant: "VACANT",
  "moving in": "MOVING_IN",
  "moving out": "MOVING_OUT",
  "needs flip": "NEEDS_FLIP",
  "waiting for approval": "WAITING_APPROVAL",
  inactive: "INACTIVE",
}

export type ParsedRoomCard = {
  externalRoomId: string
  status: OccupancyStatus
  member: { externalMemberId: string; name: string } | null
  moveInDate: string | null  // ISO YYYY-MM-DD
  leaseEndDate: string | null
}

export type ParsedListingPage = {
  address: string
  city: string
  status: string
  rooms: ParsedRoomCard[]
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
}

function parseDate(text: string): string | null {
  // "Mar 11, 2025" → "2025-03-11"
  const m = text.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (!m) return null
  const [, mon, day, year] = m
  const mm = MONTHS[mon!]
  if (!mm) return null
  return `${year}-${mm}-${day!.padStart(2, "0")}`
}

function parseDateRange(text: string): { start: string | null; end: string | null } {
  const m = text.match(
    /([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})\s*[-–]\s*(present|[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/,
  )
  if (!m) return { start: null, end: null }
  return {
    start: parseDate(m[1]!),
    end: /^present$/i.test(m[2]!) ? null : parseDate(m[2]!),
  }
}

export function parseListingPage(html: string): ParsedListingPage {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const address = doc.querySelector('[data-testid="hero__property-address-txt"]')?.textContent?.trim() ?? ""
  const city = doc.querySelector('[data-testid="hero__property-city-txt"]')?.textContent?.trim() ?? ""
  const status = doc.querySelector('[data-testid="property-status__status"]')?.textContent?.trim() ?? ""

  const cards = Array.from(doc.querySelectorAll(".Room_root__XM73E"))
  const rooms: ParsedRoomCard[] = cards.map((card) => {
    const allText = card.textContent ?? ""

    const idMatch = allText.match(/ID:\s*(\d+)/)
    const externalRoomId = idMatch ? idMatch[1]! : ""

    const statusMatch = allText.match(
      /\b(Occupied|Vacant|Moving in|Moving out|Needs flip|Waiting for approval|Inactive)\b/i,
    )
    const statusKey = statusMatch ? statusMatch[1]!.toLowerCase() : ""
    const occStatus = STATUS_MAP[statusKey] ?? "INACTIVE"

    const memberLink = card.querySelector('a[href*="/host/member/"]')
    let member: ParsedRoomCard["member"] = null
    if (memberLink) {
      const href = memberLink.getAttribute("href") ?? ""
      const idMatch = href.match(/\/host\/member\/(\d+)/)
      member = {
        externalMemberId: idMatch ? idMatch[1]! : "",
        name: memberLink.textContent?.trim() ?? "",
      }
    }

    const dates = parseDateRange(allText)
    return {
      externalRoomId,
      status: occStatus,
      member,
      moveInDate: dates.start,
      leaseEndDate: dates.end,
    }
  })

  return { address, city, status, rooms }
}
```

- [ ] **Step 7: Install jsdom**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker add jsdom
pnpm --filter @roomos/worker add -D @types/jsdom
```

- [ ] **Step 8: Run the tests — confirm they pass**

```bash
pnpm --filter @roomos/worker test
```

Expected: 4 cookie tests + 5 parser tests = 9 passed.

- [ ] **Step 9: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "PadSplit URLs, selectors, and HTML parsers (fixture-tested)"
```

---

## Task 5: Interactive login flow + CLI entry point

**Files:**
- Create: `roomos/packages/worker/src/padsplit/login.ts`
- Create: `roomos/packages/worker/src/cli.ts`

- [ ] **Step 1: Write the login flow**

Create `packages/worker/src/padsplit/login.ts`:
```typescript
import type { Page } from "playwright"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { SELECTORS } from "./selectors"
import { log } from "../log"

/** Restores existing cookies and verifies they still authenticate by checking
 *  for the host nav. Throws if the session expired. */
export async function checkPadsplitSession(): Promise<{ ok: true }> {
  return withPlaywrightSession("padsplit", async ({ page }) => {
    await page.goto(PADSPLIT_URLS.dashboard, { waitUntil: "domcontentloaded" })
    await page.waitForSelector(SELECTORS.hostNav, { timeout: 10_000 })
    log.info("padsplit session is active")
    return { ok: true }
  })
}

/** Launches a HEADFUL browser at the PadSplit login page and waits for the
 *  user to sign in. Resolves when the host nav appears. Cookies persist via
 *  the session helper's storageState mechanism. */
export async function interactiveLogin(opts: { timeoutMs?: number } = {}): Promise<{ ok: true }> {
  const timeout = opts.timeoutMs ?? 5 * 60_000  // 5 min for the human

  return withPlaywrightSession(
    "padsplit",
    async ({ page }: { page: Page }) => {
      await page.goto(PADSPLIT_URLS.dashboard, { waitUntil: "domcontentloaded" })
      log.info("Waiting for you to sign into PadSplit in the open browser window…")
      await page.waitForSelector(SELECTORS.hostNav, { timeout })
      log.info("PadSplit login successful — cookies will be saved on close.")
      return { ok: true }
    },
    { headful: true },
  )
}
```

- [ ] **Step 2: Write the CLI entry point**

Create `packages/worker/src/cli.ts`:
```typescript
#!/usr/bin/env node
import { log } from "./log"
import { interactiveLogin, checkPadsplitSession } from "./padsplit/login"

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case "login": {
      const platform = parseFlag(rest, "--platform") ?? "padsplit"
      if (platform !== "padsplit") throw new Error(`unknown platform: ${platform}`)
      await interactiveLogin()
      log.info("done")
      return
    }

    case "check": {
      await checkPadsplitSession()
      return
    }

    case "run": {
      const job = parseFlag(rest, "--job") ?? ""
      log.info({ job }, "run-once not yet implemented (Tasks 6–8)")
      return
    }

    case "scheduler": {
      log.info("scheduler not yet implemented (Task 9)")
      return
    }

    case "version": {
      log.info({ version: "0.1.0" }, "@roomos/worker")
      return
    }

    default:
      log.error({ command }, "unknown command")
      process.exit(1)
  }
}

function parseFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}

main().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, "cli failed")
  process.exit(1)
})
```

- [ ] **Step 3: Test interactive login locally**

This step requires real PadSplit credentials and that you're at your Mac. Run:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm worker:dev login --platform padsplit
```

A Chrome window opens. Sign into PadSplit normally (handles 2FA, captcha, device verification — anything PadSplit throws). The CLI exits when the host nav appears, and cookies are written to `~/Library/Application Support/RoomOS/.auth/padsplit.json` (encrypted).

**If you're not at your Mac:** skip this step. The login can be done later before Task 6 actually runs.

- [ ] **Step 4: Verify session persistence**

```bash
pnpm worker:dev check
```

Expected: `padsplit session is active`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "interactive PadSplit login flow + worker CLI entry point"
```

---

## Task 6: Discovery job — walk /host/rooms and upsert Property/Room/PlatformListing

**Files:**
- Create: `roomos/packages/worker/src/padsplit/discovery.ts`
- Create: `roomos/packages/worker/src/persist.ts`
- Create: `roomos/packages/worker/src/jitter.ts`
- Modify: `roomos/packages/worker/src/cli.ts` (wire `run --job padsplit:discovery`)

- [ ] **Step 1: Write the jitter helper**

Create `packages/worker/src/jitter.ts`:
```typescript
/** Returns a randomized delay in milliseconds, biased gaussian around `meanMs`.
 *  Result is clamped to [meanMs * 0.4, meanMs * 1.8]. */
export function jitterMs(meanMs: number): number {
  // Box-Muller transform → centered around 1.0, σ ~ 0.3
  const u1 = Math.random() || 1e-9
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const factor = 1 + z * 0.3
  const clamped = Math.max(0.4, Math.min(1.8, factor))
  return Math.round(meanMs * clamped)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const jitterSleep = (meanMs: number) => sleep(jitterMs(meanMs))
```

- [ ] **Step 2: Write the persistence helpers**

Create `packages/worker/src/persist.ts`:
```typescript
import { prisma } from "@roomos/db"
import type { Platform, OccupancyStatus, SyncKind, SyncRunStatus } from "@roomos/db"
import { log } from "./log"

/** Returns the singleton CoHost Management org, or throws if it's not seeded. */
export async function getOrg(): Promise<{ id: string }> {
  const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
  if (!org) throw new Error("CoHost Management org not seeded")
  return { id: org.id }
}

export type DiscoveredProperty = {
  externalPropertyId: string
  address: string
  city?: string
}

export type DiscoveredRoom = {
  externalPropertyId: string
  externalRoomId: string
  roomNumber?: string
}

/** Idempotently upserts properties + rooms + listings from a discovery run. */
export async function upsertDiscovery(
  orgId: string,
  properties: DiscoveredProperty[],
  rooms: DiscoveredRoom[],
): Promise<{ propertiesAdded: number; roomsAdded: number; listingsAdded: number }> {
  let propertiesAdded = 0
  let roomsAdded = 0
  let listingsAdded = 0

  // External-id → internal id map for properties
  const propertyIdMap = new Map<string, string>()

  for (const p of properties) {
    const ext = `padsplit:${p.externalPropertyId}`
    const existing = await prisma.property.findFirst({
      where: { orgId, name: ext },
    })
    if (existing) {
      propertyIdMap.set(p.externalPropertyId, existing.id)
      continue
    }
    const created = await prisma.property.create({
      data: { orgId, name: ext, address: p.address, city: p.city ?? null },
    })
    propertyIdMap.set(p.externalPropertyId, created.id)
    propertiesAdded++
  }

  for (const r of rooms) {
    const propertyId = propertyIdMap.get(r.externalPropertyId)
    if (!propertyId) {
      log.warn({ r }, "skipping room — property not found")
      continue
    }

    // Find or create the Room (by org + property + roomNumber).
    let room = await prisma.room.findFirst({
      where: { orgId, propertyId, roomNumber: r.externalRoomId },
    })
    if (!room) {
      room = await prisma.room.create({
        data: { orgId, propertyId, roomNumber: r.externalRoomId },
      })
      roomsAdded++
    }

    // Find or create the PlatformListing.
    const existingListing = await prisma.platformListing.findUnique({
      where: { roomId_platform: { roomId: room.id, platform: "PADSPLIT" as Platform } },
    })
    if (!existingListing) {
      await prisma.platformListing.create({
        data: {
          orgId,
          roomId: room.id,
          platform: "PADSPLIT",
          externalListingId: r.externalRoomId,
          externalPropertyId: r.externalPropertyId,
          isActive: true,
        },
      })
      listingsAdded++
    }
  }

  return { propertiesAdded, roomsAdded, listingsAdded }
}

/** Records a sync_runs row at start; returns the id so the caller can update it on finish. */
export async function startSyncRun(opts: { orgId: string; kind: SyncKind; platform: Platform }): Promise<string> {
  const run = await prisma.syncRun.create({
    data: { orgId: opts.orgId, kind: opts.kind, platform: opts.platform, status: "RUNNING" },
  })
  return run.id
}

export async function finishSyncRun(
  id: string,
  outcome: { status: SyncRunStatus; itemsSynced?: number; errors?: unknown; screenshots?: unknown },
): Promise<void> {
  await prisma.syncRun.update({
    where: { id },
    data: {
      completedAt: new Date(),
      status: outcome.status,
      itemsSynced: outcome.itemsSynced ?? 0,
      errorsJson: (outcome.errors as object | null | undefined) ?? undefined,
      screenshotsJson: (outcome.screenshots as object | null | undefined) ?? undefined,
    },
  })
}

export type ParsedRoomState = {
  externalRoomId: string
  status: OccupancyStatus
  externalMemberId: string | null
  memberName: string | null
  moveInDate: string | null
  leaseEndDate: string | null
}
```

- [ ] **Step 3: Write the discovery scrape**

Create `packages/worker/src/padsplit/discovery.ts`:
```typescript
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { SELECTORS } from "./selectors"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { getOrg, startSyncRun, finishSyncRun, upsertDiscovery, type DiscoveredProperty, type DiscoveredRoom } from "../persist"

/** Walk /host/rooms (paginated) and return the unique property→room map.
 *  Each row in the rooms table has a property link (with property id in the
 *  href) and an "ID: <num>" room id rendered in the row. */
async function scrapeRoomsList(): Promise<{ properties: DiscoveredProperty[]; rooms: DiscoveredRoom[] }> {
  return withPlaywrightSession("padsplit", async ({ page }) => {
    await page.goto(PADSPLIT_URLS.rooms, { waitUntil: "domcontentloaded" })
    await page.waitForSelector(SELECTORS.propertyLink, { timeout: 15_000 })

    const propertyMap = new Map<string, DiscoveredProperty>()
    const roomEntries: DiscoveredRoom[] = []

    let pageNum = 0
    for (; pageNum < 20; pageNum++) {
      // Wait for rows to render
      await jitterSleep(1500)

      const rowsOnThisPage = await page.$$eval(
        SELECTORS.propertyLink,
        (links) =>
          links.map((a) => {
            const href = a.getAttribute("href") ?? ""
            const m = href.match(/\/host\/listing\/(\d+)/)
            const externalPropertyId = m ? m[1]! : ""
            const address = (a.textContent ?? "").trim()
            // Walk up to the row to find the rendered "ID: <num>"
            let row: Element | null = a
            for (let i = 0; i < 6 && row; i++) row = row.parentElement
            const rowText = row?.textContent ?? ""
            const idMatch = rowText.match(/ID:\s*(\d+)/)
            const externalRoomId = idMatch ? idMatch[1]! : ""
            return { externalPropertyId, externalRoomId, address }
          }),
      )

      for (const r of rowsOnThisPage) {
        if (!r.externalPropertyId || !r.externalRoomId) continue
        if (!propertyMap.has(r.externalPropertyId)) {
          propertyMap.set(r.externalPropertyId, {
            externalPropertyId: r.externalPropertyId,
            address: r.address,
          })
        }
        roomEntries.push({
          externalPropertyId: r.externalPropertyId,
          externalRoomId: r.externalRoomId,
        })
      }

      // Try to advance to the next page. PadSplit's Material UI pagination
      // exposes a "Next" button; absence means we're done.
      const nextBtn = page.locator('button[aria-label="Go to next page"]')
      const disabled = (await nextBtn.count()) === 0 || (await nextBtn.isDisabled().catch(() => true))
      if (disabled) break
      await nextBtn.click()
      await jitterSleep(2500)
    }

    log.info({ pages: pageNum + 1, properties: propertyMap.size, rooms: roomEntries.length }, "rooms-list scraped")
    return { properties: Array.from(propertyMap.values()), rooms: roomEntries }
  })
}

/** Top-level discovery job: scrape, upsert, write sync_runs. */
export async function runDiscovery(): Promise<{ propertiesAdded: number; roomsAdded: number; listingsAdded: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "DISCOVERY", platform: "PADSPLIT" })

  try {
    const { properties, rooms } = await scrapeRoomsList()
    const result = await upsertDiscovery(org.id, properties, rooms)
    await finishSyncRun(runId, {
      status: "SUCCESS",
      itemsSynced: result.propertiesAdded + result.roomsAdded + result.listingsAdded,
    })
    return result
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
```

- [ ] **Step 4: Wire CLI to run discovery once**

Edit `packages/worker/src/cli.ts` — replace the `case "run":` block:
```typescript
    case "run": {
      const job = parseFlag(rest, "--job") ?? ""
      if (job === "padsplit:discovery") {
        const { runDiscovery } = await import("./padsplit/discovery")
        const result = await runDiscovery()
        log.info(result, "discovery complete")
        return
      }
      log.error({ job }, "unknown job")
      process.exit(1)
    }
```

- [ ] **Step 5: Test against the live PadSplit account**

(Requires Step 3 of Task 5 done — cookies must exist.)

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm worker:dev run --job padsplit:discovery
```

Expected output: a log line like `{"propertiesAdded":68,"roomsAdded":297,"listingsAdded":297}` (numbers will vary). Takes 1–3 minutes.

Verify in the local Postgres:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d roomos_dev -c \
  "SELECT COUNT(*) FROM properties; SELECT COUNT(*) FROM rooms; SELECT COUNT(*) FROM platform_listings WHERE platform='PADSPLIT';"
```

Expected: ~70 / ~300 / ~300.

- [ ] **Step 6: Verify idempotency**

Run discovery again:
```bash
pnpm worker:dev run --job padsplit:discovery
```

Expected: `{"propertiesAdded":0,"roomsAdded":0,"listingsAdded":0}` (or near-zero — only newly-added rooms count).

- [ ] **Step 7: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "padsplit:discovery job — walk /host/rooms, upsert properties + rooms + listings"
```

---

## Task 7: Occupancy job — per-property page → upsert Member + Occupancy

**Files:**
- Create: `roomos/packages/worker/src/padsplit/occupancy.ts`
- Modify: `roomos/packages/worker/src/persist.ts` (add `upsertOccupancy` + `upsertMember`)
- Modify: `roomos/packages/worker/src/cli.ts` (wire `run --job padsplit:occupancy`)

- [ ] **Step 1: Add Member + Occupancy persistence helpers**

Append to `packages/worker/src/persist.ts`:
```typescript
import type { Platform } from "@roomos/db"

export async function upsertMember(args: {
  orgId: string
  externalMemberId: string
  name: string
  profileUrl?: string
}): Promise<{ id: string }> {
  return prisma.member.upsert({
    where: {
      platform_externalMemberId: { platform: "PADSPLIT" as Platform, externalMemberId: args.externalMemberId },
    },
    create: {
      orgId: args.orgId,
      platform: "PADSPLIT",
      externalMemberId: args.externalMemberId,
      name: args.name,
      profileUrl: args.profileUrl,
    },
    update: { name: args.name, profileUrl: args.profileUrl },
    select: { id: true },
  })
}

export async function upsertOccupancy(args: {
  orgId: string
  listingId: string
  memberId: string | null
  status: OccupancyStatus
  moveInDate: string | null
  leaseEndDate: string | null
}): Promise<void> {
  // Find the most-recent active occupancy for this listing.
  const existing = await prisma.occupancy.findFirst({
    where: {
      orgId: args.orgId,
      listingId: args.listingId,
      status: { in: ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] },
    },
    orderBy: { createdAt: "desc" },
  })

  // If the same member is still in the same listing, just update the status/dates.
  if (existing && existing.memberId === args.memberId) {
    await prisma.occupancy.update({
      where: { id: existing.id },
      data: {
        status: args.status,
        moveInDate: args.moveInDate ? new Date(args.moveInDate) : null,
        leaseEndDate: args.leaseEndDate ? new Date(args.leaseEndDate) : null,
        scrapedAt: new Date(),
      },
    })
    return
  }

  // Different member (or now vacant) — close the old, open the new.
  if (existing) {
    await prisma.occupancy.update({
      where: { id: existing.id },
      data: { status: "INACTIVE", scrapedAt: new Date() },
    })
  }

  if (args.memberId || args.status !== "VACANT") {
    await prisma.occupancy.create({
      data: {
        orgId: args.orgId,
        listingId: args.listingId,
        memberId: args.memberId,
        status: args.status,
        moveInDate: args.moveInDate ? new Date(args.moveInDate) : null,
        leaseEndDate: args.leaseEndDate ? new Date(args.leaseEndDate) : null,
        scrapedAt: new Date(),
      },
    })
  }
}
```

- [ ] **Step 2: Write the occupancy scrape**

Create `packages/worker/src/padsplit/occupancy.ts`:
```typescript
import { prisma } from "@roomos/db"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { parseListingPage } from "./parsers"
import {
  getOrg,
  startSyncRun,
  finishSyncRun,
  upsertMember,
  upsertOccupancy,
} from "../persist"

/** Walks every active PadSplit property page, parses room cards, upserts
 *  member + occupancy rows. Spaced over a long window via jitter. */
export async function runOccupancy(): Promise<{ propertiesScraped: number; roomsUpdated: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "OCCUPANCY", platform: "PADSPLIT" })

  // Pull the list of active PadSplit listings from our own DB. We trust
  // discovery for this — no need to walk /host/rooms again.
  const listings = await prisma.platformListing.findMany({
    where: { orgId: org.id, platform: "PADSPLIT", isActive: true },
    select: {
      id: true,
      externalListingId: true,
      externalPropertyId: true,
    },
  })

  // Group by property — one fetch per property page.
  const byProperty = new Map<string, { listingId: string; externalRoomId: string }[]>()
  for (const l of listings) {
    if (!l.externalPropertyId || !l.externalListingId) continue
    if (!byProperty.has(l.externalPropertyId)) byProperty.set(l.externalPropertyId, [])
    byProperty.get(l.externalPropertyId)!.push({ listingId: l.id, externalRoomId: l.externalListingId })
  }

  let propertiesScraped = 0
  let roomsUpdated = 0

  try {
    await withPlaywrightSession("padsplit", async ({ page }) => {
      for (const [propId, listingsForProp] of byProperty) {
        await page.goto(PADSPLIT_URLS.property(propId), { waitUntil: "domcontentloaded" })
        await page.waitForSelector(".Room_root__XM73E", { timeout: 15_000 })
        const html = await page.content()
        const parsed = parseListingPage(html)

        for (const card of parsed.rooms) {
          const target = listingsForProp.find((l) => l.externalRoomId === card.externalRoomId)
          if (!target) continue

          let memberId: string | null = null
          if (card.member) {
            const m = await upsertMember({
              orgId: org.id,
              externalMemberId: card.member.externalMemberId,
              name: card.member.name,
              profileUrl: PADSPLIT_URLS.member(card.member.externalMemberId),
            })
            memberId = m.id
          }

          await upsertOccupancy({
            orgId: org.id,
            listingId: target.listingId,
            memberId,
            status: card.status,
            moveInDate: card.moveInDate,
            leaseEndDate: card.leaseEndDate,
          })

          // Refresh listing.lastSyncedAt
          await prisma.platformListing.update({
            where: { id: target.listingId },
            data: { lastSyncedAt: new Date() },
          })

          roomsUpdated++
        }

        propertiesScraped++
        await jitterSleep(5000) // 3–8s between properties
      }
    })

    await finishSyncRun(runId, { status: "SUCCESS", itemsSynced: roomsUpdated })
    log.info({ propertiesScraped, roomsUpdated }, "occupancy sync complete")
    return { propertiesScraped, roomsUpdated }
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message, propertiesScraped, roomsUpdated },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
```

- [ ] **Step 3: Wire CLI**

Edit `packages/worker/src/cli.ts` — extend the `case "run":` block:
```typescript
      if (job === "padsplit:occupancy") {
        const { runOccupancy } = await import("./padsplit/occupancy")
        const result = await runOccupancy()
        log.info(result, "occupancy complete")
        return
      }
```

(Insert before the `log.error({ job }, "unknown job")` line.)

- [ ] **Step 4: Run against the live account**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm worker:dev run --job padsplit:occupancy
```

Expected: ~70 properties scraped, ~250-300 occupancy rows updated. Takes ~5-15 min.

Verify:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d roomos_dev -c \
  "SELECT status, COUNT(*) FROM occupancies GROUP BY status; SELECT COUNT(*) FROM members;"
```

Expected: a status breakdown matching your real PadSplit numbers (e.g., 247 OCCUPIED, 28 VACANT, 9 MOVING_IN/OUT, etc.) and ~250 members.

- [ ] **Step 5: Verify the dashboard now shows real data**

Open `http://localhost:3000/rooms` (sign in if needed). The "No rooms yet" empty state should be gone, replaced by the placeholder message: `<N> rooms found · home view UI lands in 1C`.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "padsplit:occupancy job — walk per-property pages, upsert members + occupancies"
```

---

## Task 8: Financials job — per-member profile → balance, days past due, last payment

**Files:**
- Create: `roomos/packages/worker/src/padsplit/financials.ts`
- Modify: `roomos/packages/worker/src/padsplit/parsers.ts` (add `parseMemberProfile`)
- Modify: `roomos/packages/worker/tests/fixtures/` (add `padsplit-member-profile.html`)
- Modify: `roomos/packages/worker/tests/unit/padsplit-parsers.test.ts` (add tests)
- Modify: `roomos/packages/worker/src/persist.ts` (add `updateOccupancyFinancials` + `recordPaymentEvent`)
- Modify: `roomos/packages/worker/src/cli.ts` (wire `run --job padsplit:financials`)

- [ ] **Step 1: Capture the member-profile fixture (synthetic)**

Create `packages/worker/tests/fixtures/padsplit-member-profile.html`:
```html
<!doctype html>
<html><body>
<div data-testid="member__balance">$420.00</div>
<div data-testid="member__days-past-due">5 days</div>
<div data-testid="member__last-payment">$165.00 on Apr 22, 2026</div>
</body></html>
```

(These are placeholders — the live HTML may differ. The implementer of this task should capture a real fixture by viewing source on a real PadSplit member profile page during `pnpm worker:dev login` and updating both this fixture AND the selectors in `padsplit/selectors.ts`. Tests must match whatever shape is actually used.)

- [ ] **Step 2: Add the parser test**

Append to `packages/worker/tests/unit/padsplit-parsers.test.ts`:
```typescript
import { parseMemberProfile } from "../../src/padsplit/parsers"

const memberFixture = readFileSync(
  resolve(__dirname, "../fixtures/padsplit-member-profile.html"),
  "utf-8",
)

describe("parseMemberProfile", () => {
  it("extracts balance, days past due, and last payment", () => {
    const out = parseMemberProfile(memberFixture)
    expect(out.balance).toBe("420.00")
    expect(out.daysPastDue).toBe(5)
    expect(out.lastPaymentAmount).toBe("165.00")
    expect(out.lastPaymentDate).toBe("2026-04-22")
  })

  it("returns null fields when the profile shows no balance", () => {
    const out = parseMemberProfile(`<div data-testid="member__balance">$0.00</div>`)
    expect(out.balance).toBe("0.00")
    expect(out.daysPastDue).toBeNull()
    expect(out.lastPaymentDate).toBeNull()
  })
})
```

- [ ] **Step 3: Add the parser**

Append to `packages/worker/src/padsplit/parsers.ts`:
```typescript
export type ParsedMemberProfile = {
  balance: string | null            // decimal string, e.g. "420.00"
  daysPastDue: number | null
  lastPaymentAmount: string | null  // decimal string
  lastPaymentDate: string | null    // ISO YYYY-MM-DD
}

export function parseMemberProfile(html: string): ParsedMemberProfile {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const balanceText = doc.querySelector('[data-testid="member__balance"]')?.textContent?.trim() ?? ""
  const balance = balanceText.replace(/[^0-9.]/g, "") || null

  const daysText = doc.querySelector('[data-testid="member__days-past-due"]')?.textContent?.trim() ?? ""
  const daysMatch = daysText.match(/(\d+)/)
  const daysPastDue = daysMatch ? parseInt(daysMatch[1]!, 10) : null

  const lastText = doc.querySelector('[data-testid="member__last-payment"]')?.textContent?.trim() ?? ""
  const amtMatch = lastText.match(/\$([\d.]+)/)
  const lastPaymentAmount = amtMatch ? amtMatch[1]! : null
  const dateMatch = lastText.match(/on\s+([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/)
  const lastPaymentDate = dateMatch ? parseDate(dateMatch[1]!) : null

  return { balance, daysPastDue, lastPaymentAmount, lastPaymentDate }
}
```

- [ ] **Step 4: Add the persistence helpers**

Append to `packages/worker/src/persist.ts`:
```typescript
export async function updateOccupancyFinancials(args: {
  occupancyId: string
  balance: string | null
  daysPastDue: number | null
  lastPaymentAmount: string | null
  lastPaymentAt: string | null
}): Promise<void> {
  await prisma.occupancy.update({
    where: { id: args.occupancyId },
    data: {
      currentBalance: args.balance ?? null,
      daysPastDue: args.daysPastDue,
      lastPaymentAmount: args.lastPaymentAmount ?? null,
      lastPaymentAt: args.lastPaymentAt ? new Date(args.lastPaymentAt) : null,
      lastFinancialSyncAt: new Date(),
    },
  })
}

export async function recordPaymentEvent(args: {
  orgId: string
  memberId: string
  occupancyId: string | null
  amount: string
  eventDate: string
  externalEventId: string  // hash of (memberId, amount, eventDate, source)
}): Promise<void> {
  await prisma.paymentEvent.upsert({
    where: {
      memberId_externalEventId: { memberId: args.memberId, externalEventId: args.externalEventId },
    },
    create: {
      orgId: args.orgId,
      memberId: args.memberId,
      occupancyId: args.occupancyId,
      amount: args.amount,
      eventType: "PAYMENT",
      eventDate: new Date(args.eventDate),
      source: "PADSPLIT_SCRAPE",
      externalEventId: args.externalEventId,
    },
    update: {},
  })
}
```

- [ ] **Step 5: Write the financials job**

Create `packages/worker/src/padsplit/financials.ts`:
```typescript
import { createHash } from "node:crypto"
import { prisma } from "@roomos/db"
import { withPlaywrightSession } from "../playwright/session"
import { PADSPLIT_URLS } from "./urls"
import { jitterSleep } from "../jitter"
import { log } from "../log"
import { parseMemberProfile } from "./parsers"
import {
  getOrg,
  startSyncRun,
  finishSyncRun,
  updateOccupancyFinancials,
  recordPaymentEvent,
} from "../persist"

function hashEvent(memberId: string, amount: string, date: string): string {
  return createHash("sha256").update(`padsplit:${memberId}:${amount}:${date}`).digest("hex").slice(0, 32)
}

/** Walks every active occupancy with a member, fetches their PadSplit profile,
 *  updates denormalized financial fields + appends a payment_event if a new
 *  payment is observed since last_payment_at. */
export async function runFinancials(): Promise<{ membersScraped: number; paymentsRecorded: number }> {
  const org = await getOrg()
  const runId = await startSyncRun({ orgId: org.id, kind: "FINANCIAL", platform: "PADSPLIT" })

  const occupancies = await prisma.occupancy.findMany({
    where: {
      orgId: org.id,
      status: { in: ["OCCUPIED", "MOVING_IN"] },
      member: { isNot: null },
    },
    select: {
      id: true,
      lastPaymentAt: true,
      member: { select: { id: true, externalMemberId: true } },
    },
  })

  let membersScraped = 0
  let paymentsRecorded = 0

  try {
    await withPlaywrightSession("padsplit", async ({ page }) => {
      for (const occ of occupancies) {
        if (!occ.member) continue
        await page.goto(PADSPLIT_URLS.member(occ.member.externalMemberId), {
          waitUntil: "domcontentloaded",
        })
        // No selector wait — the parser is forgiving (returns nulls for missing fields).
        const html = await page.content()
        const parsed = parseMemberProfile(html)

        await updateOccupancyFinancials({
          occupancyId: occ.id,
          balance: parsed.balance,
          daysPastDue: parsed.daysPastDue,
          lastPaymentAmount: parsed.lastPaymentAmount,
          lastPaymentAt: parsed.lastPaymentDate,
        })

        if (parsed.lastPaymentDate && parsed.lastPaymentAmount) {
          const isNewer = !occ.lastPaymentAt || new Date(parsed.lastPaymentDate) > occ.lastPaymentAt
          if (isNewer) {
            const eventId = hashEvent(occ.member.id, parsed.lastPaymentAmount, parsed.lastPaymentDate)
            await recordPaymentEvent({
              orgId: org.id,
              memberId: occ.member.id,
              occupancyId: occ.id,
              amount: parsed.lastPaymentAmount,
              eventDate: parsed.lastPaymentDate,
              externalEventId: eventId,
            })
            paymentsRecorded++
          }
        }

        membersScraped++
        await jitterSleep(5000)
      }
    })

    await finishSyncRun(runId, { status: "SUCCESS", itemsSynced: membersScraped })
    log.info({ membersScraped, paymentsRecorded }, "financials sync complete")
    return { membersScraped, paymentsRecorded }
  } catch (err) {
    await finishSyncRun(runId, {
      status: "FAILED",
      errors: { message: (err as Error).message, membersScraped, paymentsRecorded },
      screenshots: (err as Error & { screenshotPath?: string }).screenshotPath
        ? [{ path: (err as Error & { screenshotPath?: string }).screenshotPath }]
        : undefined,
    })
    throw err
  }
}
```

- [ ] **Step 6: Wire CLI**

Edit `packages/worker/src/cli.ts` — extend the `case "run":` block:
```typescript
      if (job === "padsplit:financials") {
        const { runFinancials } = await import("./padsplit/financials")
        const result = await runFinancials()
        log.info(result, "financials complete")
        return
      }
```

- [ ] **Step 7: Run tests + verify selectors against live page**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/worker test
```

Expect 9 + 2 = 11 tests pass.

**Manual verify the live profile page shape:** open one PadSplit member profile in the headful browser launched by `pnpm worker:dev login`. Inspect Element on the balance, days-past-due, and last-payment fields. If the `data-testid` values differ from what `selectors.ts` and the fixture assume, **update both** (selectors + fixture) so the parser test still passes against reality.

- [ ] **Step 8: Run financials against real account**

```bash
pnpm worker:dev run --job padsplit:financials
```

Expected: ~250 members scraped, takes 20-40 min (5s jitter × 250 = 21 min minimum).

Verify:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d roomos_dev -c \
  "SELECT COUNT(*) FROM occupancies WHERE current_balance IS NOT NULL; SELECT COUNT(*) FROM payment_events;"
```

Expect: ~250 occupancies with balances, ≥1 payment events (just the most recent payment per member; backfill comes later).

- [ ] **Step 9: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "padsplit:financials job — drill into member profiles, denormalize balance + record payments"
```

---

## Task 9: BullMQ scheduler with cron triggers

**Files:**
- Create: `roomos/packages/worker/src/queue.ts`
- Create: `roomos/packages/worker/src/scheduler.ts`
- Create: `roomos/packages/worker/src/jobs/padsplit-discovery.ts`
- Create: `roomos/packages/worker/src/jobs/padsplit-occupancy.ts`
- Create: `roomos/packages/worker/src/jobs/padsplit-financials.ts`
- Modify: `roomos/packages/worker/src/cli.ts` (wire `scheduler` command)

- [ ] **Step 1: Set up the queue + worker**

Create `packages/worker/src/queue.ts`:
```typescript
import { Queue, Worker, type JobsOptions } from "bullmq"
import IORedis from "ioredis"
import { env } from "./env"
import { log } from "./log"

export const QUEUE_NAME = "padsplit"

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })

connection.on("error", (err) => log.error({ err: err.message }, "redis connection error"))
connection.on("connect", () => log.info("redis connected"))

export const queue = new Queue(QUEUE_NAME, { connection })

export type JobName =
  | "padsplit:discovery"
  | "padsplit:occupancy"
  | "padsplit:financials"
  | "padsplit:interactive_login"

export async function enqueue(name: JobName, data: unknown = {}, opts?: JobsOptions) {
  await queue.add(name, data, opts)
}

export function startWorker(processors: Record<JobName, () => Promise<unknown>>) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const fn = processors[job.name as JobName]
      if (!fn) throw new Error(`no processor for ${job.name}`)
      return await fn()
    },
    { connection, concurrency: 1 },  // serial — never run two PadSplit jobs at once
  )
  worker.on("completed", (job) => log.info({ id: job.id, name: job.name }, "job completed"))
  worker.on("failed", (job, err) => log.error({ id: job?.id, name: job?.name, err: err.message }, "job failed"))
  return worker
}
```

- [ ] **Step 2: Write the job processors**

Create `packages/worker/src/jobs/padsplit-discovery.ts`:
```typescript
import { runDiscovery } from "../padsplit/discovery"
export async function processDiscovery() {
  return runDiscovery()
}
```

Create `packages/worker/src/jobs/padsplit-occupancy.ts`:
```typescript
import { runOccupancy } from "../padsplit/occupancy"
export async function processOccupancy() {
  return runOccupancy()
}
```

Create `packages/worker/src/jobs/padsplit-financials.ts`:
```typescript
import { runFinancials } from "../padsplit/financials"
export async function processFinancials() {
  return runFinancials()
}
```

Create `packages/worker/src/jobs/padsplit-interactive-login.ts`:
```typescript
import { interactiveLogin } from "../padsplit/login"
export async function processInteractiveLogin() {
  return interactiveLogin()
}
```

- [ ] **Step 3: Write the scheduler**

Create `packages/worker/src/scheduler.ts`:
```typescript
import { queue, startWorker } from "./queue"
import { processDiscovery } from "./jobs/padsplit-discovery"
import { processOccupancy } from "./jobs/padsplit-occupancy"
import { processFinancials } from "./jobs/padsplit-financials"
import { processInteractiveLogin } from "./jobs/padsplit-interactive-login"
import { log } from "./log"

const REPEAT = {
  occupancy: { every: 30 * 60 * 1000 },         // every 30 min
  financials: { every: 2 * 60 * 60 * 1000 },    // every 2h
  discovery: { every: 7 * 24 * 60 * 60 * 1000 },// weekly
}

export async function startScheduler(): Promise<void> {
  log.info("starting bullmq scheduler")

  await queue.add("padsplit:occupancy", {}, { repeat: REPEAT.occupancy, jobId: "repeat:occupancy" })
  await queue.add("padsplit:financials", {}, { repeat: REPEAT.financials, jobId: "repeat:financials" })
  await queue.add("padsplit:discovery", {}, { repeat: REPEAT.discovery, jobId: "repeat:discovery" })

  startWorker({
    "padsplit:discovery": processDiscovery,
    "padsplit:occupancy": processOccupancy,
    "padsplit:financials": processFinancials,
    "padsplit:interactive_login": processInteractiveLogin,
  })

  log.info("scheduler running — Ctrl+C to stop")
  await new Promise(() => {})  // run forever
}
```

- [ ] **Step 4: Wire CLI**

Edit `packages/worker/src/cli.ts` — replace the `case "scheduler":` block:
```typescript
    case "scheduler": {
      const { startScheduler } = await import("./scheduler")
      await startScheduler()
      return
    }
```

- [ ] **Step 5: Smoke-test the scheduler (10 minutes max)**

Make sure local Redis is running. If you don't have one:
```bash
brew install redis
brew services start redis
```

Set `REDIS_URL=redis://localhost:6379` in `roomos/packages/worker/.env`.

Then:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm worker:dev scheduler
```

Expected logs: `redis connected`, `starting bullmq scheduler`, `scheduler running`. Then within ~30s it'll auto-enqueue and run an occupancy job. Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "BullMQ scheduler with cron-style repeat triggers for the three jobs"
```

---

## Task 10: Web-side endpoints — heartbeat + screenshots, plus shared worker auth

**Files:**
- Create: `roomos/apps/web/src/lib/worker-auth.ts`
- Create: `roomos/apps/web/src/app/api/heartbeat/route.ts`
- Create: `roomos/apps/web/src/app/api/screenshots/route.ts`
- Create: `roomos/apps/web/src/lib/sync-status.ts`
- Modify: `roomos/apps/web/src/lib/env.ts` (add `WORKER_API_KEY`)
- Modify: `roomos/packages/db/prisma/schema.prisma` (add `WorkerHeartbeat` model)
- Migration: `roomos/packages/db/prisma/migrations/<timestamp>_worker_heartbeat/`

- [ ] **Step 1: Add the schema model + migration**

Append to `roomos/packages/db/prisma/schema.prisma` (just before the `enum SyncRunStatus` enum, after the `model AuditLog` definition):
```prisma
model WorkerHeartbeat {
  id         String   @id @default(cuid())
  orgId      String   @map("org_id")
  workerId   String   @unique @map("worker_id")
  lastSeenAt DateTime @default(now()) @map("last_seen_at")
  meta       Json?

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@map("worker_heartbeats")
}
```

Add the relation back-reference on `Org`. In the existing `Org` model, add:
```prisma
  workerHeartbeats WorkerHeartbeat[]
```

Run the migration:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/db exec prisma migrate dev --name worker_heartbeat
```

- [ ] **Step 2: Add WORKER_API_KEY to env**

Edit `roomos/apps/web/src/lib/env.ts`:
```typescript
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1).optional(),
  WORKER_API_KEY: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})
```

Edit `roomos/apps/web/.env.local` and `roomos/.env.example` to add the new var (`.env.local` gets the real value, `.env.example` gets `""`).

- [ ] **Step 3: Worker-auth helper**

Create `roomos/apps/web/src/lib/worker-auth.ts`:
```typescript
import { env } from "./env"

/** Verify a request bears the shared WORKER_API_KEY (Bearer token). Throws on failure. */
export function requireWorkerAuth(req: Request): { workerId: string } {
  const auth = req.headers.get("authorization") ?? ""
  const match = auth.match(/^Bearer\s+(.+)$/)
  if (!match || match[1] !== env.WORKER_API_KEY) {
    throw new Error("unauthorized: invalid worker key")
  }
  const workerId = req.headers.get("x-worker-id") ?? "unknown"
  return { workerId }
}
```

- [ ] **Step 4: Heartbeat endpoint**

Create `roomos/apps/web/src/app/api/heartbeat/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { prisma } from "@roomos/db"
import { requireWorkerAuth } from "@/lib/worker-auth"

export async function POST(req: Request) {
  let workerId: string
  try {
    const ctx = requireWorkerAuth(req)
    workerId = ctx.workerId
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const org = await prisma.org.findFirst({ where: { name: "CoHost Management" } })
  if (!org) return NextResponse.json({ error: "org not seeded" }, { status: 500 })

  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: { orgId: org.id, workerId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Screenshots endpoint**

Create `roomos/apps/web/src/app/api/screenshots/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { requireWorkerAuth } from "@/lib/worker-auth"

const UPLOAD_DIR = process.env.SCREENSHOT_UPLOAD_DIR ?? "/tmp/roomos-screenshots"

export async function POST(req: Request) {
  try {
    requireWorkerAuth(req)
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "missing file" }, { status: 400 })
  const name = (form.get("name") as string | null) ?? "screenshot.png"

  await mkdir(UPLOAD_DIR, { recursive: true })
  const sanitized = name.replace(/[^a-z0-9_.-]/gi, "_")
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const path = resolve(UPLOAD_DIR, `${ts}_${sanitized}`)
  await writeFile(path, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ ok: true, path })
}
```

(Note: in production on Railway, `SCREENSHOT_UPLOAD_DIR` should point at a persistent volume. For Phase 1B's MVP we use /tmp; viewing screenshots in the dashboard inline is a Phase 1C/1D feature.)

- [ ] **Step 6: Sync-status helper**

Create `roomos/apps/web/src/lib/sync-status.ts`:
```typescript
import { prisma } from "@roomos/db"

export type PillState = "green" | "amber" | "red" | "unknown"

export async function getSyncStatus(orgId: string): Promise<{
  state: PillState
  lastSuccessAt: Date | null
  lastHeartbeatAt: Date | null
  message: string
}> {
  const [latestSuccess, heartbeat] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { orgId, status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.workerHeartbeat.findFirst({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    }),
  ])

  const now = Date.now()
  const lastSuccessAt = latestSuccess?.completedAt ?? null
  const lastHeartbeatAt = heartbeat?.lastSeenAt ?? null

  // Worker offline if no heartbeat in 5 min
  if (!lastHeartbeatAt || now - lastHeartbeatAt.getTime() > 5 * 60_000) {
    return {
      state: "red",
      lastSuccessAt,
      lastHeartbeatAt,
      message: lastHeartbeatAt
        ? `Scraper offline since ${lastHeartbeatAt.toISOString()}`
        : "Scraper has never connected",
    }
  }

  if (!lastSuccessAt) return { state: "unknown", lastSuccessAt, lastHeartbeatAt, message: "No syncs yet" }

  const ageMin = (now - lastSuccessAt.getTime()) / 60_000
  if (ageMin < 60) return { state: "green", lastSuccessAt, lastHeartbeatAt, message: `Synced ${Math.round(ageMin)} min ago` }
  if (ageMin < 240) return { state: "amber", lastSuccessAt, lastHeartbeatAt, message: `Synced ${Math.round(ageMin / 60)}h ago` }
  return { state: "red", lastSuccessAt, lastHeartbeatAt, message: "Sync stale (>4h)" }
}
```

- [ ] **Step 7: Worker → web client**

Create `roomos/packages/worker/src/http.ts`:
```typescript
import { env } from "./env"
import { log } from "./log"

const headers = () => ({
  authorization: `Bearer ${env.WORKER_API_KEY}`,
  "x-worker-id": env.WORKER_ID,
})

export async function postHeartbeat(): Promise<void> {
  try {
    const res = await fetch(`${env.WEB_BASE_URL}/api/heartbeat`, {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!res.ok) log.warn({ status: res.status }, "heartbeat non-200")
  } catch (err) {
    log.warn({ err: (err as Error).message }, "heartbeat failed")
  }
}

export async function uploadScreenshot(filePath: string): Promise<void> {
  try {
    const { readFile } = await import("node:fs/promises")
    const { basename } = await import("node:path")
    const buf = await readFile(filePath)
    const form = new FormData()
    form.append("file", new Blob([buf]), basename(filePath))
    form.append("name", basename(filePath))
    await fetch(`${env.WEB_BASE_URL}/api/screenshots`, {
      method: "POST",
      headers: headers(),
      body: form,
    })
  } catch (err) {
    log.warn({ err: (err as Error).message, filePath }, "screenshot upload failed")
  }
}
```

- [ ] **Step 8: Add heartbeat to scheduler**

Modify `packages/worker/src/scheduler.ts` — add a heartbeat interval after `startWorker`:
```typescript
import { postHeartbeat } from "./http"

// ... after startWorker(...)

// Pulse every 60s; web pill goes red if silent for 5+ min
setInterval(() => { void postHeartbeat() }, 60_000)
void postHeartbeat()  // fire one immediately
```

- [ ] **Step 9: Smoke test**

Run the web app:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm dev
```

In another terminal, run the scheduler:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm worker:dev scheduler
```

Verify the heartbeat row appears:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d roomos_dev -c "SELECT * FROM worker_heartbeats;"
```

Expected: one row with `worker_id = "mac-studio-dev"` and a recent `last_seen_at`.

- [ ] **Step 10: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "web-side heartbeat + screenshots endpoints; worker pulses every 60s"
```

---

## Task 11: Sync status pill in the Topbar

**Files:**
- Create: `roomos/apps/web/src/components/nav/SyncPill.tsx`
- Modify: `roomos/apps/web/src/components/nav/Topbar.tsx` (insert SyncPill)
- Modify: `roomos/apps/web/src/app/(signed-in)/layout.tsx` (pass orgId to Topbar)

- [ ] **Step 1: Build the SyncPill component**

Create `roomos/apps/web/src/components/nav/SyncPill.tsx`:
```typescript
import { getSyncStatus, type PillState } from "@/lib/sync-status"

const COLORS: Record<PillState, { bg: string; fg: string; dot: string }> = {
  green: { bg: "rgba(90,122,74,0.10)", fg: "#5A7A4A", dot: "#5A7A4A" },
  amber: { bg: "rgba(212,168,67,0.12)", fg: "#B8932A", dot: "#D4A843" },
  red:   { bg: "rgba(196,93,46,0.10)",  fg: "#C45D2E", dot: "#C45D2E" },
  unknown: { bg: "rgba(107,100,90,0.10)", fg: "#6B645A", dot: "#6B645A" },
}

export async function SyncPill({ orgId }: { orgId: string }) {
  const s = await getSyncStatus(orgId)
  const c = COLORS[s.state]

  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em]"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.fg}40` }}
      title={s.message}
    >
      <span className="block w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {s.message}
    </span>
  )
}
```

- [ ] **Step 2: Insert it into the Topbar**

Edit `roomos/apps/web/src/components/nav/Topbar.tsx`. Change the `Topbar` signature to accept `orgId` and render the pill before the `<UserButton>`:
```typescript
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { BrandStack } from "./BrandStack"
import { SyncPill } from "./SyncPill"

const NAV = [
  { href: "/rooms", label: "Rooms" },
  { href: "/all-rooms", label: "All Rooms" },
  { href: "/owners", label: "Owners" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
] as const

export function Topbar({ activeHref, orgId }: { activeHref: string; orgId: string }) {
  return (
    <header className="border-b border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <div className="flex items-center justify-between px-7 py-4">
        <BrandStack />
        <nav className="flex gap-7">
          {NAV.map((item) => {
            const active = activeHref === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-[10px] font-semibold uppercase tracking-[0.18em] py-1.5 ${
                  active ? "text-[color:var(--color-charcoal)]" : "text-[color:var(--color-muted)] hover:text-[color:var(--color-charcoal)]"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute -bottom-[17px] left-0 right-0 h-[2px] bg-[color:var(--color-gold)]" />
                )}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-4">
          <SyncPill orgId={orgId} />
          <UserButton appearance={{ variables: { colorPrimary: "#D4A843" } }} />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 3: Pass orgId from the signed-in layout**

Edit `roomos/apps/web/src/app/(signed-in)/layout.tsx`. Add resolveContext + pass orgId:
```typescript
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Topbar } from "@/components/nav/Topbar"
import { resolveContext } from "@/lib/auth"

export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveContext()
  if (!ctx) redirect("/sign-in")

  const hdrs = await headers()
  const path = hdrs.get("x-pathname") ?? "/rooms"

  return (
    <div className="min-h-screen bg-[color:var(--color-cream)]">
      <Topbar activeHref={normalize(path)} orgId={ctx.orgId} />
      <div>{children}</div>
    </div>
  )
}

function normalize(p: string): string {
  try { if (p.startsWith("http")) return new URL(p).pathname } catch {}
  return p
}
```

- [ ] **Step 4: Visual smoke test**

Start web + scheduler:
```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm dev   # terminal 1
pnpm worker:dev scheduler  # terminal 2
```

Sign in to localhost:3000. The Topbar should show a green pill ("Synced X min ago"). Stop the worker. Within 5 min, the pill goes red.

- [ ] **Step 5: Verify typecheck + tests**

```bash
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expect: zero TS errors, 12/12 tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "Topbar SyncPill — green/amber/red based on sync_runs + heartbeat"
```

---

## Task 12: launchd plist + install scripts + DEPLOYMENT-1B.md

**Files:**
- Create: `roomos/packages/worker/launchd/com.cohostmgmt.roomos.worker.plist.template`
- Create: `roomos/packages/worker/launchd/install.sh`
- Create: `roomos/packages/worker/launchd/uninstall.sh`
- Create: `roomos/packages/worker/DEPLOYMENT-1B.md`

- [ ] **Step 1: Write the plist template**

Create `packages/worker/launchd/com.cohostmgmt.roomos.worker.plist.template`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cohostmgmt.roomos.worker</string>

  <key>ProgramArguments</key>
  <array>
    <string>__PNPM_BIN__</string>
    <string>--filter</string>
    <string>@roomos/worker</string>
    <string>start</string>
    <string>--</string>
    <string>scheduler</string>
  </array>

  <key>WorkingDirectory</key>
  <string>__REPO_ROOT__/roomos</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>__HOME__/Library/Logs/RoomOS/worker.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>__HOME__/Library/Logs/RoomOS/worker.stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Write the install script**

Create `packages/worker/launchd/install.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Resolve absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"  # …/roomos-phase-1a
HOME_DIR="$HOME"
PNPM_BIN="$(command -v pnpm)"

if [ -z "$PNPM_BIN" ]; then
  echo "ERROR: pnpm not found in PATH. Install with: npm i -g pnpm" >&2
  exit 1
fi

PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist"
TEMPLATE="$SCRIPT_DIR/com.cohostmgmt.roomos.worker.plist.template"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/RoomOS"

# Substitute placeholders
sed \
  -e "s|__PNPM_BIN__|$PNPM_BIN|g" \
  -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  -e "s|__HOME__|$HOME_DIR|g" \
  "$TEMPLATE" > "$PLIST_DEST"

# (Re)load
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load -w "$PLIST_DEST"

echo "Installed and started com.cohostmgmt.roomos.worker"
echo "  plist:  $PLIST_DEST"
echo "  logs:   $HOME/Library/Logs/RoomOS/"
echo "  stop:   launchctl unload $PLIST_DEST"
echo "  status: launchctl list | grep cohostmgmt"
```

Make it executable:
```bash
chmod +x roomos/packages/worker/launchd/install.sh
```

- [ ] **Step 3: Write the uninstall script**

Create `packages/worker/launchd/uninstall.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist"

if [ -f "$PLIST_DEST" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm "$PLIST_DEST"
  echo "Uninstalled com.cohostmgmt.roomos.worker"
else
  echo "No plist found at $PLIST_DEST"
fi
```

```bash
chmod +x roomos/packages/worker/launchd/uninstall.sh
```

- [ ] **Step 4: Add a `start` script the plist relies on**

Edit `packages/worker/package.json` — add to `scripts`:
```json
"start": "tsx src/cli.ts"
```

(So `pnpm --filter @roomos/worker start scheduler` runs the CLI without a build step. Future cleanup: actually build to dist and run from there.)

- [ ] **Step 5: Write the deployment guide**

Create `packages/worker/DEPLOYMENT-1B.md`:
```markdown
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
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "launchd agent install/uninstall scripts and DEPLOYMENT-1B.md"
```

---

## Self-review checklist

1. **Spec coverage** (master spec sections 5, 8, 9):
   - § 5 scraper jobs (discovery, occupancy, financials) — ✅ Tasks 6, 7, 8.
   - § 5 BullMQ + cadence — ✅ Task 9.
   - § 5 cookie jar + macOS Keychain — ✅ Task 2.
   - § 5 selector reuse from Channel-Manager — ✅ Tasks 4, 5.
   - § 5 retries / screenshot-on-error — ✅ Task 3 + jobs handle inline.
   - § 5 sync status pill (green/amber/red) — ✅ Tasks 10, 11.
   - § 8 bootstrap interactive login — ✅ Task 5.
   - § 9 logging (Pino, daily rotation) — ✅ Task 1.
   - § 9 launchd agent — ✅ Task 12.

2. **Placeholder scan**: every step has either explicit code, exact commands, or "this is a manual step that requires X." No "TBD" or "implement later".

3. **Type/name consistency**:
   - `runDiscovery`, `runOccupancy`, `runFinancials` — consistent across `padsplit/*.ts`, jobs/*.ts, and CLI.
   - `getOrg`, `startSyncRun`, `finishSyncRun`, `upsertDiscovery`, `upsertOccupancy`, `upsertMember`, `updateOccupancyFinancials`, `recordPaymentEvent` — consistent in `persist.ts`.
   - `withPlaywrightSession` — defined in Task 3, used in Tasks 5/6/7/8.
   - `parseListingPage`, `parseMemberProfile` — defined in Task 4 + 8, used in Tasks 7 + 8.
   - `WorkerHeartbeat` model — added in Task 10, queried in `sync-status.ts` (Task 10) and rendered by `SyncPill` (Task 11).
   - `WORKER_API_KEY` — added to web env in Task 10, sent by worker `http.ts` (Task 10).

4. **External dependencies the implementer needs**:
   - Live PadSplit account access (cookies via `pnpm worker:dev login`).
   - Local Postgres (already running from Phase 1A).
   - Local Redis (`brew install redis && brew services start redis`).
   - Real Mac Studio with Chrome installed (Playwright installs its own Chromium, so this is just the Mac).

5. **Risk callouts**:
   - **Task 8 selectors** — the `member__balance` etc. data-testids are best-guesses. Capture real HTML during the first interactive session (Task 5 step 3) and update both `selectors.ts` and `padsplit-member-profile.html` if they differ. The test suite will fail until they match — that's the gate.
   - **PadSplit anti-bot** — at our scale (~70 properties + ~250 members) with serial + jittered scraping from a residential Mac, we should remain invisible to PadSplit's bot detection. If accounts start getting flagged, escalate to additional jitter and/or fewer drill-downs.
   - **Cookie jar expiry** — PadSplit sessions can expire (typically weeks, not hours). If `checkPadsplitSession` starts throwing, re-run `pnpm worker:dev login`. Phase 1D will add a "your PadSplit session expired" banner that fires automatically.

---

## Done definition

Phase 1B is complete when:
1. The launchd agent is loaded on the Mac Studio.
2. After ~30 min of running, the database has all properties / rooms / active members from PadSplit.
3. After ~2 hours, every active occupancy row has a `current_balance`, `days_past_due`, and `last_payment_at` value.
4. The Topbar sync pill is green and updates every 60 seconds.
5. Stopping the worker (e.g., `launchctl unload …`) causes the pill to go red within 5 min.
6. `pnpm --filter @roomos/worker test` passes (cookies + parsers).
7. `pnpm --filter @roomos/web test` still passes (12/12).

That's a fully-working scraper writing to a fully-working dashboard backend. Plan 1C will wire the actual home view + all-rooms table on top of this data.
