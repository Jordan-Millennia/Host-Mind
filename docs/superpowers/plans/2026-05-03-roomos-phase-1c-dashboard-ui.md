# RoomOS Phase 1C — Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dashboard UI for the RoomOS app — KPI strip + status-grouped grid (home view "Rooms"), filterable + paginated "All Rooms" table with CSV export, room detail view, and a clickable Sync indicator panel — all wired to the data Phase 1B's scraper writes. After this ships and the worker runs once, Jordan opens `/rooms` and sees ~70 properties / ~300 rooms / 250+ active members organized exactly per spec section 6.

**Architecture:** Server components for data fetching (read straight from Postgres via `@roomos/db`); client components only for filter/pagination interactivity (`useSearchParams` URL-driven so deep-links and refreshes preserve filter state). shadcn/ui primitives for dropdowns, dialogs, tables (lazy-introduced — Phase 1A deliberately deferred). CSV export via Server Action returning a `Response` with `Content-Disposition`. No new database fields; the existing schema covers everything.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript 5, Tailwind v4 with the cream/gold/Playfair tokens already wired in `globals.css`, shadcn/ui (introduce in Task 2), Vitest + React Testing Library for component logic, Playwright for one e2e smoke.

---

## Source spec & predecessors

- Master spec: `docs/superpowers/specs/2026-05-02-roomos-phase-1-design.md` — section 6 covers Dashboard, section 13 brand tokens.
- Phase 1A plan (foundation): `docs/superpowers/plans/2026-05-02-roomos-phase-1a-foundation.md`. Delivered the brand-correct shell, `(signed-in)` layout with Topbar + SyncPill, the "No data yet" empty state on `/rooms`, and placeholder pages for `/all-rooms /owners /activity /settings`.
- Phase 1B plan (scraper): `docs/superpowers/plans/2026-05-03-roomos-phase-1b-padsplit-scraper.md`. Populates the Postgres tables this UI reads.

## What this plan does NOT cover (deferred)

- **Bootstrap UI** (Connect PadSplit / map owners / invite team) — Plan 1D.
- **Automation engine** — Phase 4+.
- **Owner portal scoping** — Phase 2+.
- **Real-time SSE updates of the dashboard** — defer; the spec said SSE is for the inbox, and the dashboard rereads on navigation/refresh, which is plenty for the daily-driver use case.

## Decisions locked (autonomous calls per `feedback_decision_pace.md`)

- **shadcn/ui primitives**: introduce now via `npx shadcn@latest add` for table, dropdown-menu, dialog, select, popover, button, badge, separator, skeleton. Stylistically themed via the existing CSS vars in `globals.css`; no shadcn defaults bleeding through.
- **URL-driven state**: filters, search, sort, page all live in `?status=...&owner=...&q=...&sort=...&page=...`. Deep-linkable; refresh-safe; no client state library.
- **Pagination**: 50 rows/page in the All Rooms table (matches plan 1A's spec). Home view doesn't paginate; it caps each status section at 8 visible cards with "View all →" linking to `/all-rooms?status=<x>`.
- **CSV export**: Server Action triggered by a form button on the All Rooms page. Returns a `Response` with the filtered rows as CSV; the browser saves the file.
- **Activity timeline**: derived from existing tables (sync_runs, payment_events, occupancies). No new audit_log writes in 1C — Phase 1B doesn't write to audit_log either, and inferring from `scrapedAt` deltas is enough for Phase 1C MVP.
- **Past-due definition**: `daysPastDue >= 1` AND `currentBalance > 0`. Same as the spec.
- **"Moving this week" definition**: any occupancy with `status IN (MOVING_IN, MOVING_OUT)` whose `moveInDate` or `leaseEndDate` falls inside `[today, today+7d]`.
- **Color/density from spec section 13**: `--color-due` `#C45D2E` (terracotta), `--color-vacant` `#A33D3D`, `--color-moving` `#3F5E7A`, `--color-flip` `#8B6F5C`, `--color-occupied` `#5A7A4A`. Already in globals.css.

---

## File structure (locked in before tasks)

```
roomos/
└── apps/
    └── web/
        ├── components.json                     # NEW (Task 2 — shadcn config)
        └── src/
            ├── app/
            │   └── (signed-in)/
            │       ├── rooms/page.tsx          # MODIFIED — replace empty state with KPI strip + sections
            │       ├── all-rooms/
            │       │   ├── page.tsx            # MODIFIED — full filterable/paginated table
            │       │   └── actions.ts          # NEW — exportCsv server action
            │       └── rooms/[roomId]/
            │           └── page.tsx            # NEW — room detail view
            ├── components/
            │   ├── dashboard/
            │   │   ├── KpiStrip.tsx            # NEW — Total / Past Due / Vacant / Moving
            │   │   ├── StatusSection.tsx       # NEW — Past Due / Vacant / Moving / Needs Flip section header + grid
            │   │   ├── RoomCard.tsx            # NEW — single card on the home view
            │   │   ├── OccupiedFooter.tsx      # NEW — collapsed "+247 occupied" affordance
            │   │   ├── EmptyState.tsx          # MODIFIED — kept, slightly reworded
            │   │   └── EmptyShim.tsx           # NEW — small "no rooms in this status" placeholder
            │   ├── all-rooms/
            │   │   ├── FilterBar.tsx           # NEW (client) — search + status chips + owner/property selects
            │   │   ├── RoomsTable.tsx          # NEW (server) — rows table; receives query results
            │   │   ├── PaginationLinks.tsx     # NEW (server) — prev/next page links from current searchParams
            │   │   └── ExportButton.tsx        # NEW (client wrapping form) — submits to actions.ts
            │   ├── room-detail/
            │   │   ├── RoomHeader.tsx          # NEW
            │   │   ├── OccupancyCard.tsx       # NEW
            │   │   ├── ActivityTimeline.tsx    # NEW
            │   │   ├── PlatformsSidebar.tsx    # NEW
            │   │   └── SyncMetadataSidebar.tsx # NEW
            │   ├── nav/
            │   │   └── SyncPill.tsx            # MODIFIED — make clickable, links to /activity
            │   └── ui/                         # NEW — shadcn primitives
            │       ├── button.tsx
            │       ├── badge.tsx
            │       ├── table.tsx
            │       ├── select.tsx
            │       ├── dropdown-menu.tsx
            │       ├── popover.tsx
            │       ├── dialog.tsx
            │       └── separator.tsx
            └── lib/
                ├── room-queries.ts             # NEW — typed Prisma queries: getKpiCounts, getRoomsByStatus, getAllRoomsFiltered, getRoomDetail
                ├── filters.ts                  # NEW — parseSearchParams, buildWhereClause helpers
                ├── format.ts                   # NEW — formatMoney, formatDate, formatDaysAgo (tabular-nums-aware)
                └── csv.ts                      # NEW — toCsv(rows, columns)
```

## Conventions (additive)

- Server components are the default; only the FilterBar and ExportButton are client components.
- Tabular numbers (`font-variant-numeric: tabular-nums` is set on `body` already) for every dollar/count cell.
- All Playfair display headings use `font-[family-name:var(--font-display)]`; Inter labels use `font-[family-name:var(--font-body)]` only when overriding (default body is already Inter).
- No hardcoded hex colors in any new file — only CSS vars from `globals.css`.
- Filter chips read by class+aria-pressed; FilterBar dispatches via `router.push(${pathname}?...)`.
- Tests: pure helpers (`filters.ts`, `csv.ts`, `format.ts`) get unit tests. Components are visually verified in Step N of each task by reading the rendered HTML against an expectation.

---

## Task 1: Pure helpers — format, filters, csv (TDD)

**Files:**
- Create: `roomos/apps/web/src/lib/format.ts`
- Create: `roomos/apps/web/src/lib/filters.ts`
- Create: `roomos/apps/web/src/lib/csv.ts`
- Create: `roomos/apps/web/tests/unit/format.test.ts`
- Create: `roomos/apps/web/tests/unit/filters.test.ts`
- Create: `roomos/apps/web/tests/unit/csv.test.ts`

- [ ] **Step 1: Write all three failing tests**

Create `roomos/apps/web/tests/unit/format.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest"
import { formatMoney, formatDate, formatDaysAgo } from "@/lib/format"

describe("formatMoney", () => {
  it("formats decimal-string dollars with thousands separators", () => {
    expect(formatMoney("420.00")).toBe("$420")
    expect(formatMoney("1234.56")).toBe("$1,234.56")
    expect(formatMoney("0.00")).toBe("$0")
  })
  it("returns em-dash for null/undefined", () => {
    expect(formatMoney(null)).toBe("—")
    expect(formatMoney(undefined)).toBe("—")
  })
})

describe("formatDate", () => {
  it("formats Date as 'MMM D, YYYY'", () => {
    expect(formatDate(new Date("2026-04-22T00:00:00Z"))).toBe("Apr 22, 2026")
  })
  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—")
  })
})

describe("formatDaysAgo", () => {
  afterEach(() => vi.useRealTimers())
  it("renders 'today', '1 day ago', '5 days ago'", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"))
    expect(formatDaysAgo(new Date("2026-05-03T08:00:00Z"))).toBe("today")
    expect(formatDaysAgo(new Date("2026-05-02T08:00:00Z"))).toBe("1 day ago")
    expect(formatDaysAgo(new Date("2026-04-28T08:00:00Z"))).toBe("5 days ago")
  })
})
```

Create `roomos/apps/web/tests/unit/filters.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { parseSearchParams, buildWhereClause, type RoomFilter } from "@/lib/filters"

describe("parseSearchParams", () => {
  it("returns defaults when empty", () => {
    expect(parseSearchParams(new URLSearchParams())).toEqual({
      status: "all",
      ownerId: null,
      propertyId: null,
      q: "",
      sort: "address",
      page: 1,
    })
  })
  it("parses every supported key", () => {
    const sp = new URLSearchParams("status=past_due&ownerId=ow_1&propertyId=pr_2&q=marcus&sort=balance&page=3")
    expect(parseSearchParams(sp)).toEqual({
      status: "past_due",
      ownerId: "ow_1",
      propertyId: "pr_2",
      q: "marcus",
      sort: "balance",
      page: 3,
    })
  })
  it("clamps page below 1", () => {
    const sp = new URLSearchParams("page=0")
    expect(parseSearchParams(sp).page).toBe(1)
  })
  it("rejects unknown sort, falls back to address", () => {
    const sp = new URLSearchParams("sort=ssn")
    expect(parseSearchParams(sp).sort).toBe("address")
  })
})

describe("buildWhereClause", () => {
  it("scopes by orgId always", () => {
    const where = buildWhereClause("org_x", { status: "all", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 } as RoomFilter)
    expect(where.orgId).toBe("org_x")
  })
  it("encodes past_due as occupancy with daysPastDue >= 1 and balance > 0", () => {
    const where = buildWhereClause("org_x", { status: "past_due", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 })
    expect(where.listings).toMatchObject({
      some: {
        occupancies: {
          some: { status: { in: ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] }, daysPastDue: { gte: 1 }, currentBalance: { gt: 0 } },
        },
      },
    })
  })
  it("encodes vacant as listings with no active occupancy", () => {
    const where = buildWhereClause("org_x", { status: "vacant", ownerId: null, propertyId: null, q: "", sort: "address", page: 1 })
    expect(where.listings).toMatchObject({
      some: { occupancies: { none: { status: { in: ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] } } } },
    })
  })
  it("free-text q matches address OR property name OR member name (case-insensitive)", () => {
    const where = buildWhereClause("org_x", { status: "all", ownerId: null, propertyId: null, q: "MARCUS", sort: "address", page: 1 })
    expect(where.OR?.[0]?.property?.address?.contains).toBe("MARCUS")
    expect(where.OR?.[0]?.property?.address?.mode).toBe("insensitive")
  })
})
```

Create `roomos/apps/web/tests/unit/csv.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { toCsv } from "@/lib/csv"

describe("toCsv", () => {
  it("emits header + rows with no escaping needed", () => {
    const out = toCsv(
      [{ a: "x", b: 1 }, { a: "y", b: 2 }],
      [{ key: "a", header: "Letter" }, { key: "b", header: "Number" }],
    )
    expect(out).toBe(`Letter,Number\nx,1\ny,2`)
  })

  it("escapes commas, quotes, and newlines per RFC 4180", () => {
    const out = toCsv(
      [{ a: 'has "quote"', b: "1,2,3", c: "line\nbreak" }],
      [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }],
    )
    expect(out).toBe(`A,B,C\n"has ""quote""","1,2,3","line\nbreak"`)
  })

  it("renders null/undefined as empty", () => {
    const out = toCsv([{ a: null, b: undefined, c: "ok" }], [
      { key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" },
    ])
    expect(out).toBe("A,B,C\n,,ok")
  })
})
```

- [ ] **Step 2: Run — confirm all three fail**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web test
```

Expected: import errors / "Cannot find module".

- [ ] **Step 3: Implement format.ts**

Create `roomos/apps/web/src/lib/format.ts`:
```typescript
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const

export function formatMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "—"
  const n = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(n)) return "—"
  const isWhole = n === Math.trunc(n)
  return isWhole
    ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—"
  // Use UTC to avoid TZ surprises with @db.Date columns.
  const m = MONTHS[d.getUTCMonth()]
  return `${m} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function formatDaysAgo(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "—"
  const ms = now.getTime() - d.getTime()
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days <= 0) return "today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}
```

