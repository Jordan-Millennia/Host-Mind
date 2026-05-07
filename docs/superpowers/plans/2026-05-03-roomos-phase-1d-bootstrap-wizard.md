# RoomOS Phase 1D — Bootstrap Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Settings** UI that turns a freshly-deployed RoomOS instance into a working operator dashboard: connect PadSplit (queues an interactive-login job to the worker), trigger an initial discovery scrape, map unmapped properties to owners (CSV import + click-and-assign), manage owners, and onboard the team. After this ships and the worker runs once, Jordan signs in, clicks "Connect PadSplit", logs in on his Mac, and the dashboard fills with data.

**Architecture:** Adds a `/settings` shell with three sub-pages (Integrations, Owners, Team). Mutations go through Server Actions that gate with `requireRole("ADMIN")`. Connect-PadSplit enqueues `padsplit:interactive_login` to the same BullMQ queue the worker already consumes. Discovery is enqueued the same way. Owner CRUD is direct Prisma writes. Team management uses Clerk's organization invitations API where available; falls back to a shareable signup URL when not.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 5, BullMQ (re-using the queue from Phase 1B's worker, but only the producer half — web app pushes jobs), Clerk Organizations, Tailwind v4 (cream/gold brand). Tests: Vitest unit for the CSV-import parser; existing Playwright e2e extended for new auth gates.

---

## Source spec & predecessors

- Master spec: `docs/superpowers/specs/2026-05-02-roomos-phase-1-design.md` — section 8 (bootstrap), section 7 (auth/RBAC).
- Phase 1A (`v0.1.0-phase1a`) — auth, schema, brand, signed-in shell.
- Phase 1B (`v0.1.0-phase1b`) — worker code, BullMQ queue contract (`padsplit:interactive_login`, `padsplit:discovery`).
- Phase 1C (`v0.1.0-phase1c`) — dashboard. The "No data yet" empty state already deep-links to `/settings`.

## What this plan does NOT cover (deferred)

- Email-based team invites — for Phase 1D MVP, admin shares a signup URL manually. Real Clerk email invitations land later.
- Phase 2 platforms (Airbnb / TurboTenant) — Connect buttons for those routes are stubbed (disabled with "Phase 2" hint) but no Server Actions hook them up.
- Sentry / Slack alerts — deferred per master spec section 9.
- Owner portal scoping — schema is ready (`team_users.owner_id`); UI is later.

## Decisions locked

- **`/settings` is admin-only.** Agents trying to navigate to it land on a "You need admin access" empty state. The four sub-pages (`/integrations`, `/owners`, `/team`, plus the index) all gate on `requireRole("ADMIN")`.
- **Connect PadSplit flow:** server action queues a `padsplit:interactive_login` BullMQ job. The Mac Studio worker picks it up and pops a headful Chromium. Web shows a "Look at your Mac — login window is opening" inline state with a 3-minute polling loop watching `platform_listings.session_status` (and worker heartbeat). Polling, not SSE.
- **Worker-presence guard:** if the most recent `worker_heartbeats.last_seen_at` is > 5 min stale, the Connect button is disabled with the message "Start the Mac Studio worker first (see DEPLOYMENT-1B.md)".
- **CSV import:** server-side parsing of an uploaded text/csv file. Format: `address,owner_name,owner_email`. Creates owners if missing (matched by name+email pair) and assigns `properties.ownerId` by exact-match address. Mismatches reported back to the user with line numbers.
- **Team invitations**: a "Invite member" button generates a copy-to-clipboard signup link `<NEXT_PUBLIC_APP_URL>/sign-up?invite=<random-token>`. The token is stored on a new `team_invitations` table with status (PENDING / ACCEPTED / REVOKED) so admins can revoke. When the invited user signs up via that URL and the Clerk webhook fires, the lazy-provision in `auth.ts` matches by email and applies the role from the invitation.

## What changes in the schema

A single new table `team_invitations` plus a back-reference on `Org`. Migration lands in Task 1.

---

## File structure (locked in)

```
roomos/
├── packages/db/
│   └── prisma/
│       ├── schema.prisma                                # MODIFIED: add TeamInvitation
│       └── migrations/<ts>_team_invitations/            # NEW
└── apps/web/src/
    ├── app/(signed-in)/settings/
    │   ├── layout.tsx                                   # MODIFIED: admin gate + tabs nav
    │   ├── page.tsx                                     # MODIFIED: index → redirect to /settings/integrations
    │   ├── integrations/
    │   │   ├── page.tsx                                 # NEW: PadSplit + Airbnb (disabled) + TurboTenant (disabled) cards
    │   │   └── actions.ts                               # NEW: connectPadsplit, runDiscoveryNow
    │   ├── owners/
    │   │   ├── page.tsx                                 # NEW: owners list + unmapped properties + CSV import
    │   │   ├── actions.ts                               # NEW: createOwner, deleteOwner, assignPropertyOwner, importOwnersCsv
    │   │   └── _csv-import.ts                           # NEW: pure parser tested in unit tests
    │   └── team/
    │       ├── page.tsx                                 # NEW: team list + invite button + role promote
    │       └── actions.ts                               # NEW: createInvitation, revokeInvitation, setRole
    ├── components/settings/
    │   ├── SettingsTabs.tsx                             # NEW: tabbed nav for the four sub-pages
    │   ├── ConnectPadsplitCard.tsx                      # NEW: client component with poll loop
    │   ├── PlatformCard.tsx                             # NEW: shared card shell (PadSplit live, others disabled)
    │   ├── OwnersList.tsx                               # NEW
    │   ├── UnmappedProperties.tsx                       # NEW: list + per-row owner select
    │   ├── CsvImportForm.tsx                            # NEW: client form, file upload + report display
    │   ├── TeamList.tsx                                 # NEW
    │   └── InviteForm.tsx                               # NEW: client component with copy-to-clipboard
    ├── lib/
    │   ├── worker-jobs.ts                               # NEW: server-side BullMQ producer (enqueueInteractiveLogin, enqueueDiscovery)
    │   ├── csv-parse.ts                                 # NEW: pure CSV parser for owner imports
    │   └── invite-token.ts                              # NEW: generate + verify invitation tokens
    └── tests/unit/
        ├── csv-parse.test.ts                            # NEW
        └── invite-token.test.ts                         # NEW
```