- [ ] **Step 4: Implement filters.ts**

Create `roomos/apps/web/src/lib/filters.ts`:
```typescript
export type StatusFilter =
  | "all" | "past_due" | "vacant" | "moving" | "needs_flip" | "occupied"

export type SortKey = "address" | "balance" | "move_in" | "lease_end" | "member"

export type RoomFilter = {
  status: StatusFilter
  ownerId: string | null
  propertyId: string | null
  q: string
  sort: SortKey
  page: number  // 1-indexed
}

const STATUS_VALUES: StatusFilter[] = ["all", "past_due", "vacant", "moving", "needs_flip", "occupied"]
const SORT_VALUES: SortKey[] = ["address", "balance", "move_in", "lease_end", "member"]

function pickEnum<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  if (!raw) return fallback
  return (allowed as string[]).includes(raw) ? (raw as T) : fallback
}

export function parseSearchParams(sp: URLSearchParams): RoomFilter {
  const pageRaw = parseInt(sp.get("page") ?? "1", 10)
  return {
    status: pickEnum(sp.get("status"), STATUS_VALUES, "all"),
    ownerId: sp.get("ownerId") || null,
    propertyId: sp.get("propertyId") || null,
    q: sp.get("q") ?? "",
    sort: pickEnum(sp.get("sort"), SORT_VALUES, "address"),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
  }
}

const ACTIVE_OCC_STATUSES = ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] as const
const MOVING_OCC_STATUSES = ["MOVING_IN", "MOVING_OUT"] as const

/** Returns a Prisma-shaped `where` for the rooms table. */
export function buildWhereClause(orgId: string, f: RoomFilter): Record<string, unknown> {
  const where: Record<string, unknown> = { orgId }

  if (f.ownerId) where.property = { ownerId: f.ownerId }
  if (f.propertyId) where.propertyId = f.propertyId

  if (f.q) {
    const ic = { contains: f.q, mode: "insensitive" as const }
    where.OR = [
      { property: { address: ic } },
      { property: { name: ic } },
      { listings: { some: { occupancies: { some: { member: { name: ic } } } } } },
    ]
  }

  switch (f.status) {
    case "past_due":
      where.listings = {
        some: {
          occupancies: {
            some: {
              status: { in: ACTIVE_OCC_STATUSES as unknown as string[] },
              daysPastDue: { gte: 1 },
              currentBalance: { gt: 0 },
            },
          },
        },
      }
      break
    case "vacant":
      where.listings = {
        some: { occupancies: { none: { status: { in: ACTIVE_OCC_STATUSES as unknown as string[] } } } },
      }
      break
    case "moving":
      where.listings = {
        some: { occupancies: { some: { status: { in: MOVING_OCC_STATUSES as unknown as string[] } } } },
      }
      break
    case "needs_flip":
      where.listings = {
        some: { occupancies: { some: { status: "NEEDS_FLIP" } } },
      }
      break
    case "occupied":
      where.listings = {
        some: { occupancies: { some: { status: "OCCUPIED" } } },
      }
      break
    case "all":
    default:
      // no extra clause
  }

  return where
}
```

- [ ] **Step 5: Implement csv.ts**

Create `roomos/apps/web/src/lib/csv.ts`:
```typescript
export type CsvColumn<T> = { key: keyof T; header: string }

function escape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], cols: CsvColumn<T>[]): string {
  const header = cols.map((c) => escape(c.header)).join(",")
  const body = rows
    .map((r) => cols.map((c) => escape(r[c.key])).join(","))
    .join("\n")
  return body ? `${header}\n${body}` : header
}
```

- [ ] **Step 6: Run — confirm all pass**

```bash
pnpm --filter @roomos/web test
```

Expected: 12 prior + 3+4+3 = 22 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a
git add roomos/
git commit -m "lib helpers: format (money/date), filters (parse+where), csv"
```

---

## Task 2: shadcn/ui primitives

**Files:**
- Create: `roomos/apps/web/components.json`
- Create: 8 primitives at `roomos/apps/web/src/components/ui/`

- [ ] **Step 1: Initialize shadcn**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos/apps/web
pnpm dlx shadcn@latest init
```

Answer the prompts:
- Style: New York
- Base color: Stone
- CSS variables: yes
- Tailwind CSS file: src/app/globals.css
- Tailwind base color: stone
- Path: src
- Aliases: @/components → src/components, @/lib → src/lib, @/components/ui → src/components/ui

If shadcn rewrites `globals.css` and overwrites the brand tokens, **revert globals.css to its pre-shadcn state and re-apply the @theme block** from Phase 1A. Confirm the brand tokens are still present after init.

- [ ] **Step 2: Add the eight primitives**

```bash
pnpm dlx shadcn@latest add button badge table select dropdown-menu popover dialog separator
```

This creates files under `src/components/ui/`. Verify they exist:
```bash
ls src/components/ui/
```

- [ ] **Step 3: Theme override — make shadcn defer to brand tokens**

Edit `roomos/apps/web/src/components/ui/button.tsx` — change the variant defaults so the primary button uses the gold token. Find the `buttonVariants` definition and replace the `default` variant style:

```typescript
default: "bg-[color:var(--color-gold)] text-[color:var(--color-ink)] shadow-xs hover:bg-[color:var(--color-gold-light)]",
```

For other primitives (badge, table, select, etc.), defer the override work until they're actually used (Tasks 5–9 will tweak as needed).

- [ ] **Step 4: Smoke test**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/
git commit -m "shadcn/ui primitives + gold-themed Button default variant"
```

---

## Task 3: room-queries.ts — typed Prisma reads

**Files:**
- Create: `roomos/apps/web/src/lib/room-queries.ts`

This is the data layer that every page in this plan calls. No React, no UI — pure DB reads with explicit types.

- [ ] **Step 1: Write the queries**

Create `roomos/apps/web/src/lib/room-queries.ts`:
```typescript
import { prisma } from "@roomos/db"
import type { RoomFilter } from "./filters"
import { buildWhereClause } from "./filters"

const ACTIVE_OCC_STATUSES = ["OCCUPIED", "MOVING_IN", "MOVING_OUT"] as const

export type RoomCardData = {
  roomId: string
  propertyAddress: string
  propertyCity: string | null
  ownerName: string | null
  roomNumber: string | null
  externalRoomId: string | null
  status: "OCCUPIED" | "MOVING_IN" | "MOVING_OUT" | "VACANT" | "NEEDS_FLIP" | "WAITING_APPROVAL" | "INACTIVE"
  memberName: string | null
  memberMonthsTenure: number | null
  currentBalance: string | null
  daysPastDue: number | null
  moveInDate: Date | null
  leaseEndDate: Date | null
  vacantSinceDays: number | null
  lastSyncedAt: Date | null
}

/** Top-of-page KPI counts. */
export async function getKpiCounts(orgId: string) {
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [totalRooms, pastDue, vacant, movingThisWeek] = await Promise.all([
    prisma.room.count({ where: { orgId } }),
    prisma.occupancy.count({
      where: {
        orgId,
        status: { in: ACTIVE_OCC_STATUSES as unknown as string[] },
        daysPastDue: { gte: 1 },
        currentBalance: { gt: 0 },
      },
    }),
    prisma.room.count({
      where: {
        orgId,
        listings: { some: { occupancies: { none: { status: { in: ACTIVE_OCC_STATUSES as unknown as string[] } } } } },
      },
    }),
    prisma.occupancy.count({
      where: {
        orgId,
        status: { in: ["MOVING_IN", "MOVING_OUT"] },
        OR: [
          { moveInDate: { gte: now, lte: weekFromNow } },
          { leaseEndDate: { gte: now, lte: weekFromNow } },
        ],
      },
    }),
  ])

  const balanceAggregate = await prisma.occupancy.aggregate({
    _sum: { currentBalance: true },
    where: {
      orgId,
      status: { in: ACTIVE_OCC_STATUSES as unknown as string[] },
      daysPastDue: { gte: 1 },
      currentBalance: { gt: 0 },
    },
  })

  return {
    totalRooms,
    pastDue,
    pastDueAmount: balanceAggregate._sum.currentBalance ?? "0",
    vacant,
    movingThisWeek,
  }
}

/** Rooms grouped by status for the home view. Each section caps at `limit`. */
export async function getRoomsByStatus(
  orgId: string,
  status: "past_due" | "vacant" | "moving" | "needs_flip",
  limit = 8,
): Promise<RoomCardData[]> {
  const filter: RoomFilter = { status, ownerId: null, propertyId: null, q: "", sort: "address", page: 1 }
  const where = buildWhereClause(orgId, filter)
  const rooms = await prisma.room.findMany({
    where,
    take: limit,
    orderBy: [{ property: { address: "asc" } }, { roomNumber: "asc" }],
    include: {
      property: { include: { owner: true } },
      listings: {
        where: { platform: "PADSPLIT" },
        include: {
          occupancies: { orderBy: { createdAt: "desc" }, take: 1, include: { member: true } },
        },
      },
    },
  })
  return rooms.map(toRoomCardData)
}

/** Paginated, fully-filterable result for the All Rooms table. */
export async function getAllRoomsFiltered(orgId: string, f: RoomFilter, pageSize = 50) {
  const where = buildWhereClause(orgId, f)
  const orderBy = sortToOrderBy(f.sort)
  const [rows, total] = await Promise.all([
    prisma.room.findMany({
      where,
      orderBy,
      skip: (f.page - 1) * pageSize,
      take: pageSize,
      include: {
        property: { include: { owner: true } },
        listings: {
          where: { platform: "PADSPLIT" },
          include: {
            occupancies: { orderBy: { createdAt: "desc" }, take: 1, include: { member: true } },
          },
        },
      },
    }),
    prisma.room.count({ where }),
  ])
  return {
    rows: rows.map(toRoomCardData),
    total,
    page: f.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

function sortToOrderBy(sort: RoomFilter["sort"]) {
  switch (sort) {
    case "address": return [{ property: { address: "asc" } }, { roomNumber: "asc" }] as const
    case "member": return [{ property: { address: "asc" } }] as const
    case "balance":
    case "move_in":
    case "lease_end":
      // These need post-fetch ordering; for now order by address (UI surfaces a hint).
      return [{ property: { address: "asc" } }] as const
    default: return [{ property: { address: "asc" } }] as const
  }
}

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.max(0, Math.floor(ms / (30 * 24 * 60 * 60 * 1000)))
}

function toRoomCardData(r: any): RoomCardData {
  const listing = r.listings[0]
  const occupancy = listing?.occupancies?.[0]
  const owner = r.property.owner
  const status = occupancy?.status ?? "VACANT"
  const now = new Date()

  return {
    roomId: r.id,
    propertyAddress: r.property.address,
    propertyCity: r.property.city,
    ownerName: owner?.name ?? null,
    roomNumber: r.roomNumber,
    externalRoomId: listing?.externalListingId ?? null,
    status,
    memberName: occupancy?.member?.name ?? null,
    memberMonthsTenure:
      occupancy?.member && occupancy.moveInDate ? monthsBetween(occupancy.moveInDate, now) : null,
    currentBalance: occupancy?.currentBalance ? occupancy.currentBalance.toString() : null,
    daysPastDue: occupancy?.daysPastDue ?? null,
    moveInDate: occupancy?.moveInDate ?? null,
    leaseEndDate: occupancy?.leaseEndDate ?? null,
    vacantSinceDays: !occupancy && listing?.lastSyncedAt
      ? Math.floor((now.getTime() - listing.lastSyncedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    lastSyncedAt: listing?.lastSyncedAt ?? null,
  }
}

/** Single-room view payload. */
export async function getRoomDetail(orgId: string, roomId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, orgId },
    include: {
      property: { include: { owner: true } },
      listings: {
        include: {
          occupancies: { orderBy: { createdAt: "desc" }, take: 5, include: { member: true } },
        },
      },
    },
  })
  if (!room) return null

  const padsplit = room.listings.find((l) => l.platform === "PADSPLIT")
  const memberId = padsplit?.occupancies[0]?.memberId

  const paymentEvents = memberId
    ? await prisma.paymentEvent.findMany({
        where: { orgId, memberId },
        orderBy: { eventDate: "desc" },
        take: 10,
      })
    : []

  const recentSyncs = await prisma.syncRun.findMany({
    where: { orgId, platform: "PADSPLIT" },
    orderBy: { startedAt: "desc" },
    take: 5,
  })

  return { room, paymentEvents, recentSyncs }
}

/** Recent sync_runs (for the activity panel & sync-pill click target). */
export async function getRecentSyncRuns(orgId: string, take = 20) {
  return prisma.syncRun.findMany({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    take,
  })
}