---

## Task 1: Schema — `team_invitations` table

**Files:**
- Modify: `roomos/packages/db/prisma/schema.prisma`
- Generated: `roomos/packages/db/prisma/migrations/<ts>_team_invitations/migration.sql`

- [ ] **Step 1: Add the model**

In `roomos/packages/db/prisma/schema.prisma`, add a new enum + model. Insert after the `model AuditLog` block (or wherever models end):

```prisma
enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
}

model TeamInvitation {
  id          String           @id @default(cuid())
  orgId       String           @map("org_id")
  token       String           @unique
  email       String
  role        Role             @default(AGENT)
  status      InvitationStatus @default(PENDING)
  invitedById String?          @map("invited_by_id")
  acceptedAt  DateTime?        @map("accepted_at")
  createdAt   DateTime         @default(now()) @map("created_at")
  expiresAt   DateTime         @map("expires_at")

  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId, status])
  @@map("team_invitations")
}
```

Inside the existing `model Org`, add the back-reference (alongside the existing relations like `workerHeartbeats WorkerHeartbeat[]`):

```prisma
  teamInvitations TeamInvitation[]
```

- [ ] **Step 2: Run the migration**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/db exec prisma migrate dev --name team_invitations
```

Expect a new migration directory and `Prisma client generated successfully`.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Zero TS errors, 29/29 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "schema: TeamInvitation model + migration for Phase 1D bootstrap"
```

---

## Task 2: `worker-jobs.ts` + `invite-token.ts` + `csv-parse.ts` — pure modules (TDD where useful)

**Files:**
- Create: `roomos/apps/web/src/lib/worker-jobs.ts`
- Create: `roomos/apps/web/src/lib/invite-token.ts`
- Create: `roomos/apps/web/src/lib/csv-parse.ts`
- Create: `roomos/apps/web/tests/unit/invite-token.test.ts`
- Create: `roomos/apps/web/tests/unit/csv-parse.test.ts`

- [ ] **Step 1: Write failing tests**

Create `roomos/apps/web/tests/unit/invite-token.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { generateInviteToken, isExpired } from "@/lib/invite-token"

describe("generateInviteToken", () => {
  it("returns a 32-byte (64-hex-char) token by default", () => {
    const tok = generateInviteToken()
    expect(tok).toMatch(/^[0-9a-f]{64}$/)
  })
  it("returns a different token each call", () => {
    expect(generateInviteToken()).not.toBe(generateInviteToken())
  })
})

describe("isExpired", () => {
  it("returns false for future dates", () => {
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })
  it("returns true for past dates", () => {
    expect(isExpired(new Date(Date.now() - 60_000))).toBe(true)
  })
})
```

Create `roomos/apps/web/tests/unit/csv-parse.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { parseOwnerCsv } from "@/lib/csv-parse"

describe("parseOwnerCsv", () => {
  it("parses header + rows", () => {
    const csv = `address,owner_name,owner_email
3216 71st Ave N,Patel LLC,billing@patel.example
1842 Park St,Patel LLC,billing@patel.example
4501 Beach Blvd,Rivera Group,ops@rivera.example`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([])
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
      { address: "1842 Park St", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
      { address: "4501 Beach Blvd", ownerName: "Rivera Group", ownerEmail: "ops@rivera.example" },
    ])
  })

  it("flags missing required columns and returns empty rows", () => {
    const csv = `address,owner_name\n3216 71st Ave N,Patel LLC`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([
      { line: 1, message: "Missing required column: owner_email" },
    ])
    expect(out.rows).toEqual([])
  })

  it("flags rows with empty cells with a 1-indexed data line number", () => {
    const csv = `address,owner_name,owner_email
3216 71st Ave N,Patel LLC,billing@patel.example
,Rivera Group,ops@rivera.example`
    const out = parseOwnerCsv(csv)
    expect(out.errors).toEqual([{ line: 3, message: "Empty address" }])
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
    ])
  })

  it("trims whitespace and ignores trailing blank lines", () => {
    const csv = `address,owner_name,owner_email
  3216 71st Ave N , Patel LLC , billing@patel.example

`
    const out = parseOwnerCsv(csv)
    expect(out.rows).toEqual([
      { address: "3216 71st Ave N", ownerName: "Patel LLC", ownerEmail: "billing@patel.example" },
    ])
    expect(out.errors).toEqual([])
  })
})
```

- [ ] **Step 2: Run — confirm fails**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web test
```

Expected: import errors.

- [ ] **Step 3: Implement `invite-token.ts`**

Create `roomos/apps/web/src/lib/invite-token.ts`:
```typescript
import { randomBytes } from "node:crypto"

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex")
}

export function isExpired(d: Date): boolean {
  return d.getTime() < Date.now()
}

/** Default TTL for invitations: 14 days. */
export function defaultExpiry(): Date {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
}
```

- [ ] **Step 4: Implement `csv-parse.ts`**

Create `roomos/apps/web/src/lib/csv-parse.ts`:
```typescript
export type OwnerCsvRow = {
  address: string
  ownerName: string
  ownerEmail: string
}

export type OwnerCsvError = {
  line: number  // 1 = header; 2+ = data rows
  message: string
}

export type OwnerCsvParseResult = {
  rows: OwnerCsvRow[]
  errors: OwnerCsvError[]
}

const REQUIRED_COLUMNS = ["address", "owner_name", "owner_email"] as const