/** Lookup data for the FilterBar dropdowns. */
export async function getFilterOptions(orgId: string) {
  const [owners, properties] = await Promise.all([
    prisma.owner.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.property.findMany({ where: { orgId }, orderBy: { address: "asc" }, select: { id: true, address: true } }),
  ])
  return { owners, properties }
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 3: Commit**

```bash
git add roomos/
git commit -m "room-queries.ts — typed Prisma reads for KPIs, status sections, all rooms, and detail"
```

---

## Task 4: KpiStrip + StatusSection + RoomCard components

**Files:**
- Create: `roomos/apps/web/src/components/dashboard/KpiStrip.tsx`
- Create: `roomos/apps/web/src/components/dashboard/StatusSection.tsx`
- Create: `roomos/apps/web/src/components/dashboard/RoomCard.tsx`
- Create: `roomos/apps/web/src/components/dashboard/EmptyShim.tsx`
- Create: `roomos/apps/web/src/components/dashboard/OccupiedFooter.tsx`

All server components.

- [ ] **Step 1: KpiStrip**

Create `roomos/apps/web/src/components/dashboard/KpiStrip.tsx`:
```typescript
import { formatMoney } from "@/lib/format"

type Props = {
  totalRooms: number
  pastDue: number
  pastDueAmount: string | number
  vacant: number
  movingThisWeek: number
}

export function KpiStrip({ totalRooms, pastDue, pastDueAmount, vacant, movingThisWeek }: Props) {
  const vacancyPct = totalRooms > 0 ? ((vacant / totalRooms) * 100).toFixed(1) : "0.0"

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-10">
      <Tile label="Total Rooms" num={totalRooms.toString()} sub={`across the portfolio`} />
      <Tile
        label="Past Due"
        num={pastDue.toString()}
        sub={`${formatMoney(pastDueAmount)} overdue`}
        accent="due"
      />
      <Tile label="Vacant" num={vacant.toString()} sub={`${vacancyPct}% vacancy`} />
      <Tile label="Moving This Week" num={movingThisWeek.toString()} sub="MOVE-INS + MOVE-OUTS" />
    </div>
  )
}

function Tile({ label, num, sub, accent }: { label: string; num: string; sub: string; accent?: "due" }) {
  const numClass = accent === "due" ? "text-[color:var(--color-due)]" : "text-[color:var(--color-charcoal)]"
  const tileClass =
    accent === "due"
      ? "border-[color:rgba(196,93,46,0.30)] bg-[color:rgba(196,93,46,0.03)]"
      : "border-[color:var(--color-rule)] bg-[color:var(--color-paper)]"

  return (
    <div className={`p-7 rounded-md border ${tileClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)]">
        {label}
      </div>
      <div className={`mt-3 font-[family-name:var(--font-display)] text-4xl font-bold leading-none tracking-tight ${numClass}`}>
        {num}
      </div>
      <div className="mt-2 text-xs text-[color:var(--color-muted)]">{sub}</div>
    </div>
  )
}
```

- [ ] **Step 2: RoomCard**

Create `roomos/apps/web/src/components/dashboard/RoomCard.tsx`:
```typescript
import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { formatMoney, formatDate } from "@/lib/format"

const STRIPE: Record<string, string> = {
  OCCUPIED: "var(--color-occupied)",
  VACANT: "var(--color-vacant)",
  MOVING_IN: "var(--color-moving)",
  MOVING_OUT: "var(--color-moving)",
  NEEDS_FLIP: "var(--color-flip)",
  WAITING_APPROVAL: "var(--color-flip)",
  INACTIVE: "var(--color-muted)",
}

export function RoomCard({ room, variant }: { room: RoomCardData; variant: "past_due" | "vacant" | "moving" | "needs_flip" | "occupied" }) {
  return (
    <Link
      href={`/rooms/${room.roomId}`}
      className="block relative p-5 bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] rounded-md hover:border-[color:var(--color-rule-hi)] transition-colors"
    >
      <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: STRIPE[room.status] ?? "var(--color-muted)" }} />
      <div className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight leading-tight">
        {room.propertyAddress}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
        Room {room.roomNumber ?? "—"} · {room.propertyCity ?? "—"}
      </div>

      {variant === "past_due" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">{room.memberName ?? "—"}</span>
            <Pill kind="due">{room.daysPastDue}d past due</Pill>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-[color:var(--color-muted)]">
              {room.memberMonthsTenure != null ? `Member ${room.memberMonthsTenure}mo` : "—"}
            </span>
            <span className="text-sm font-semibold tabular-nums text-[color:var(--color-due)]">
              {formatMoney(room.currentBalance)}
            </span>
          </div>
        </>
      )}

      {variant === "vacant" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="italic text-[color:var(--color-muted)]">Empty</span>
            <Pill kind="vacant">{room.vacantSinceDays != null ? `${room.vacantSinceDays} days` : "—"}</Pill>
          </div>
          <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
            Last out: {formatDate(room.lastSyncedAt)}
          </div>
        </>
      )}

      {variant === "moving" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">
              {room.status === "MOVING_IN" ? "→ " : "← "}
              {room.memberName ?? "—"}
            </span>
            <Pill kind="moving">{formatDate(room.status === "MOVING_IN" ? room.moveInDate : room.leaseEndDate)}</Pill>
          </div>
          <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
            {room.status === "MOVING_IN" ? "Arriving" : "Departing"}
          </div>
        </>
      )}

      {variant === "needs_flip" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="italic text-[color:var(--color-muted)]">Needs flip</span>
            <Pill kind="flip">Awaiting</Pill>
          </div>
        </>
      )}

      {variant === "occupied" && (
        <>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">{room.memberName ?? "—"}</span>
            <Pill kind="occupied">Occupied</Pill>
          </div>
        </>
      )}
    </Link>
  )
}

function Pill({ kind, children }: { kind: "due" | "vacant" | "moving" | "flip" | "occupied"; children: React.ReactNode }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    due:      { bg: "rgba(196,93,46,0.10)",  fg: "var(--color-due)" },
    vacant:   { bg: "rgba(163,61,61,0.10)",  fg: "var(--color-vacant)" },
    moving:   { bg: "rgba(63,94,122,0.10)",  fg: "var(--color-moving)" },
    flip:     { bg: "rgba(139,111,92,0.10)", fg: "var(--color-flip)" },
    occupied: { bg: "rgba(90,122,74,0.10)",  fg: "var(--color-occupied)" },
  }
  const c = colors[kind]
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-[3px] rounded border"
      style={{ background: c.bg, color: c.fg, borderColor: `${c.fg}40` }}
    >
      {children}
    </span>
  )
}
```

- [ ] **Step 3: EmptyShim + StatusSection + OccupiedFooter**

Create `roomos/apps/web/src/components/dashboard/EmptyShim.tsx`:
```typescript
export function EmptyShim({ label }: { label: string }) {
  return (
    <div className="text-[11px] italic text-[color:var(--color-muted)] py-2">
      No rooms in {label} right now — quiet is good news.
    </div>
  )
}
```

Create `roomos/apps/web/src/components/dashboard/StatusSection.tsx`:
```typescript
import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { RoomCard } from "./RoomCard"
import { EmptyShim } from "./EmptyShim"

const STATUS_LABEL: Record<string, { name: string; color: string; chipKey: string }> = {
  past_due:   { name: "Past Due",          color: "var(--color-due)",      chipKey: "past_due" },
  vacant:     { name: "Vacant",            color: "var(--color-vacant)",   chipKey: "vacant" },
  moving:     { name: "Moving This Week",  color: "var(--color-moving)",   chipKey: "moving" },
  needs_flip: { name: "Needs Flip",        color: "var(--color-flip)",     chipKey: "needs_flip" },
}

export function StatusSection({
  variant,
  rooms,
  totalCount,
}: {
  variant: "past_due" | "vacant" | "moving" | "needs_flip"
  rooms: RoomCardData[]
  totalCount: number
}) {
  const meta = STATUS_LABEL[variant]
  return (
    <section className="mb-9">
      <header className="flex items-baseline gap-4 mb-3">
        <h2
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: meta.color }}
        >
          {meta.name}
        </h2>
        <span className="text-[11px] font-medium text-[color:var(--color-muted)] px-2 py-[2px] rounded-full bg-[color:rgba(26,26,26,0.05)]">
          {totalCount}
        </span>
        <span className="flex-1 h-px bg-[color:var(--color-rule)]" />
        {totalCount > rooms.length && (
          <Link
            href={`/all-rooms?status=${meta.chipKey}`}
            className="text-[11px] font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-gold-dark)]"
          >
            View all →
          </Link>
        )}
      </header>
      {rooms.length === 0 ? (
        <EmptyShim label={meta.name} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rooms.map((r) => (
            <RoomCard key={r.roomId} room={r} variant={variant} />
          ))}
        </div>
      )}
    </section>
  )
}
```

Create `roomos/apps/web/src/components/dashboard/OccupiedFooter.tsx`:
```typescript
import Link from "next/link"