/** Splits a CSV line, respecting quoted fields. RFC 4180-style.
 *  We ship our own to avoid a dep; the inputs come from a tiny user upload. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { cur += c }
    } else {
      if (c === ",") { out.push(cur); cur = "" }
      else if (c === '"') { inQuotes = true }
      else { cur += c }
    }
  }
  out.push(cur)
  return out
}

export function parseOwnerCsv(input: string): OwnerCsvParseResult {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "Empty file" }] }
  }

  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const errors: OwnerCsvError[] = []
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) errors.push({ line: 1, message: `Missing required column: ${col}` })
  }
  if (errors.length > 0) return { rows: [], errors }

  const idx = {
    address: header.indexOf("address"),
    ownerName: header.indexOf("owner_name"),
    ownerEmail: header.indexOf("owner_email"),
  }

  const rows: OwnerCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const csvLine = lines[i]!
    const fields = splitCsvLine(csvLine).map((f) => f.trim())
    const address = fields[idx.address] ?? ""
    const ownerName = fields[idx.ownerName] ?? ""
    const ownerEmail = fields[idx.ownerEmail] ?? ""
    const lineNum = i + 1
    if (!address) { errors.push({ line: lineNum, message: "Empty address" }); continue }
    if (!ownerName) { errors.push({ line: lineNum, message: "Empty owner_name" }); continue }
    if (!ownerEmail) { errors.push({ line: lineNum, message: "Empty owner_email" }); continue }
    rows.push({ address, ownerName, ownerEmail })
  }

  return { rows, errors }
}
```

- [ ] **Step 5: Implement `worker-jobs.ts`**

Create `roomos/apps/web/src/lib/worker-jobs.ts`:
```typescript
import { Queue } from "bullmq"
import IORedis from "ioredis"
import { env } from "./env"

const QUEUE_NAME = "padsplit"

let _connection: IORedis | null = null
let _queue: Queue | null = null

function getQueue(): Queue {
  if (_queue) return _queue
  // REDIS_URL is required in prod; in CI/test the page won't render so
  // queue() should not be called. Throw a clear error if missing.
  const url = process.env.REDIS_URL
  if (!url) throw new Error("REDIS_URL is not set — cannot enqueue worker jobs")
  _connection = new IORedis(url, { maxRetriesPerRequest: null })
  _queue = new Queue(QUEUE_NAME, { connection: _connection })
  return _queue
}

export async function enqueueInteractiveLogin(): Promise<{ jobId: string }> {
  const job = await getQueue().add("padsplit:interactive_login", {})
  return { jobId: String(job.id ?? "") }
}

export async function enqueueDiscovery(): Promise<{ jobId: string }> {
  const job = await getQueue().add("padsplit:discovery", {})
  return { jobId: String(job.id ?? "") }
}

// Note: env import is still pulled in to satisfy the lint that prefers
// explicit env validation. We don't call env directly here because
// REDIS_URL must be optional for unit tests.
void env
```

- [ ] **Step 6: Run — confirm passes**

```bash
pnpm --filter @roomos/web test
```

Expect 29 prior + 6 new = 35 tests pass. (2 invite-token + 4 csv-parse = 6 new.)

- [ ] **Step 7: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "lib: worker-jobs producer + invite-token + csv-parse (TDD'd)"
```

---

## Task 3: Settings layout + tabs + admin gate

**Files:**
- Modify: `roomos/apps/web/src/app/(signed-in)/settings/layout.tsx`
- Modify: `roomos/apps/web/src/app/(signed-in)/settings/page.tsx`
- Create: `roomos/apps/web/src/components/settings/SettingsTabs.tsx`

- [ ] **Step 1: Build SettingsTabs**

Create `roomos/apps/web/src/components/settings/SettingsTabs.tsx`:
```typescript
import Link from "next/link"

const TABS = [
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/owners",       label: "Owners" },
  { href: "/settings/team",         label: "Team" },
] as const

export function SettingsTabs({ activeHref }: { activeHref: string }) {
  return (
    <nav className="flex gap-7 border-b border-[color:var(--color-rule)] mb-7">
      {TABS.map((t) => {
        const active = activeHref.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative py-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              active ? "text-[color:var(--color-charcoal)]" : "text-[color:var(--color-muted)] hover:text-[color:var(--color-charcoal)]"
            }`}
          >
            {t.label}
            {active && <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[color:var(--color-gold)]" />}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Replace settings layout with admin gate**

Replace the body of `roomos/apps/web/src/app/(signed-in)/settings/layout.tsx` (or create if it doesn't exist):
```typescript
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { resolveContext } from "@/lib/auth"
import { SettingsTabs } from "@/components/settings/SettingsTabs"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveContext()
  if (!ctx) redirect("/sign-in")

  if (ctx.role !== "ADMIN") {
    return (
      <main className="px-7 py-16 max-w-2xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--color-gold)] font-semibold">
          Restricted
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold mt-4">
          Settings <span className="italic text-[color:var(--color-muted)]">— admin only.</span>
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-3">
          Ask an admin on your team to grant you the ADMIN role to access this page.
        </p>
      </main>
    )
  }

  const hdrs = await headers()
  const path = hdrs.get("x-pathname") ?? "/settings"

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="pb-2 mb-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Settings <span className="italic text-[color:var(--color-muted)]">— configure RoomOS</span>
        </h1>
      </div>
      <SettingsTabs activeHref={path} />
      {children}
    </main>
  )
}
```

- [ ] **Step 3: Settings index redirects to integrations**

Replace `roomos/apps/web/src/app/(signed-in)/settings/page.tsx`:
```typescript
import { redirect } from "next/navigation"

export default function SettingsIndex() {
  redirect("/settings/integrations")
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Zero TS errors, 35/35 tests pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/
git commit -m "Settings shell: admin-gated layout + tabs + index redirect"
```

---

## Task 4: Integrations page (Connect PadSplit + status polling)

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/settings/integrations/page.tsx`
- Create: `roomos/apps/web/src/app/(signed-in)/settings/integrations/actions.ts`
- Create: `roomos/apps/web/src/components/settings/PlatformCard.tsx`
- Create: `roomos/apps/web/src/components/settings/ConnectPadsplitCard.tsx`

- [ ] **Step 1: Server Actions**

Create `roomos/apps/web/src/app/(signed-in)/settings/integrations/actions.ts`:
```typescript
"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { enqueueInteractiveLogin, enqueueDiscovery } from "@/lib/worker-jobs"
import { prisma } from "@roomos/db"

export async function connectPadsplit(): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await requireRole("ADMIN")
  } catch {
    return { ok: false, error: "forbidden" }
  }

  // Check the worker is alive (heartbeat within 5 min)
  const recent = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  })
  const alive = recent && Date.now() - recent.lastSeenAt.getTime() < 5 * 60_000
  if (!alive) {
    return { ok: false, error: "Worker offline. Start the Mac Studio worker first (see DEPLOYMENT-1B.md)." }
  }

  try {
    const { jobId } = await enqueueInteractiveLogin()
    revalidatePath("/settings/integrations")
    return { ok: true, jobId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function runDiscoveryNow(): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await requireRole("ADMIN")
  } catch {
    return { ok: false, error: "forbidden" }
  }
  try {
    const { jobId } = await enqueueDiscovery()
    revalidatePath("/rooms")
    return { ok: true, jobId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
```

- [ ] **Step 2: PlatformCard shell**

Create `roomos/apps/web/src/components/settings/PlatformCard.tsx`:
```typescript
import type { ReactNode } from "react"

export function PlatformCard({
  name,
  status,
  description,
  disabled = false,
  children,
}: {
  name: string
  status: "connected" | "disconnected" | "coming_soon"
  description: string
  disabled?: boolean
  children?: ReactNode
}) {
  const statusColor = status === "connected"
    ? "var(--color-occupied)"
    : status === "coming_soon"
    ? "var(--color-muted)"
    : "var(--color-due)"
  const statusLabel = status === "connected" ? "Connected" : status === "coming_soon" ? "Phase 2+" : "Not connected"

  return (
    <div className={`p-7 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded-md ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">{name}</h3>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-[2px] rounded border"
          style={{ color: statusColor, borderColor: `${statusColor}40`, background: `${statusColor}10` }}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-sm text-[color:var(--color-muted)] mb-4">{description}</p>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: ConnectPadsplitCard (client)**

Create `roomos/apps/web/src/components/settings/ConnectPadsplitCard.tsx`:
```typescript
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { connectPadsplit, runDiscoveryNow } from "@/app/(signed-in)/settings/integrations/actions"

type Status = "ACTIVE" | "EXPIRED" | "FAILED" | "NOT_CONFIGURED"

export function ConnectPadsplitCard({
  initialStatus,
  workerOnline,
}: {
  initialStatus: Status
  workerOnline: boolean
}) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()

  async function handleConnect() {
    setMessage(null)
    start(async () => {
      const res = await connectPadsplit()
      if (!res.ok) {
        setMessage(res.error)
        return
      }
      setMessage("Look at your Mac — the PadSplit login window is opening. We'll detect the new session automatically.")
      // Poll the page every 5s for up to 3 minutes
      const start = Date.now()
      const interval = setInterval(() => {
        router.refresh()
        if (Date.now() - start > 3 * 60_000) {
          clearInterval(interval)
        }
      }, 5_000)
    })
  }

  async function handleDiscovery() {
    setMessage(null)
    start(async () => {
      const res = await runDiscoveryNow()
      if (!res.ok) { setMessage(res.error); return }
      setMessage("Discovery scrape queued. The dashboard will populate within a few minutes.")
    })
  }

  const buttonClass =
    "text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md " +
    "bg-[color:var(--color-gold)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-gold-light)] disabled:opacity-50 disabled:cursor-not-allowed"

  if (!workerOnline) {
    return (
      <div className="text-sm text-[color:var(--color-due)] italic">
        Worker offline. Start the Mac Studio worker (see <code>roomos/packages/worker/DEPLOYMENT-1B.md</code>) before connecting PadSplit.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleConnect} disabled={pending} className={buttonClass}>
          {status === "ACTIVE" ? "Reconnect PadSplit" : "Connect PadSplit"}
        </button>
        {status === "ACTIVE" && (
          <button onClick={handleDiscovery} disabled={pending} className={buttonClass}>
            Run discovery now
          </button>
        )}
      </div>
      {message && (
        <p className="text-xs text-[color:var(--color-muted)]">{message}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrations page**

Create `roomos/apps/web/src/app/(signed-in)/settings/integrations/page.tsx`:
```typescript
import { prisma } from "@roomos/db"
import { requireRole } from "@/lib/auth"
import { PlatformCard } from "@/components/settings/PlatformCard"
import { ConnectPadsplitCard } from "@/components/settings/ConnectPadsplitCard"

export default async function IntegrationsPage() {
  const ctx = await requireRole("ADMIN")

  // Most-recent PadSplit listing dictates session status; fallback to NOT_CONFIGURED.
  const recentListing = await prisma.platformListing.findFirst({
    where: { orgId: ctx.orgId, platform: "PADSPLIT" },
    orderBy: { lastSyncedAt: "desc" },
    select: { sessionStatus: true },
  })
  const status = (recentListing?.sessionStatus ?? "NOT_CONFIGURED") as
    "ACTIVE" | "EXPIRED" | "FAILED" | "NOT_CONFIGURED"

  // Worker presence
  const heartbeat = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
  })
  const workerOnline = !!heartbeat && Date.now() - heartbeat.lastSeenAt.getTime() < 5 * 60_000

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PlatformCard
        name="PadSplit"
        status={status === "ACTIVE" ? "connected" : "disconnected"}
        description={
          status === "ACTIVE"
            ? "Worker is logged in and syncing rooms, members, and balances on schedule."
            : "Connect to PadSplit by signing in once on the Mac Studio worker. Cookies persist; subsequent syncs are automatic."
        }
      >
        <ConnectPadsplitCard initialStatus={status} workerOnline={workerOnline} />
      </PlatformCard>

      <PlatformCard
        name="Airbnb"
        status="coming_soon"
        description="Reservations, payouts, and guest messaging across all your Airbnb listings. Lands in Phase 2."
        disabled
      />

      <PlatformCard
        name="TurboTenant"
        status="coming_soon"
        description="Long-term tenant leases, rent collection, and maintenance tickets. Lands in Phase 3."
        disabled
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Zero TS errors, 35/35 tests pass.

- [ ] **Step 6: Commit**

```bash
git add roomos/
git commit -m "Settings → Integrations: Connect PadSplit + status polling + worker-online guard"
```

---

## Task 5: Owners page — list + create + delete + unmapped properties + assign

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/settings/owners/page.tsx`
- Create: `roomos/apps/web/src/app/(signed-in)/settings/owners/actions.ts`
- Create: `roomos/apps/web/src/components/settings/OwnersList.tsx`
- Create: `roomos/apps/web/src/components/settings/UnmappedProperties.tsx`

- [ ] **Step 1: Server Actions**

Create `roomos/apps/web/src/app/(signed-in)/settings/owners/actions.ts`:
```typescript
"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { parseOwnerCsv } from "@/lib/csv-parse"

export async function createOwner(formData: FormData) {
  const ctx = await requireRole("ADMIN")
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim() || null
  if (!name) return { ok: false as const, error: "Name is required" }

  await prisma.owner.create({ data: { orgId: ctx.orgId, name, email } })
  revalidatePath("/settings/owners")
  return { ok: true as const }
}

export async function deleteOwner(formData: FormData) {
  const ctx = await requireRole("ADMIN")
  const id = String(formData.get("id") ?? "")
  if (!id) return { ok: false as const, error: "Missing id" }

  // Require zero properties under this owner before delete
  const props = await prisma.property.count({ where: { orgId: ctx.orgId, ownerId: id } })
  if (props > 0) {
    return { ok: false as const, error: `Cannot delete: ${props} properties still assigned. Reassign first.` }
  }
  await prisma.owner.delete({ where: { id } })
  revalidatePath("/settings/owners")
  return { ok: true as const }
}

export async function assignPropertyOwner(formData: FormData) {
  const ctx = await requireRole("ADMIN")
  const propertyId = String(formData.get("propertyId") ?? "")
  const ownerIdRaw = String(formData.get("ownerId") ?? "")
  const ownerId = ownerIdRaw === "" ? null : ownerIdRaw

  await prisma.property.update({
    where: { id: propertyId, orgId: ctx.orgId } as never,
    data: { ownerId },
  })
  revalidatePath("/settings/owners")
  revalidatePath("/all-rooms")
  return { ok: true as const }
}

export type ImportReport = {
  created: number       // new owners
  reused: number        // existing owners matched by name+email
  assigned: number      // properties whose ownerId got set
  notFoundAddresses: string[]  // addresses with no matching property
  parseErrors: { line: number; message: string }[]
}

export async function importOwnersCsv(formData: FormData): Promise<ImportReport> {
  const ctx = await requireRole("ADMIN")
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { created: 0, reused: 0, assigned: 0, notFoundAddresses: [], parseErrors: [{ line: 0, message: "No file uploaded" }] }
  }
  const text = await file.text()
  const { rows, errors } = parseOwnerCsv(text)

  let created = 0
  let reused = 0
  let assigned = 0
  const notFoundAddresses: string[] = []

  // Cache owners we've created/looked-up in this run.
  const ownerCache = new Map<string, string>()  // key = `${name}|${email}` → ownerId

  for (const r of rows) {
    const key = `${r.ownerName}|${r.ownerEmail}`
    let ownerId = ownerCache.get(key)
    if (!ownerId) {
      const existing = await prisma.owner.findFirst({
        where: { orgId: ctx.orgId, name: r.ownerName, email: r.ownerEmail },
        select: { id: true },
      })
      if (existing) {
        ownerId = existing.id
        reused++
      } else {
        const newOne = await prisma.owner.create({
          data: { orgId: ctx.orgId, name: r.ownerName, email: r.ownerEmail },
          select: { id: true },
        })
        ownerId = newOne.id
        created++
      }
      ownerCache.set(key, ownerId)
    }

    const property = await prisma.property.findFirst({
      where: { orgId: ctx.orgId, address: r.address },
      select: { id: true },
    })
    if (!property) {
      notFoundAddresses.push(r.address)
      continue
    }
    await prisma.property.update({ where: { id: property.id }, data: { ownerId } })
    assigned++
  }

  revalidatePath("/settings/owners")
  revalidatePath("/all-rooms")
  return { created, reused, assigned, notFoundAddresses, parseErrors: errors }
}
```

- [ ] **Step 2: OwnersList**

Create `roomos/apps/web/src/components/settings/OwnersList.tsx`:
```typescript
import { deleteOwner } from "@/app/(signed-in)/settings/owners/actions"

type Owner = { id: string; name: string; email: string | null; _count: { properties: number } }

export function OwnersList({ owners }: { owners: Owner[] }) {
  if (owners.length === 0) {
    return (
      <div className="text-sm italic text-[color:var(--color-muted)] py-4">
        No owners yet. Add one below or upload a CSV.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-right px-4 py-3">Properties</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => (
            <tr key={o.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
              <td className="px-4 py-3 font-medium">{o.name}</td>
              <td className="px-4 py-3 text-[color:var(--color-muted)]">{o.email ?? "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{o._count.properties}</td>
              <td className="px-4 py-3 text-right">
                <form action={deleteOwner}>
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    disabled={o._count.properties > 0}
                    title={o._count.properties > 0 ? "Reassign properties first" : "Delete owner"}
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-due)] hover:text-[color:var(--color-due)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: UnmappedProperties**

Create `roomos/apps/web/src/components/settings/UnmappedProperties.tsx`:
```typescript
import { assignPropertyOwner } from "@/app/(signed-in)/settings/owners/actions"

type Property = { id: string; address: string; city: string | null }
type Owner = { id: string; name: string }

export function UnmappedProperties({ properties, owners }: { properties: Property[]; owners: Owner[] }) {
  if (properties.length === 0) {
    return (
      <div className="text-sm italic text-[color:var(--color-muted)] py-4">
        Every property is mapped to an owner — nice.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Property</th>
            <th className="text-left px-4 py-3">City</th>
            <th className="text-left px-4 py-3">Assign owner</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
              <td className="px-4 py-3 font-medium">{p.address}</td>
              <td className="px-4 py-3 text-[color:var(--color-muted)]">{p.city ?? "—"}</td>
              <td className="px-4 py-3">
                <form action={assignPropertyOwner} className="flex gap-2">
                  <input type="hidden" name="propertyId" value={p.id} />
                  <select
                    name="ownerId"
                    defaultValue=""
                    className="text-sm px-2 py-1 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]"
                  >
                    <option value="">— select —</option>
                    {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button
                    type="submit"
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
                  >
                    Assign
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Owners page**

Create `roomos/apps/web/src/app/(signed-in)/settings/owners/page.tsx`:
```typescript
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { OwnersList } from "@/components/settings/OwnersList"
import { UnmappedProperties } from "@/components/settings/UnmappedProperties"
import { CsvImportForm } from "@/components/settings/CsvImportForm"
import { createOwner } from "./actions"

export default async function OwnersPage() {
  const ctx = await requireRole("ADMIN")
  const [owners, unmapped, allOwners] = await Promise.all([
    prisma.owner.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { properties: true } } },
    }),
    prisma.property.findMany({
      where: { orgId: ctx.orgId, ownerId: null },
      orderBy: { address: "asc" },
      select: { id: true, address: true, city: true },
    }),
    prisma.owner.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Owners ({owners.length})
        </h2>
        <OwnersList owners={owners} />
        <form action={createOwner} className="flex gap-2 mt-3 flex-wrap">
          <input
            name="name"
            placeholder="Owner name"
            required
            className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[180px]"
          />
          <input
            name="email"
            type="email"
            placeholder="Billing email (optional)"
            className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[180px]"
          />
          <button
            type="submit"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-charcoal)] text-[color:var(--color-cream)] hover:bg-[color:var(--color-ink)]"
          >
            Add owner
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Unmapped properties ({unmapped.length})
        </h2>
        <UnmappedProperties properties={unmapped} owners={allOwners} />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Bulk import (CSV)
        </h2>
        <CsvImportForm />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: CsvImportForm (client)**

Create `roomos/apps/web/src/components/settings/CsvImportForm.tsx`:
```typescript
"use client"

import { useState, useTransition } from "react"
import { importOwnersCsv, type ImportReport } from "@/app/(signed-in)/settings/owners/actions"

export function CsvImportForm() {
  const [report, setReport] = useState<ImportReport | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const out = await importOwnersCsv(fd)
      setReport(out)
    })
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md p-5 bg-[color:var(--color-paper)]">
      <p className="text-sm text-[color:var(--color-muted)] mb-3">
        Upload a CSV with columns <code>address,owner_name,owner_email</code>. Owners are created if missing
        and matched by name+email. Properties are matched by exact address.
      </p>
      <form onSubmit={onSubmit} className="flex gap-2 items-center flex-wrap">
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-gold)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-gold-light)] disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>

      {report && (
        <div className="mt-4 text-sm">
          <p>
            Created <strong>{report.created}</strong> owners,
            reused <strong>{report.reused}</strong>,
            assigned <strong>{report.assigned}</strong> properties.
          </p>
          {report.parseErrors.length > 0 && (
            <details className="mt-2 text-[color:var(--color-due)]">
              <summary className="cursor-pointer">{report.parseErrors.length} parse errors</summary>
              <ul className="mt-1 text-xs list-disc pl-5">
                {report.parseErrors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
              </ul>
            </details>
          )}
          {report.notFoundAddresses.length > 0 && (
            <details className="mt-2 text-[color:var(--color-muted)]">
              <summary className="cursor-pointer">{report.notFoundAddresses.length} addresses didn't match a property</summary>
              <ul className="mt-1 text-xs list-disc pl-5">
                {report.notFoundAddresses.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Zero TS errors, 35/35 tests pass.

- [ ] **Step 7: Commit**

```bash
git add roomos/
git commit -m "Settings → Owners: list + add/delete + unmapped panel + CSV import"
```

---

## Task 6: Team page (list + invite + role promote)

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/settings/team/page.tsx`
- Create: `roomos/apps/web/src/app/(signed-in)/settings/team/actions.ts`
- Create: `roomos/apps/web/src/components/settings/TeamList.tsx`
- Create: `roomos/apps/web/src/components/settings/InviteForm.tsx`

- [ ] **Step 1: Server Actions**

Create `roomos/apps/web/src/app/(signed-in)/settings/team/actions.ts`:
```typescript
"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { generateInviteToken, defaultExpiry } from "@/lib/invite-token"

export async function setRole(formData: FormData) {
  const ctx = await requireRole("ADMIN")
  const teamUserId = String(formData.get("teamUserId") ?? "")
  const role = String(formData.get("role") ?? "")
  if (role !== "ADMIN" && role !== "AGENT") {
    return { ok: false as const, error: "Invalid role" }
  }
  await prisma.teamUser.update({
    where: { id: teamUserId, orgId: ctx.orgId } as never,
    data: { role },
  })
  revalidatePath("/settings/team")
  return { ok: true as const }
}

export async function createInvitation(formData: FormData): Promise<
  { ok: true; inviteUrl: string } | { ok: false; error: string }
> {
  const ctx = await requireRole("ADMIN")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "AGENT")
  if (!email) return { ok: false, error: "Email is required" }
  if (role !== "ADMIN" && role !== "AGENT") return { ok: false, error: "Invalid role" }

  const token = generateInviteToken()
  await prisma.teamInvitation.create({
    data: {
      orgId: ctx.orgId,
      token,
      email,
      role,
      invitedById: ctx.teamUserId,
      expiresAt: defaultExpiry(),
    },
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteUrl = `${base}/sign-up?invite=${token}`
  revalidatePath("/settings/team")
  return { ok: true, inviteUrl }
}

export async function revokeInvitation(formData: FormData) {
  await requireRole("ADMIN")
  const id = String(formData.get("id") ?? "")
  await prisma.teamInvitation.update({ where: { id }, data: { status: "REVOKED" } })
  revalidatePath("/settings/team")
  return { ok: true as const }
}
```

- [ ] **Step 2: TeamList**

Create `roomos/apps/web/src/components/settings/TeamList.tsx`:
```typescript
import { setRole } from "@/app/(signed-in)/settings/team/actions"

type TeamUser = { id: string; email: string; role: "ADMIN" | "AGENT" | "OWNER"; clerkUserId: string }

export function TeamList({ users, currentUserId }: { users: TeamUser[]; currentUserId: string }) {
  if (users.length === 0) {
    return <div className="italic text-sm text-[color:var(--color-muted)]">No team users yet.</div>
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.id === currentUserId
            return (
              <tr key={u.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
                <td className="px-4 py-3 font-medium">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                    style={
                      u.role === "ADMIN"
                        ? { color: "var(--color-gold-dark)", borderColor: "var(--color-gold-dark)40", background: "rgba(184,147,42,0.10)" }
                        : { color: "var(--color-muted)", borderColor: "var(--color-rule)", background: "transparent" }
                    }
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {isSelf ? (
                    <span className="text-[11px] italic text-[color:var(--color-muted)]">you</span>
                  ) : (
                    <form action={setRole} className="inline-flex gap-2">
                      <input type="hidden" name="teamUserId" value={u.id} />
                      <select name="role" defaultValue={u.role} className="text-sm px-2 py-1 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
                        <option value="AGENT">AGENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <button type="submit" className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
                        Update
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: InviteForm (client, with copy-to-clipboard)**

Create `roomos/apps/web/src/components/settings/InviteForm.tsx`:
```typescript
"use client"

import { useState, useTransition } from "react"
import { createInvitation, revokeInvitation } from "@/app/(signed-in)/settings/team/actions"

type Pending = { id: string; email: string; role: string; createdAt: Date; inviteUrl?: string }

export function InviteForm({ pending }: { pending: Pending[] }) {
  const [issued, setIssued] = useState<{ email: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    setIssued(null)
    start(async () => {
      const res = await createInvitation(fd)
      if (!res.ok) { setError(res.error); return }
      setIssued({ email: String(fd.get("email") ?? ""), url: res.inviteUrl })
      ;(e.target as HTMLFormElement).reset()
    })
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2 items-center">
        <input
          name="email"
          type="email"
          placeholder="teammate@cohostmgmt.net"
          required
          className="text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] flex-1 min-w-[220px]"
        />
        <select name="role" defaultValue="AGENT" className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
          <option value="AGENT">AGENT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="text-[10px] font-semibold uppercase tracking-[0.14em] px-4 py-[8px] rounded-md bg-[color:var(--color-gold)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-gold-light)] disabled:opacity-50"
        >
          {submitting ? "Generating…" : "Generate invite link"}
        </button>
      </form>

      {error && <p className="text-sm text-[color:var(--color-due)]">{error}</p>}

      {issued && (
        <div className="p-4 rounded-md border border-[color:var(--color-rule-hi)] bg-[color:var(--color-paper-2)]">
          <p className="text-xs text-[color:var(--color-muted)] mb-2">
            Share this link with <strong>{issued.email}</strong>. It expires in 14 days.
          </p>
          <div className="flex gap-2 items-center">
            <code className="text-xs flex-1 px-3 py-2 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded break-all">
              {issued.url}
            </code>
            <button
              onClick={() => copy(issued.url)}
              className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[8px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
            Pending invitations ({pending.length})
          </h3>
          <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
            <table className="w-full text-sm">
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
                    <td className="px-4 py-2">{p.email}</td>
                    <td className="px-4 py-2 text-[color:var(--color-muted)]">{p.role}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={revokeInvitation}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-due)] hover:text-[color:var(--color-due)]">
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Team page**

Create `roomos/apps/web/src/app/(signed-in)/settings/team/page.tsx`:
```typescript
import { requireRole } from "@/lib/auth"
import { prisma } from "@roomos/db"
import { TeamList } from "@/components/settings/TeamList"
import { InviteForm } from "@/components/settings/InviteForm"

export default async function TeamPage() {
  const ctx = await requireRole("ADMIN")

  const [users, pendingInvites] = await Promise.all([
    prisma.teamUser.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true, clerkUserId: true },
    }),
    prisma.teamInvitation.findMany({
      where: { orgId: ctx.orgId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Team ({users.length})
        </h2>
        <TeamList users={users} currentUserId={ctx.teamUserId} />
      </section>

      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
          Invite a team member
        </h2>
        <InviteForm pending={pendingInvites} />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Zero TS errors, 35/35 tests pass.

- [ ] **Step 6: Commit**

```bash
git add roomos/
git commit -m "Settings → Team: list + role promote + invite-link generation + revoke"
```

---

## Task 7: Honor invite token at sign-up — lazy-provision picks up invitation role

**Files:**
- Modify: `roomos/apps/web/src/lib/auth.ts` (extend resolveContext to consult TeamInvitation by email)

- [ ] **Step 1: Update `resolveContext` to honor pending invitations**

Edit `roomos/apps/web/src/lib/auth.ts`. The current lazy-provision creates `team_users` with hardcoded `role: "AGENT"`. Update it to look up the most recent PENDING invitation for that email and apply its role + mark the invitation ACCEPTED.

Replace the block inside the `if (!teamUser) { ... }` lazy-provision branch (after `email` is fetched but before the `prisma.teamUser.upsert`):

```typescript
      let role: "AGENT" | "ADMIN" = "AGENT"
      let invitationId: string | null = null
      if (email) {
        const invitation = await prisma.teamInvitation.findFirst({
          where: {
            orgId: org.id,
            email: email.toLowerCase(),
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        })
        if (invitation) {
          role = invitation.role === "ADMIN" ? "ADMIN" : "AGENT"
          invitationId = invitation.id
        }
      }
      teamUser = await prisma.teamUser.upsert({
        where: { clerkUserId: userId },
        create: { orgId: org.id, clerkUserId: userId, email, role },
        update: {},
      })
      if (invitationId) {
        await prisma.teamInvitation.update({
          where: { id: invitationId },
          data: { status: "ACCEPTED", acceptedAt: new Date() },
        })
      }
```

(This replaces only the creation logic for the lazy-provision branch. The rest of `resolveContext` is unchanged.)

- [ ] **Step 2: Update tests for the new behavior**

Modify `roomos/apps/web/tests/unit/auth.test.ts` — append a new test in the `describe("resolveContext")` block:

```typescript
  it("applies invitation role + marks invitation accepted on lazy-provision", async () => {
    const mockInvitationFindFirst = vi.fn()
    const mockInvitationUpdate = vi.fn()

    // Re-mock @roomos/db to add the new methods this test needs
    vi.mocked(await import("@roomos/db")).prisma.teamInvitation = {
      findFirst: mockInvitationFindFirst,
      update: mockInvitationUpdate,
    } as never

    mockAuth.mockResolvedValue({ userId: "user_invited" })
    mockTeamUserFindUnique.mockResolvedValue(null)
    mockGetUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: "new@cohostmgmt.net" }],
    })
    mockInvitationFindFirst.mockResolvedValue({
      id: "inv_1",
      orgId: "org_x",
      email: "new@cohostmgmt.net",
      role: "ADMIN",
      status: "PENDING",
    })
    mockTeamUserUpsert.mockResolvedValue({
      id: "tu_x", orgId: "org_x", clerkUserId: "user_invited",
      email: "new@cohostmgmt.net", role: "ADMIN", ownerId: null,
    })

    const ctx = await resolveContext()

    expect(mockTeamUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: "ADMIN" }) }),
    )
    expect(mockInvitationUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ status: "ACCEPTED" }),
    })
    expect(ctx?.role).toBe("ADMIN")
  })
```

(If the existing test mocking pattern doesn't allow per-test method patching, instead extend the top-level `vi.mock("@roomos/db", …)` with `teamInvitation: { findFirst, update }` and use the `mock*` vars consistently. Pick whichever pattern matches the file's existing style.)

- [ ] **Step 3: Run**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expect 35 prior + 1 new = 36 tests pass.

- [ ] **Step 4: Commit**

```bash
git add roomos/
git commit -m "Honor TeamInvitation role on lazy-provision; mark invitation ACCEPTED"
```

---

## Task 8: e2e auth-gate coverage for new routes

**Files:**
- Modify: `roomos/apps/web/tests/e2e/dashboard.spec.ts` (add 4 cases)

- [ ] **Step 1: Append**

In `roomos/apps/web/tests/e2e/dashboard.spec.ts`, add four tests at the bottom:

```typescript
test("anonymous /settings redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/integrations redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/integrations")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/owners redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/owners")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /settings/team redirects to /sign-in", async ({ page }) => {
  await page.goto("/settings/team")
  await expect(page).toHaveURL(/\/sign-in/)
})
```

- [ ] **Step 2: Run**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web exec playwright test
```

Expect 7 prior + 4 new = 11 passed.

- [ ] **Step 3: Commit**

```bash
git add roomos/
git commit -m "e2e: anonymous-redirect coverage for the four /settings routes"
```

---

## Self-review

1. **Spec coverage** (master spec section 8 bootstrap):
   - Connect PadSplit → enqueues interactive_login job — ✅ Task 4
   - Initial discovery scrape on demand — ✅ Task 4 (`runDiscoveryNow`)
   - Map owners (CSV import + click-and-assign) — ✅ Task 5
   - Invite team — ✅ Task 6 (signup-URL based per "decisions locked")

2. **Placeholder scan**: every step has full code. No "TBD" / "implement later".

3. **Type/name consistency**:
   - `TeamInvitation` model defined in Task 1, consumed in Tasks 6 (creation/revoke) and 7 (honoring on lazy-provision).
   - `enqueueInteractiveLogin` / `enqueueDiscovery` from `worker-jobs.ts` (Task 2) used in Task 4.
   - `parseOwnerCsv` from `csv-parse.ts` (Task 2) used in `importOwnersCsv` (Task 5).
   - `generateInviteToken` / `defaultExpiry` from `invite-token.ts` (Task 2) used in `createInvitation` (Task 6).
   - `requireRole("ADMIN")` is the consistent auth gate everywhere.

4. **Risks**:
   - Invitation lazy-provision matches by email lowercase. If Clerk returns mixed case, the match still works because we lowercase the invitation email at creation time and lowercase the lookup. Confirmed in Task 6 step 1 (`email.toLowerCase()`) and Task 7 step 1 (`email.toLowerCase()`).
   - `runDiscoveryNow` enqueues without checking the worker is online — that's intentional (BullMQ buffers). The Connect PadSplit gate is what enforces the "worker online" UX; once you're connected, Run Discovery should work whether the worker is mid-restart or not.
   - Polling in `ConnectPadsplitCard` uses `router.refresh()` every 5s for 3 min. This is a deliberate over-pull but it's bounded; SSE is overkill here.

---

## Done definition

Phase 1D is complete when:
1. `/settings` is admin-only and shows three tabs.
2. `/settings/integrations` shows the Connect PadSplit button. Clicking it (with a worker online) queues a login job and shows a polling state.
3. `/settings/owners` lets admins add/delete owners, assign unmapped properties, and import a CSV that creates owners + assigns properties in bulk.
4. `/settings/team` lists team users, lets admins promote/demote roles, and generates copy-to-clipboard invitation URLs that honor the invited role on first sign-up.
5. `pnpm --filter @roomos/web typecheck` zero errors.
6. `pnpm --filter @roomos/web test` ≥ 36 passing.
7. `pnpm --filter @roomos/web exec playwright test` ≥ 11 passing.

That ships Phase 1 in full.