export function OccupiedFooter({ count, total }: { count: number; total: number }) {
  if (count === 0) return null
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0"
  return (
    <div className="mt-12 p-6 bg-[color:var(--color-paper)] rounded-md border border-[color:rgba(90,122,74,0.18)] flex items-baseline justify-between">
      <div className="flex items-baseline gap-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-occupied)]">
          Occupied
        </span>
        <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums">
          {count}
        </span>
        <span className="text-xs text-[color:var(--color-muted)]">
          rooms · <span className="italic text-[color:var(--color-occupied)]">{pct}% portfolio occupancy</span>
        </span>
      </div>
      <Link
        href="/all-rooms?status=occupied"
        className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-muted)] hover:text-[color:var(--color-charcoal)]"
      >
        Expand ↓
      </Link>
    </div>
  )
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/
git commit -m "dashboard components: KpiStrip + StatusSection + RoomCard + OccupiedFooter"
```

---

## Task 5: Wire `/rooms` page to render the home view

**Files:**
- Modify: `roomos/apps/web/src/app/(signed-in)/rooms/page.tsx`

- [ ] **Step 1: Replace the placeholder rooms page**

Replace the body of `roomos/apps/web/src/app/(signed-in)/rooms/page.tsx`:
```typescript
import { requireSignedIn } from "@/lib/auth"
import { getKpiCounts, getRoomsByStatus } from "@/lib/room-queries"
import { prisma } from "@roomos/db"
import { KpiStrip } from "@/components/dashboard/KpiStrip"
import { StatusSection } from "@/components/dashboard/StatusSection"
import { OccupiedFooter } from "@/components/dashboard/OccupiedFooter"
import { NoDataYet } from "@/components/empty/NoDataYet"

export default async function RoomsPage() {
  const ctx = await requireSignedIn()

  const totalRooms = await prisma.room.count({ where: { orgId: ctx.orgId } })
  if (totalRooms === 0) return <NoDataYet />

  const [kpis, pastDue, vacant, moving, needsFlip] = await Promise.all([
    getKpiCounts(ctx.orgId),
    getRoomsByStatus(ctx.orgId, "past_due", 8),
    getRoomsByStatus(ctx.orgId, "vacant", 8),
    getRoomsByStatus(ctx.orgId, "moving", 8),
    getRoomsByStatus(ctx.orgId, "needs_flip", 8),
  ])

  // Counts for the per-section "View all" affordance
  const [pastDueTotal, vacantTotal, movingTotal, needsFlipTotal, occupiedTotal] = await Promise.all([
    kpis.pastDue,
    kpis.vacant,
    kpis.movingThisWeek,
    prisma.occupancy.count({ where: { orgId: ctx.orgId, status: "NEEDS_FLIP" } }),
    prisma.occupancy.count({ where: { orgId: ctx.orgId, status: "OCCUPIED" } }),
  ])

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-rule)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Rooms <span className="italic text-[color:var(--color-muted)]">at a glance</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">
            {kpis.totalRooms} rooms across the portfolio
          </p>
        </div>
      </div>

      <KpiStrip
        totalRooms={kpis.totalRooms}
        pastDue={kpis.pastDue}
        pastDueAmount={kpis.pastDueAmount}
        vacant={kpis.vacant}
        movingThisWeek={kpis.movingThisWeek}
      />

      <StatusSection variant="past_due"   rooms={pastDue}   totalCount={pastDueTotal} />
      <StatusSection variant="vacant"     rooms={vacant}    totalCount={vacantTotal} />
      <StatusSection variant="moving"     rooms={moving}    totalCount={movingTotal} />
      <StatusSection variant="needs_flip" rooms={needsFlip} totalCount={needsFlipTotal} />

      <OccupiedFooter count={occupiedTotal} total={kpis.totalRooms} />
    </main>
  )
}
```

- [ ] **Step 2: Boot the dev server and verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm dev
```

Sign in. Without scraper data: still see the "No rooms yet" empty state. With scraper data (after Jordan runs `pnpm worker:dev run --job padsplit:occupancy`): see the KPI strip + four status sections + occupied footer.

Stop the dev server (Ctrl+C).

- [ ] **Step 3: Verify typecheck + tests**

```bash
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 4: Commit**

```bash
git add roomos/
git commit -m "render the Rooms home view: KPI strip + four status sections + occupied footer"
```

---

## Task 6: All Rooms — FilterBar (client) + URL plumbing

**Files:**
- Create: `roomos/apps/web/src/components/all-rooms/FilterBar.tsx`

- [ ] **Step 1: Build the FilterBar**

Create `roomos/apps/web/src/components/all-rooms/FilterBar.tsx`:
```typescript
"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useTransition } from "react"

const STATUS_CHIPS = [
  { key: "all",        label: "All" },
  { key: "past_due",   label: "Past Due" },
  { key: "vacant",     label: "Vacant" },
  { key: "moving",     label: "Moving" },
  { key: "needs_flip", label: "Needs Flip" },
  { key: "occupied",   label: "Occupied" },
] as const

type Owner = { id: string; name: string }
type Property = { id: string; address: string }

export function FilterBar({ owners, properties }: { owners: Owner[]; properties: Property[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") next.delete(k)
      else next.set(k, v)
    })
    next.delete("page")  // any change resets to page 1
    startTransition(() => router.push(`${pathname}?${next.toString()}`))
  }

  const status = sp.get("status") ?? "all"
  const ownerId = sp.get("ownerId") ?? ""
  const propertyId = sp.get("propertyId") ?? ""
  const q = sp.get("q") ?? ""

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <input
        defaultValue={q}
        onKeyDown={(e) => {
          if (e.key === "Enter") update({ q: (e.target as HTMLInputElement).value || null })
        }}
        placeholder="Search address, member, room…"
        className="flex-1 min-w-[220px] text-sm px-3 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] focus:outline-none focus:border-[color:var(--color-rule-hi)]"
      />

      <div className="flex gap-1 flex-wrap">
        {STATUS_CHIPS.map((c) => {
          const active = status === c.key
          return (
            <button
              key={c.key}
              onClick={() => update({ status: c.key === "all" ? null : c.key })}
              aria-pressed={active}
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border transition-colors ${
                active
                  ? "bg-[color:var(--color-charcoal)] text-[color:var(--color-cream)] border-[color:var(--color-charcoal)]"
                  : "bg-[color:var(--color-paper)] text-[color:var(--color-muted)] border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      <select
        value={ownerId}
        onChange={(e) => update({ ownerId: e.target.value || null })}
        className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]"
      >
        <option value="">All Owners</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>

      <select
        value={propertyId}
        onChange={(e) => update({ propertyId: e.target.value || null })}
        className="text-sm px-2 py-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] max-w-[260px]"
      >
        <option value="">All Properties</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
      </select>

      {pending && <span className="text-[11px] text-[color:var(--color-muted)]">…</span>}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
```

Expected: zero TS errors.

- [ ] **Step 3: Commit**

```bash
git add roomos/
git commit -m "FilterBar (client) — chip + dropdowns + search, URL-driven via router.push"
```

---

## Task 7: All Rooms — RoomsTable + PaginationLinks + page wiring

**Files:**
- Create: `roomos/apps/web/src/components/all-rooms/RoomsTable.tsx`
- Create: `roomos/apps/web/src/components/all-rooms/PaginationLinks.tsx`
- Modify: `roomos/apps/web/src/app/(signed-in)/all-rooms/page.tsx`

- [ ] **Step 1: RoomsTable**

Create `roomos/apps/web/src/components/all-rooms/RoomsTable.tsx`:
```typescript
import Link from "next/link"
import type { RoomCardData } from "@/lib/room-queries"
import { formatMoney, formatDate } from "@/lib/format"

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  OCCUPIED:         { label: "Occupied",          color: "var(--color-occupied)" },
  VACANT:           { label: "Vacant",            color: "var(--color-vacant)" },
  MOVING_IN:        { label: "Moving In",         color: "var(--color-moving)" },
  MOVING_OUT:       { label: "Moving Out",        color: "var(--color-moving)" },
  NEEDS_FLIP:       { label: "Needs Flip",        color: "var(--color-flip)" },
  WAITING_APPROVAL: { label: "Waiting Approval",  color: "var(--color-flip)" },
  INACTIVE:         { label: "Inactive",          color: "var(--color-muted)" },
}

export function RoomsTable({ rows }: { rows: RoomCardData[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm italic text-[color:var(--color-muted)] border border-[color:var(--color-rule)] rounded-md">
        No rooms match the current filters.
      </div>
    )
  }

  return (
    <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
            <th className="text-left px-4 py-3">Property · Room</th>
            <th className="text-left px-4 py-3">Owner</th>
            <th className="text-left px-4 py-3">Member</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Move-in</th>
            <th className="text-left px-4 py-3">Lease end</th>
            <th className="text-right px-4 py-3">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.INACTIVE!
            return (
              <tr
                key={r.roomId}
                className="border-b last:border-b-0 border-[color:var(--color-rule)] hover:bg-[color:var(--color-paper-2)]"
              >
                <td className="px-4 py-3">
                  <Link href={`/rooms/${r.roomId}`} className="font-semibold hover:text-[color:var(--color-gold-dark)]">
                    {r.propertyAddress}
                  </Link>
                  <span className="text-[color:var(--color-muted)]"> · Rm {r.roomNumber ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-[color:var(--color-muted)]">{r.ownerName ?? "—"}</td>
                <td className="px-4 py-3">{r.memberName ?? <span className="italic text-[color:var(--color-muted)]">Vacant</span>}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                    style={{ color: s.color, borderColor: `${s.color}40`, background: `${s.color}10` }}
                  >
                    {s.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">{formatDate(r.moveInDate)}</td>
                <td className="px-4 py-3 text-xs">{formatDate(r.leaseEndDate)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${r.daysPastDue && r.daysPastDue >= 1 ? "text-[color:var(--color-due)] font-semibold" : ""}`}>
                  {formatMoney(r.currentBalance)}
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

- [ ] **Step 2: PaginationLinks**

Create `roomos/apps/web/src/components/all-rooms/PaginationLinks.tsx`:
```typescript
import Link from "next/link"

export function PaginationLinks({
  page,
  totalPages,
  total,
  pageSize,
  searchParams,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  searchParams: Record<string, string | string[] | undefined>
}) {
  const buildHref = (p: number) => {
    const sp = new URLSearchParams()
    Object.entries(searchParams).forEach(([k, v]) => {
      if (typeof v === "string") sp.set(k, v)
    })
    sp.set("page", String(p))
    return `?${sp.toString()}`
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between mt-4 text-xs text-[color:var(--color-muted)]">
      <span>Showing {start}–{end} of {total}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={buildHref(page - 1)} className="px-3 py-1 rounded border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
            ← Previous
          </Link>
        ) : (
          <span className="px-3 py-1 rounded border border-[color:var(--color-rule)] opacity-40">← Previous</span>
        )}
        <span className="px-3 py-1 text-[color:var(--color-charcoal)]">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)} className="px-3 py-1 rounded border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]">
            Next →
          </Link>
        ) : (
          <span className="px-3 py-1 rounded border border-[color:var(--color-rule)] opacity-40">Next →</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire `/all-rooms` page**

Replace `roomos/apps/web/src/app/(signed-in)/all-rooms/page.tsx`:
```typescript
import { requireSignedIn } from "@/lib/auth"
import { parseSearchParams } from "@/lib/filters"
import { getAllRoomsFiltered, getFilterOptions } from "@/lib/room-queries"
import { FilterBar } from "@/components/all-rooms/FilterBar"
import { RoomsTable } from "@/components/all-rooms/RoomsTable"
import { PaginationLinks } from "@/components/all-rooms/PaginationLinks"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function AllRoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireSignedIn()
  const sp = await searchParams
  const usp = new URLSearchParams()
  Object.entries(sp).forEach(([k, v]) => { if (typeof v === "string") usp.set(k, v) })

  const filter = parseSearchParams(usp)
  const [{ rows, total, page, pageSize, totalPages }, options] = await Promise.all([
    getAllRoomsFiltered(ctx.orgId, filter),
    getFilterOptions(ctx.orgId),
  ])

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-rule)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            All Rooms <span className="italic text-[color:var(--color-muted)]">— full portfolio</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">{total} rooms matching current filters</p>
        </div>
      </div>

      <FilterBar owners={options.owners} properties={options.properties} />

      <RoomsTable rows={rows} />

      <PaginationLinks
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        searchParams={sp}
      />
    </main>
  )
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/
git commit -m "All Rooms tab: filterable + paginated table with URL-driven state"
```

---

## Task 8: All Rooms — CSV export Server Action

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/all-rooms/actions.ts`
- Create: `roomos/apps/web/src/components/all-rooms/ExportButton.tsx`
- Modify: `roomos/apps/web/src/app/(signed-in)/all-rooms/page.tsx` (mount the button)

- [ ] **Step 1: Server Action**

Create `roomos/apps/web/src/app/(signed-in)/all-rooms/actions.ts`:
```typescript
"use server"

import { requireSignedIn } from "@/lib/auth"
import { parseSearchParams } from "@/lib/filters"
import { getAllRoomsFiltered } from "@/lib/room-queries"
import { toCsv, type CsvColumn } from "@/lib/csv"

const COLS: CsvColumn<{
  property: string
  room: string
  owner: string
  member: string
  status: string
  moveIn: string
  leaseEnd: string
  balance: string
  daysPastDue: string
}>[] = [
  { key: "property",    header: "Property" },
  { key: "room",        header: "Room" },
  { key: "owner",       header: "Owner" },
  { key: "member",      header: "Member" },
  { key: "status",      header: "Status" },
  { key: "moveIn",      header: "Move-in" },
  { key: "leaseEnd",    header: "Lease end" },
  { key: "balance",     header: "Balance" },
  { key: "daysPastDue", header: "Days past due" },
]

export async function exportCsv(formData: FormData): Promise<{ filename: string; csv: string }> {
  const ctx = await requireSignedIn()
  const usp = new URLSearchParams()
  formData.forEach((v, k) => {
    if (typeof v === "string" && k !== "_") usp.set(k, v)
  })
  const filter = parseSearchParams(usp)

  // Fetch ALL matching rows (cap at 5000 to avoid runaway)
  const { rows } = await getAllRoomsFiltered(ctx.orgId, { ...filter, page: 1 }, 5000)

  const data = rows.map((r) => ({
    property: r.propertyAddress,
    room: r.roomNumber ?? "",
    owner: r.ownerName ?? "",
    member: r.memberName ?? "",
    status: r.status,
    moveIn: r.moveInDate ? r.moveInDate.toISOString().slice(0, 10) : "",
    leaseEnd: r.leaseEndDate ? r.leaseEndDate.toISOString().slice(0, 10) : "",
    balance: r.currentBalance ?? "",
    daysPastDue: r.daysPastDue == null ? "" : String(r.daysPastDue),
  }))

  const csv = toCsv(data, COLS)
  const ts = new Date().toISOString().slice(0, 10)
  const filename = `roomos-rooms-${ts}.csv`
  return { filename, csv }
}
```

- [ ] **Step 2: ExportButton client component**

Create `roomos/apps/web/src/components/all-rooms/ExportButton.tsx`:
```typescript
"use client"

import { useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { exportCsv } from "@/app/(signed-in)/all-rooms/actions"

export function ExportButton() {
  const sp = useSearchParams()
  const [pending, start] = useTransition()

  function download() {
    start(async () => {
      const fd = new FormData()
      sp.forEach((v, k) => fd.append(k, v))
      const { filename, csv } = await exportCsv(fd)
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <button
      onClick={download}
      disabled={pending}
      className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[6px] rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] hover:border-[color:var(--color-rule-hi)] disabled:opacity-50"
    >
      {pending ? "Exporting…" : "Export CSV"}
    </button>
  )
}
```

- [ ] **Step 3: Mount the button on the page**

In `roomos/apps/web/src/app/(signed-in)/all-rooms/page.tsx`, add the import and place `<ExportButton />` in the title row:

After the existing `import { PaginationLinks } …` add:
```typescript
import { ExportButton } from "@/components/all-rooms/ExportButton"
```

In the JSX header block, replace the empty right side of the title row:
```tsx
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            All Rooms <span className="italic text-[color:var(--color-muted)]">— full portfolio</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">{total} rooms matching current filters</p>
        </div>
        <ExportButton />
```

- [ ] **Step 4: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 5: Commit**

```bash
git add roomos/
git commit -m "All Rooms CSV export — Server Action + client trigger respects current filters"
```

---

## Task 9: Room detail view

**Files:**
- Create: `roomos/apps/web/src/app/(signed-in)/rooms/[roomId]/page.tsx`
- Create: `roomos/apps/web/src/components/room-detail/RoomHeader.tsx`
- Create: `roomos/apps/web/src/components/room-detail/OccupancyCard.tsx`
- Create: `roomos/apps/web/src/components/room-detail/ActivityTimeline.tsx`
- Create: `roomos/apps/web/src/components/room-detail/PlatformsSidebar.tsx`
- Create: `roomos/apps/web/src/components/room-detail/SyncMetadataSidebar.tsx`

- [ ] **Step 1: RoomHeader**

Create `roomos/apps/web/src/components/room-detail/RoomHeader.tsx`:
```typescript
import Link from "next/link"

export function RoomHeader({
  address, roomNumber, market, ownerName, externalRoomId,
}: {
  address: string
  roomNumber: string | null
  market: string | null
  ownerName: string | null
  externalRoomId: string | null
}) {
  const padsplitUrl = externalRoomId ? `https://www.padsplit.com/host/listing/${externalRoomId}` : null

  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <p className="text-xs text-[color:var(--color-muted)] mb-2">
          <Link href="/rooms" className="hover:text-[color:var(--color-gold-dark)]">← All rooms</Link>
          {" · "}
          {address}
          {" · "}
          Room {roomNumber ?? "—"}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Room {roomNumber ?? "—"} <span className="italic text-[color:var(--color-muted)]">at</span> {address}
        </h1>
        <div className="mt-2 flex gap-4 text-xs text-[color:var(--color-muted)]">
          <span><strong className="text-[color:var(--color-charcoal)]">Owner:</strong> {ownerName ?? "Unmapped"}</span>
          <span><strong className="text-[color:var(--color-charcoal)]">Market:</strong> {market ?? "—"}</span>
          {externalRoomId && <span className="px-2 py-0 bg-[color:var(--color-paper-2)] rounded text-[10px] font-medium">PadSplit ID {externalRoomId}</span>}
        </div>
      </div>
      <div className="flex gap-2">
        {padsplitUrl && (
          <a
            href={padsplitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-[8px] rounded-md border border-[color:var(--color-rule)] hover:border-[color:var(--color-rule-hi)]"
          >
            Open in PadSplit ↗
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: OccupancyCard**

Create `roomos/apps/web/src/components/room-detail/OccupancyCard.tsx`:
```typescript
import { formatMoney, formatDate } from "@/lib/format"

type Member = { id: string; name: string; firstSeenAt: Date }
type Occupancy = {
  status: string
  daysPastDue: number | null
  currentBalance: unknown
  lastPaymentAmount: unknown
  lastPaymentAt: Date | null
  moveInDate: Date | null
}

export function OccupancyCard({ member, occupancy }: { member: Member | null; occupancy: Occupancy | null }) {
  if (!member || !occupancy) {
    return (
      <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
          Current occupancy
        </h2>
        <p className="italic text-[color:var(--color-muted)]">No active member.</p>
      </div>
    )
  }

  const initials = member.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  const tenureDays = Math.floor((Date.now() - new Date(member.firstSeenAt).getTime()) / (24 * 60 * 60 * 1000))

  return (
    <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Current occupancy
      </h2>
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white"
          style={{ background: "linear-gradient(135deg, var(--color-gold-dark), var(--color-charcoal))" }}
        >
          {initials}
        </div>
        <div>
          <div className="font-bold flex items-center gap-2">
            <span>{member.name}</span>
            {occupancy.daysPastDue && occupancy.daysPastDue >= 1 && (
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.14em] px-2 py-[2px] rounded border"
                style={{ background: "rgba(196,93,46,0.10)", color: "var(--color-due)", borderColor: "rgba(196,93,46,0.40)" }}
              >
                {occupancy.daysPastDue}d past due
              </span>
            )}
          </div>
          <div className="text-xs text-[color:var(--color-muted)] mt-1">
            Member since {formatDate(member.firstSeenAt)} · {tenureDays} days in residence
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        <Stat label="Balance" value={formatMoney(occupancy.currentBalance as string | null)} accent={occupancy.daysPastDue && occupancy.daysPastDue >= 1 ? "due" : undefined} />
        <Stat label="Last paid" value={formatMoney(occupancy.lastPaymentAmount as string | null)} />
        <Stat label="Last payment" value={formatDate(occupancy.lastPaymentAt)} />
        <Stat label="Moved in" value={formatDate(occupancy.moveInDate)} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "due" }) {
  const color = accent === "due" ? "text-[color:var(--color-due)]" : "text-[color:var(--color-charcoal)]"
  return (
    <div className="bg-[color:var(--color-paper-2)] p-3 rounded">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: ActivityTimeline**

Create `roomos/apps/web/src/components/room-detail/ActivityTimeline.tsx`:
```typescript
import { formatDate, formatDaysAgo } from "@/lib/format"

type Item =
  | { kind: "payment"; date: Date; amount: string }
  | { kind: "scrape"; date: Date; status: string; itemsSynced: number }
  | { kind: "moved_in"; date: Date; memberName: string }

export function ActivityTimeline({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-2">
          Activity timeline
        </h2>
        <p className="italic text-[color:var(--color-muted)]">No activity yet.</p>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mt-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Activity timeline
      </h2>
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 pb-3 last:pb-0 border-b last:border-b-0 border-[color:var(--color-rule)]">
            <span className={`block w-2 h-2 rounded-full mt-[6px] ${dotClass(it)}`} />
            <div className="flex-1 text-sm">
              <div className="text-[color:var(--color-charcoal)]">{label(it)}</div>
              <div className="text-[11px] text-[color:var(--color-muted)] mt-1">
                {formatDate(it.date)} · {formatDaysAgo(it.date)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function dotClass(it: Item): string {
  switch (it.kind) {
    case "payment":  return "bg-[color:var(--color-occupied)]"
    case "scrape":   return "bg-[color:var(--color-moving)]"
    case "moved_in": return "bg-[color:var(--color-gold)]"
  }
}

function label(it: Item): string {
  switch (it.kind) {
    case "payment":  return `Payment received: $${it.amount}`
    case "scrape":   return `Synced — ${it.itemsSynced} items, ${it.status.toLowerCase()}`
    case "moved_in": return `${it.memberName} moved in`
  }
}
```

- [ ] **Step 4: PlatformsSidebar + SyncMetadataSidebar**

Create `roomos/apps/web/src/components/room-detail/PlatformsSidebar.tsx`:
```typescript
type Listing = { platform: string; externalListingId: string | null; isActive: boolean; sessionStatus: string }

const ALL_PLATFORMS = ["PADSPLIT", "AIRBNB", "TURBOTENANT"] as const

export function PlatformsSidebar({ listings }: { listings: Listing[] }) {
  return (
    <div className="p-5 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)] mb-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Listings on this room
      </h3>
      {ALL_PLATFORMS.map((p) => {
        const found = listings.find((l) => l.platform === p)
        const active = !!found?.isActive
        return (
          <div
            key={p}
            className={`flex items-center justify-between py-2 border-b last:border-b-0 border-[color:var(--color-rule)] ${active ? "" : "opacity-50"}`}
          >
            <span className="text-sm font-medium">{labelOf(p)}</span>
            <span className="text-[10px] text-[color:var(--color-muted)]">
              {active ? `Active · ID ${found?.externalListingId ?? "—"}` : "Not listed"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function labelOf(p: string) {
  return p === "PADSPLIT" ? "PadSplit" : p === "AIRBNB" ? "Airbnb" : "TurboTenant"
}
```

Create `roomos/apps/web/src/components/room-detail/SyncMetadataSidebar.tsx`:
```typescript
import { formatDaysAgo, formatDate } from "@/lib/format"

export function SyncMetadataSidebar({
  lastSyncedAt,
  lastFinancialSyncAt,
}: {
  lastSyncedAt: Date | null
  lastFinancialSyncAt: Date | null
}) {
  return (
    <div className="p-5 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-paper)]">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-muted)] mb-3">
        Sync metadata
      </h3>
      <Row label="Last occupancy sync" value={lastSyncedAt ? formatDaysAgo(lastSyncedAt) : "—"} />
      <Row label="Last financial sync" value={lastFinancialSyncAt ? formatDaysAgo(lastFinancialSyncAt) : "—"} />
      <Row label="Last full date" value={formatDate(lastSyncedAt)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0 border-[color:var(--color-rule)] text-xs">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
```

- [ ] **Step 5: The room detail page**

Create `roomos/apps/web/src/app/(signed-in)/rooms/[roomId]/page.tsx`:
```typescript
import { notFound } from "next/navigation"
import { requireSignedIn } from "@/lib/auth"
import { getRoomDetail } from "@/lib/room-queries"
import { RoomHeader } from "@/components/room-detail/RoomHeader"
import { OccupancyCard } from "@/components/room-detail/OccupancyCard"
import { ActivityTimeline } from "@/components/room-detail/ActivityTimeline"
import { PlatformsSidebar } from "@/components/room-detail/PlatformsSidebar"
import { SyncMetadataSidebar } from "@/components/room-detail/SyncMetadataSidebar"

export default async function RoomDetailPage({ params }: { params: Promise<{ roomId: string }> }) {
  const ctx = await requireSignedIn()
  const { roomId } = await params

  const data = await getRoomDetail(ctx.orgId, roomId)
  if (!data) notFound()

  const { room, paymentEvents, recentSyncs } = data
  const padsplit = room.listings.find((l) => l.platform === "PADSPLIT")
  const occupancy = padsplit?.occupancies[0] ?? null
  const member = occupancy?.member ?? null

  const items = [
    ...paymentEvents.map((p) => ({ kind: "payment" as const, date: p.eventDate, amount: p.amount.toString() })),
    ...recentSyncs.slice(0, 3).map((s) => ({
      kind: "scrape" as const, date: s.startedAt, status: s.status, itemsSynced: s.itemsSynced,
    })),
    ...(occupancy?.moveInDate && member
      ? [{ kind: "moved_in" as const, date: occupancy.moveInDate, memberName: member.name }]
      : []),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 12)

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <RoomHeader
        address={room.property.address}
        roomNumber={room.roomNumber}
        market={room.property.market}
        ownerName={room.property.owner?.name ?? null}
        externalRoomId={padsplit?.externalListingId ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div>
          <OccupancyCard member={member} occupancy={occupancy} />
          <ActivityTimeline items={items} />
        </div>
        <div>
          <PlatformsSidebar listings={room.listings} />
          <SyncMetadataSidebar
            lastSyncedAt={padsplit?.lastSyncedAt ?? null}
            lastFinancialSyncAt={occupancy?.lastFinancialSyncAt ?? null}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 7: Commit**

```bash
git add roomos/
git commit -m "Room detail view: header, occupancy card, timeline, platforms + sync sidebars"
```

---

## Task 10: Sync indicator click target — `/activity` panel

**Files:**
- Modify: `roomos/apps/web/src/components/nav/SyncPill.tsx` (wrap in Link)
- Modify: `roomos/apps/web/src/app/(signed-in)/activity/page.tsx`

- [ ] **Step 1: Make SyncPill clickable**

Edit `roomos/apps/web/src/components/nav/SyncPill.tsx`. Wrap the existing `<span>` return in a `<Link>` to `/activity`:

```typescript
import Link from "next/link"
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
    <Link
      href="/activity"
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] hover:opacity-80"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.fg}40` }}
      title={s.message}
    >
      <span className="block w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {s.message}
    </Link>
  )
}
```

- [ ] **Step 2: Build the Activity page**

Replace `roomos/apps/web/src/app/(signed-in)/activity/page.tsx`:
```typescript
import { requireSignedIn } from "@/lib/auth"
import { getRecentSyncRuns } from "@/lib/room-queries"
import { formatDate, formatDaysAgo } from "@/lib/format"

const STATUS_COLOR: Record<string, string> = {
  RUNNING: "var(--color-moving)",
  SUCCESS: "var(--color-occupied)",
  PARTIAL: "var(--color-flip)",
  FAILED:  "var(--color-due)",
}

export default async function ActivityPage() {
  const ctx = await requireSignedIn()
  const runs = await getRecentSyncRuns(ctx.orgId, 50)

  return (
    <main className="px-7 py-10 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between pb-6 mb-6 border-b border-[color:var(--color-rule)]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Activity <span className="italic text-[color:var(--color-muted)]">— sync history</span>
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">
            Most recent {runs.length} scrape attempts.
          </p>
        </div>
      </div>

      <div className="border border-[color:var(--color-rule)] rounded-md overflow-hidden bg-[color:var(--color-paper)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-paper-2)] border-b border-[color:var(--color-rule)]">
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">
              <th className="text-left px-4 py-3">Started</th>
              <th className="text-left px-4 py-3">Kind</th>
              <th className="text-left px-4 py-3">Platform</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Duration</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const ms = r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null
              const dur = ms == null ? "running" : ms > 60_000 ? `${Math.round(ms/60_000)}m` : `${Math.round(ms/1000)}s`
              return (
                <tr key={r.id} className="border-b last:border-b-0 border-[color:var(--color-rule)]">
                  <td className="px-4 py-3">
                    <div>{formatDate(r.startedAt)}</div>
                    <div className="text-[11px] text-[color:var(--color-muted)]">{formatDaysAgo(r.startedAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted)]">{r.kind}</td>
                  <td className="px-4 py-3">{r.platform}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-[2px] rounded border"
                      style={{ color: STATUS_COLOR[r.status], borderColor: `${STATUS_COLOR[r.status]}40`, background: `${STATUS_COLOR[r.status]}10` }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.itemsSynced}</td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-muted)]">{dur}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web typecheck
pnpm --filter @roomos/web test
```

Expected: zero TS errors, 22/22 tests pass.

- [ ] **Step 4: Commit**

```bash
git add roomos/
git commit -m "Activity page (clickable sync pill target) — sync_runs history table"
```

---

## Task 11: e2e smoke test of the home view

**Files:**
- Create: `roomos/apps/web/tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write the test**

Create `roomos/apps/web/tests/e2e/dashboard.spec.ts`:
```typescript
import { test, expect } from "@playwright/test"

test("anonymous /rooms redirects to /sign-in (regression)", async ({ page }) => {
  await page.goto("/rooms")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /all-rooms redirects to /sign-in", async ({ page }) => {
  await page.goto("/all-rooms")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /activity redirects to /sign-in", async ({ page }) => {
  await page.goto("/activity")
  await expect(page).toHaveURL(/\/sign-in/)
})

test("anonymous /rooms/<id> redirects to /sign-in", async ({ page }) => {
  await page.goto("/rooms/anything")
  await expect(page).toHaveURL(/\/sign-in/)
})
```

- [ ] **Step 2: Run**

```bash
cd /Users/jordanruvalcaba/Documents/Claude\ Code/.claude/worktrees/roomos-phase-1a/roomos
pnpm --filter @roomos/web exec playwright test
```

Expected: 7 passed (3 prior + 4 new).

- [ ] **Step 3: Commit**

```bash
git add roomos/
git commit -m "e2e: anonymous-redirect coverage for the four signed-in routes"
```

---

## Self-review checklist

1. **Spec coverage** (master spec section 6):
   - § 6 home view (KPI strip + status sections + occupied collapsed) — ✅ Tasks 4–5.
   - § 6 all-rooms (search + chips + dropdowns + table + 50/page + CSV export) — ✅ Tasks 6–8.
   - § 6 room detail (header + occupancy + timeline + platforms + sync metadata) — ✅ Task 9.
   - § 6 sync indicator panel (clickable to recent sync_runs) — ✅ Task 10.

2. **Placeholder scan**: every step has actual code; no "TBD" or "implement later".

3. **Type/name consistency**:
   - `RoomCardData` defined in Task 3, consumed by Tasks 4, 7.
   - `RoomFilter`, `parseSearchParams`, `buildWhereClause` defined in Task 1, consumed by Tasks 3, 6, 7, 8.
   - `getKpiCounts`, `getRoomsByStatus`, `getAllRoomsFiltered`, `getFilterOptions`, `getRoomDetail`, `getRecentSyncRuns` defined in Task 3, consumed by Tasks 5, 7, 8, 9, 10.
   - `formatMoney`, `formatDate`, `formatDaysAgo` defined in Task 1, used in Tasks 4, 7, 9, 10.
   - `toCsv`, `CsvColumn` defined in Task 1, used in Task 8.

4. **Coverage gaps explicitly accepted**:
   - Sort by `balance` / `move_in` / `lease_end` falls back to address sort in `room-queries.ts:sortToOrderBy`. Acceptable for MVP — full DB sort on `Decimal` and date fields can be added in Phase 1C.1 if Jordan asks for it.
   - "Refresh now" button on the room detail header (per spec) — deferred. Adds complexity (Server Action enqueueing a one-shot BullMQ job for that listing only); not critical for the dashboard MVP. Phase 1D candidate.
   - The Topbar's "x-pathname" header is read by the existing layout — unchanged from Phase 1A.

5. **Risk callouts**:
   - shadcn init may rewrite `globals.css` and clobber the brand `@theme` block. Task 2 Step 1 addresses this — if it happens, restore from `git diff` and re-init.
   - Next.js 16 `searchParams` is `Promise<...>` (vs Next.js 14 sync). All page handlers in Tasks 7 + 9 await it correctly.
   - `getAllRoomsFiltered` issues 2 queries + 1 count; with 300 rooms the count is fine. If portfolio grows to 5000+, add a covering index on `(orgId, propertyId)`.

---

## Done definition

Phase 1C is complete when:
1. `/rooms` shows the KPI strip + Past Due / Vacant / Moving / Needs Flip sections + Occupied footer.
2. `/all-rooms` filters and paginates correctly via URL parameters; `Export CSV` downloads a file.
3. Clicking any room card or table row navigates to `/rooms/<id>` showing the detail view.
4. Clicking the SyncPill in the Topbar navigates to `/activity` showing the sync history table.
5. `pnpm --filter @roomos/web typecheck` zero errors.
6. `pnpm --filter @roomos/web test` ≥ 22 passing.
7. `pnpm --filter @roomos/web exec playwright test` 7 passing (3 prior auth-gate + 4 new).

Then 1D (bootstrap wizard) is the last piece of Phase 1.
