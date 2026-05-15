# PadSplit Portfolio Deep-Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deep-sweep mode to the `padsplit-message-responder` Codex skill that nightly (+ on-demand) reconciles the entire PadSplit host account into the CoHost Knowledge Hub vault, with a deterministic, unit-tested fence tool guaranteeing the sweep and the reactive responder never clobber each other's regions.

**Architecture:** The skill's source of truth moves into the RoomOS repo under `skills/padsplit-message-responder/` (one-time import — it is ~2,000 lines of markdown + small dirs) so it gets version control, PR review, and CI. The testable core is `skills/padsplit-message-responder/bin/vault-fence.mjs` — a dependency-free Node tool the skill shells out to for *every* vault write: it parses a markdown file into named fenced regions + frontmatter, replaces only the requested region byte-for-byte, and is exhaustively unit-tested with `node --test`. The sweep protocol, fence-ownership contract, and trigger logic are authored as skill markdown (`references/deep-sweep.md`, edits to `references/knowledge-hub.md` and `SKILL.md`). A `skills/deploy.sh` rsyncs the repo copy to `~/.codex/skills/padsplit-message-responder/`.

**Tech Stack:** Node 20 (ESM, zero deps — `node:test`, `node:fs`, `node:path` only). Markdown skill authoring. Bash deploy script. No RoomOS app changes.

---

## Source spec & predecessors

- Spec: `docs/superpowers/specs/2026-05-10-padsplit-portfolio-deep-sweep-design.md` — §4 fence-ownership contract, §5 canonical schema, §6 walk/pacing, §7 migration, §8 ledger/snapshots, §9 error handling, §10 testing, §11 success criteria.
- Pipeline this feeds: `docs/superpowers/specs/2026-05-08-roomos-vault-fed-pivot-design.md` — the Phase 2A vault→Postgres adapter that turns a complete vault into a complete dashboard with zero RoomOS change.
- Live skill being imported + extended: `~/.codex/skills/padsplit-message-responder/` (SKILL.md 106 lines; references/ 9 files; agents/).
- Vault target: `~/Documents/CoHost-Knowledge-Hub/` — 57 property `.md`, 378 dossiers, `_INDEX.md`, `_RUN-LOG.md`, `_GAP-LOG.md`, `_SNAPSHOT-*`.

## What this plan does NOT cover (deferred)

- Airbnb portfolio sweep (Phase 2B, separate plan).
- REI Hub / long-term lease (Phase 2C).
- Any RoomOS TypeScript change. The complete vault flows through the existing Phase 2A adapter untouched.
- Rewriting the reactive responder behavior — only adds a sweep mode + teaches it to respect fences.

## Decisions locked

- **Skill source-of-truth moves into the repo.** One-time `cp -R` of the live skill into `skills/padsplit-message-responder/`. All deep-sweep work happens there; `skills/deploy.sh` rsyncs to `~/.codex/skills/`. Rationale: version control + PR review + CI for the fence tool. The live skill is tiny; the import is cheap and YAGNI-clean.
- **All vault writes go through `vault-fence.mjs`.** The skill never hand-edits a fenced region or frontmatter freehand. It calls `node bin/vault-fence.mjs <verb> ...`. This makes the byte-exactness contract (§4) a *tested guarantee*, not an LLM hope.
- **Fence syntax:** HTML comments so they render invisibly in Obsidian: `<!-- SWEEP:roster -->` … `<!-- /SWEEP:roster -->`. Region name is the token after `SWEEP:`. Frontmatter is treated as the implicit region `frontmatter`.
- **Frontmatter merge is key-scoped.** `vault-fence frontmatter-set` rewrites only the sweep-owned keys (§5 list); any other key present (responder- or human-added) is preserved byte-for-byte including ordering and comments. Unknown sweep keys are added in canonical order at the end of the sweep-owned block.
- **Migration is idempotent and detect-and-skip.** A file already carrying `<!-- SWEEP:roster -->` + all canonical frontmatter keys is left byte-identical by `vault-fence migrate`.
- **Dry-run writes nothing but a preview.** `vault-fence` verbs accept `--dry-run`; they compute the would-be file content and emit a unified diff to stdout instead of writing. The skill's dry-run mode aggregates these into a `_RECONCILE-LOG.md` preview block.
- **Node, zero deps.** No `gray-matter`, no npm install in the skill. Frontmatter is parsed with a small purpose-built parser (the vault's frontmatter is flat `key: "value"` / `key: value` / `key: null` — no nested YAML). This keeps the skill runnable in the Codex sandbox with no install step.
- **Tests run via `node --test`** from the repo; wired into the existing CI as a new step so the fence tool can never regress.

---

## File structure (locked in before tasks)

```
<repo root>/
├── skills/
│   ├── deploy.sh                                          # NEW (Task 2) — rsync repo copy → ~/.codex/skills
│   └── padsplit-message-responder/                        # NEW (Task 2) — one-time import of the live skill
│       ├── SKILL.md                                       # MODIFIED (Task 12) — sweep-mode trigger + section
│       ├── references/
│       │   ├── knowledge-hub.md                           # MODIFIED (Task 11) — fence-ownership contract
│       │   ├── deep-sweep.md                              # NEW (Task 10) — the sweep protocol
│       │   └── … (other refs imported unchanged)
│       ├── bin/
│       │   ├── vault-fence.mjs                            # NEW (Tasks 3–9) — deterministic fence/frontmatter tool
│       │   └── vault-fence.test.mjs                       # NEW (Tasks 3–9) — node:test suite
│       └── bin/fixtures/
│           ├── property-legacy.md                         # NEW (Task 8) — pre-migration property sample
│           ├── property-fenced.md                         # NEW (Task 8) — post-migration property sample
│           ├── dossier-legacy.md                          # NEW (Task 8) — pre-migration dossier sample
│           └── dossier-fenced.md                          # NEW (Task 8) — post-migration dossier sample
├── .github/workflows/ci.yml                               # MODIFIED (Task 9) — add `node --test skills/...` step
└── docs/superpowers/
    ├── plans/2026-05-10-padsplit-portfolio-deep-sweep.md  # this file
    └── DEPLOYMENT-DEEPSWEEP.md                            # NEW (Task 1, finalized Task 14)
```

`vault-fence.mjs` is one focused file with a clear CLI surface — small enough to hold in context, one responsibility (deterministic markdown region/frontmatter edits). Its verbs:

| Verb | Purpose |
|---|---|
| `parse <file>` | Print JSON: `{ frontmatter: {...}, regions: { name: {start,end,body} }, hasFence: bool }` |
| `replace-region <file> <name> --body-file <f> [--dry-run]` | Replace only `<!-- SWEEP:name -->…<!-- /SWEEP:name -->`; everything else byte-identical |
| `frontmatter-set <file> --json <kvjson> [--dry-run]` | Upsert only the sweep-owned keys; preserve all other keys/comments/order |
| `migrate <file> --kind property\|dossier [--dry-run]` | Idempotently insert missing fence + canonical frontmatter keys |
| `rollup --vault <dir> --out _PORTFOLIO.md [--dry-run]` | Regenerate the portfolio rollup from all property frontmatter |
| `roster --vault <dir> --out members/_ROSTER.md [--dry-run]` | Regenerate the authoritative roster from all dossier frontmatter |

---

## Conventions

- **TDD on `vault-fence.mjs`.** Every verb gets failing tests first (`node --test`), then minimal implementation. Region/frontmatter edits assert byte-exactness of untouched bytes via full-string equality, not "looks right".
- **Markdown skill files (deep-sweep.md, knowledge-hub.md, SKILL.md) are not TDD-able** — they are reviewed against the spec for completeness and internal consistency. Each such task ends with a self-review checklist instead of a test.
- **Commit per task.** Conventional messages, `deepsweep(...)` scope.
- **Byte-exactness invariant** (asserted in tests): for any verb V and region/key set R, the output file differs from the input file *only* within R. Tests slice the file around R and `assert.strictEqual` the remainder.
- **Idempotency invariant**: running any verb twice with the same inputs yields an identical file on the second run (zero diff).

---

## Tasks

### Task 1: Bootstrap the deployment doc

**Files:**
- Create: `docs/superpowers/DEPLOYMENT-DEEPSWEEP.md`

- [ ] **Step 1: Write the skeleton**

```markdown
<!-- docs/superpowers/DEPLOYMENT-DEEPSWEEP.md -->
# PadSplit Portfolio Deep-Sweep — Deployment

Run after this work lands on `main`.

## 1. Deploy the updated skill to Codex

\`\`\`bash
cd <repo>
./skills/deploy.sh
\`\`\`

This rsyncs `skills/padsplit-message-responder/` → `~/.codex/skills/padsplit-message-responder/`. Confirm:

\`\`\`bash
ls ~/.codex/skills/padsplit-message-responder/bin/vault-fence.mjs
grep -c "Deep Sweep Mode" ~/.codex/skills/padsplit-message-responder/SKILL.md
\`\`\`

## 2. First run — DRY RUN ONLY

(Filled in by Task 14 — the read-only first-run procedure + how to review the `_RECONCILE-LOG.md` preview.)

## 3. First real sweep

(Filled in by Task 14.)

## 4. Smoke test

(Filled in by Task 15.)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-DEEPSWEEP.md
git commit -m "docs(deepsweep): start deployment doc"
```

---

### Task 2: One-time skill import + deploy script

**Files:**
- Create: `skills/padsplit-message-responder/**` (copied from live skill)
- Create: `skills/deploy.sh`
- Create: `skills/.gitignore` (exclude nothing — we want the whole skill tracked; this file documents that intent)

- [ ] **Step 1: Import the live skill verbatim**

```bash
cd <repo>
mkdir -p skills
cp -R ~/.codex/skills/padsplit-message-responder skills/padsplit-message-responder
# Drop any runtime cruft that should not be versioned:
rm -f skills/padsplit-message-responder/references/lock-cooldown.txt
find skills/padsplit-message-responder -name '.DS_Store' -delete
```

- [ ] **Step 2: Write `skills/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy the repo copy of the padsplit-message-responder skill to Codex.
# Idempotent. Excludes runtime-only files. Never deletes vault data.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/padsplit-message-responder" && pwd)"
DEST="$HOME/.codex/skills/padsplit-message-responder"
mkdir -p "$DEST"
rsync -av --delete \
  --exclude '.DS_Store' \
  --exclude 'bin/fixtures/' \
  "$SRC"/ "$DEST"/
echo "Deployed skill → $DEST"
ls "$DEST/bin/vault-fence.mjs" >/dev/null && echo "vault-fence.mjs present ✓"
```

`--exclude 'bin/fixtures/'` keeps test fixtures out of the live skill (they're test-only). `--delete` makes the live copy an exact mirror of the repo copy minus exclusions.

- [ ] **Step 3: Make it executable + smoke it (dry rsync)**

```bash
chmod +x skills/deploy.sh
rsync -avn --delete --exclude '.DS_Store' --exclude 'bin/fixtures/' \
  skills/padsplit-message-responder/ ~/.codex/skills/padsplit-message-responder/ | head -20
```

Expected: a dry-run listing showing the import matches the live skill (no surprising deletions). Do NOT run the real rsync yet — `bin/` doesn't exist until later tasks.

- [ ] **Step 4: Commit the baseline import**

```bash
git add skills/
git commit -m "deepsweep: import padsplit-message-responder skill into repo as source of truth"
```

---

### Task 3: `vault-fence parse` — frontmatter + region parser (TDD)

**Files:**
- Create: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Create: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// skills/padsplit-message-responder/bin/vault-fence.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseVaultFile } from "./vault-fence.mjs"

const SAMPLE = `---
address: "1311 Morgana Rd, Jacksonville, FL 32205"
rooms: 6
padsplit-property-id: 28685
flags: null
---

# 1311 Morgana Rd

<!-- SWEEP:roster -->
| Room | Member | Status |
|------|--------|--------|
| R1 | Jeffrey Byrd | OCCUPIED |
<!-- /SWEEP:roster -->

## Interaction Log

- 2026-05-01: note
`

test("parseVaultFile extracts flat frontmatter", () => {
  const r = parseVaultFile(SAMPLE)
  assert.equal(r.frontmatter.address, "1311 Morgana Rd, Jacksonville, FL 32205")
  assert.equal(r.frontmatter.rooms, "6")
  assert.equal(r.frontmatter["padsplit-property-id"], "28685")
  assert.equal(r.frontmatter.flags, null)
})

test("parseVaultFile locates the roster region with byte offsets", () => {
  const r = parseVaultFile(SAMPLE)
  assert.ok(r.regions.roster, "roster region found")
  // The region body excludes the fence markers themselves.
  assert.match(r.regions.roster.body, /Jeffrey Byrd/)
  assert.doesNotMatch(r.regions.roster.body, /SWEEP:roster/)
  // Reconstructing from offsets must reproduce the original byte-for-byte.
  const { start, end } = r.regions.roster
  assert.equal(SAMPLE.slice(0, start) + SAMPLE.slice(start, end) + SAMPLE.slice(end), SAMPLE)
})

test("parseVaultFile reports hasFence=false when no SWEEP fence present", () => {
  const r = parseVaultFile(`---\naddress: "x"\n---\n# x\n`)
  assert.equal(r.hasFence, false)
  assert.deepEqual(r.regions, {})
})

test("parseVaultFile throws on missing frontmatter", () => {
  assert.throws(() => parseVaultFile("# no frontmatter"), /frontmatter/i)
})
```

- [ ] **Step 2: Run, verify fail**

```bash
cd skills/padsplit-message-responder/bin && node --test vault-fence.test.mjs
```

Expected: FAIL — module/exports missing.

- [ ] **Step 3: Implement `parseVaultFile` + CLI skeleton**

```javascript
// skills/padsplit-message-responder/bin/vault-fence.mjs
#!/usr/bin/env node
import { readFileSync } from "node:fs"

const FM_RE = /^---\n([\s\S]*?)\n---\n?/

/** Parse flat `key: value` frontmatter. Values: quoted string, bare token, or null. */
export function parseFrontmatter(block) {
  const fm = {}
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let raw = m[2].trim()
    if (raw === "null" || raw === "") fm[key] = raw === "null" ? null : ""
    else if (raw.startsWith('"') && raw.endsWith('"')) fm[key] = raw.slice(1, -1)
    else fm[key] = raw
  }
  return fm
}

/** Returns { frontmatter, regions:{name:{start,end,body}}, hasFence, fmEnd }. */
export function parseVaultFile(content) {
  const fmMatch = content.match(FM_RE)
  if (!fmMatch) throw new Error("No YAML frontmatter block found")
  const frontmatter = parseFrontmatter(fmMatch[1])
  const fmEnd = fmMatch[0].length
  const regions = {}
  const fenceRe = /<!--\s*SWEEP:([a-z0-9-]+)\s*-->([\s\S]*?)<!--\s*\/SWEEP:\1\s*-->/g
  let hasFence = false
  let mm
  while ((mm = fenceRe.exec(content)) !== null) {
    hasFence = true
    const name = mm[1]
    const bodyStart = mm.index + mm[0].indexOf(mm[2])
    regions[name] = { start: bodyStart, end: bodyStart + mm[2].length, body: mm[2] }
  }
  return { frontmatter, regions, hasFence, fmEnd, raw: content }
}

function main(argv) {
  const [verb, file] = argv
  if (verb === "parse") {
    const parsed = parseVaultFile(readFileSync(file, "utf8"))
    process.stdout.write(JSON.stringify({
      frontmatter: parsed.frontmatter,
      regions: Object.fromEntries(Object.entries(parsed.regions).map(([k, v]) => [k, { start: v.start, end: v.end }])),
      hasFence: parsed.hasFence,
    }, null, 2) + "\n")
    return
  }
  process.stderr.write(`unknown verb: ${verb}\n`)
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
```

- [ ] **Step 4: Run, verify pass**

```bash
cd skills/padsplit-message-responder/bin && node --test vault-fence.test.mjs
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: vault-fence parse (frontmatter + region offsets) (TDD)"
```

---

### Task 4: `vault-fence replace-region` — byte-exact region replacement (TDD)

**Files:**
- Modify: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Append failing tests**

```javascript
import { replaceRegion } from "./vault-fence.mjs"

const WITH_ROSTER = `---
address: "x"
---

# x

<!-- SWEEP:roster -->
OLD BODY
<!-- /SWEEP:roster -->

## Interaction Log

- keep me exactly
`

test("replaceRegion swaps only the region body, byte-identical elsewhere", () => {
  const out = replaceRegion(WITH_ROSTER, "roster", "\nNEW TABLE\n")
  assert.match(out, /NEW TABLE/)
  assert.doesNotMatch(out, /OLD BODY/)
  // Everything before the fence and after it is untouched.
  const before = WITH_ROSTER.slice(0, WITH_ROSTER.indexOf("<!-- SWEEP:roster -->"))
  const after = WITH_ROSTER.slice(WITH_ROSTER.indexOf("<!-- /SWEEP:roster -->"))
  assert.ok(out.startsWith(before))
  assert.ok(out.endsWith(after))
})

test("replaceRegion is idempotent for identical body", () => {
  const once = replaceRegion(WITH_ROSTER, "roster", "\nSAME\n")
  const twice = replaceRegion(once, "roster", "\nSAME\n")
  assert.equal(once, twice)
})

test("replaceRegion throws if the region is absent (caller must migrate first)", () => {
  assert.throws(() => replaceRegion(`---\na: 1\n---\n# x\n`, "roster", "y"), /region 'roster' not found/)
})
```

- [ ] **Step 2: Run, verify fail**

```bash
cd skills/padsplit-message-responder/bin && node --test vault-fence.test.mjs
```

- [ ] **Step 3: Implement `replaceRegion`**

```javascript
export function replaceRegion(content, name, newBody) {
  const parsed = parseVaultFile(content)
  const region = parsed.regions[name]
  if (!region) throw new Error(`region '${name}' not found`)
  return content.slice(0, region.start) + newBody + content.slice(region.end)
}
```

Add a `replace-region` CLI verb in `main()`:

```javascript
  if (verb === "replace-region") {
    const name = argv[2]
    const bodyFileIdx = argv.indexOf("--body-file")
    const dryRun = argv.includes("--dry-run")
    const body = readFileSync(argv[bodyFileIdx + 1], "utf8")
    const original = readFileSync(file, "utf8")
    const next = replaceRegion(original, name, body)
    if (dryRun) { process.stdout.write(unifiedDiff(file, original, next)); return }
    if (next !== original) writeFileSync(file, next)
    return
  }
```

(Define `unifiedDiff` + import `writeFileSync` in Task 6; for now a stub `function unifiedDiff(){return ""}` and `import { readFileSync, writeFileSync } from "node:fs"` so the file still loads — the dry-run path is exercised in Task 6.)

- [ ] **Step 4: Run, verify pass**

```bash
cd skills/padsplit-message-responder/bin && node --test vault-fence.test.mjs
```

Expected: all pass (7 total).

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: vault-fence replace-region (byte-exact) (TDD)"
```

---

### Task 5: `vault-fence frontmatter-set` — key-scoped frontmatter upsert (TDD)

**Files:**
- Modify: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Append failing tests**

```javascript
import { frontmatterSet, SWEEP_PROPERTY_KEYS, SWEEP_DOSSIER_KEYS } from "./vault-fence.mjs"

const FM = `---
address: "1311 Morgana Rd"
rooms: 5
flags: "[JORDAN EDIT] do not auto-touch"
custom-human-key: "keep me"
---

# body unchanged
`

test("frontmatterSet updates only the given sweep keys", () => {
  const out = frontmatterSet(FM, { rooms: "6", "padsplit-property-id": "28685" }, SWEEP_PROPERTY_KEYS)
  assert.match(out, /rooms: 6/)
  assert.match(out, /padsplit-property-id: 28685/)
})

test("frontmatterSet preserves non-sweep keys byte-for-byte (incl. human edits)", () => {
  const out = frontmatterSet(FM, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  assert.match(out, /flags: "\[JORDAN EDIT\] do not auto-touch"/)
  assert.match(out, /custom-human-key: "keep me"/)
  // Body after frontmatter is identical.
  assert.ok(out.endsWith("\n# body unchanged\n"))
})

test("frontmatterSet refuses to set a key outside the owned set", () => {
  assert.throws(() => frontmatterSet(FM, { "custom-human-key": "hijack" }, SWEEP_PROPERTY_KEYS),
    /not a sweep-owned key/)
})

test("frontmatterSet is idempotent", () => {
  const a = frontmatterSet(FM, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  const b = frontmatterSet(a, { rooms: "6" }, SWEEP_PROPERTY_KEYS)
  assert.equal(a, b)
})
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```javascript
export const SWEEP_PROPERTY_KEYS = [
  "padsplit-property-id", "address", "market", "state", "rooms", "status", "last-swept",
]
export const SWEEP_DOSSIER_KEYS = [
  "member-id", "name", "status", "balance", "payment-tier", "days-past-due", "room",
  "property", "move-in-date", "weekly-rate", "move-in-fee", "last-payment-date",
  "last-payment-amount", "phone", "email", "rating", "last-swept",
]

function serializeValue(v) {
  if (v === null) return "null"
  if (/^-?\d+(\.\d+)?$/.test(String(v))) return String(v)   // bare number
  return `"${String(v).replace(/"/g, '\\"')}"`
}

export function frontmatterSet(content, updates, ownedKeys) {
  for (const k of Object.keys(updates)) {
    if (!ownedKeys.includes(k)) throw new Error(`'${k}' is not a sweep-owned key`)
  }
  const fmMatch = content.match(FM_RE)
  if (!fmMatch) throw new Error("No YAML frontmatter block found")
  const lines = fmMatch[1].split("\n")
  const seen = new Set()
  const outLines = lines.map((line) => {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) return line
    const key = m[1]
    if (key in updates) { seen.add(key); return `${key}: ${serializeValue(updates[key])}` }
    return line
  })
  // Append any owned keys not already present, in canonical order.
  for (const k of ownedKeys) {
    if (k in updates && !seen.has(k)) outLines.push(`${k}: ${serializeValue(updates[k])}`)
  }
  const newFm = `---\n${outLines.join("\n")}\n---\n`
  return newFm + content.slice(fmMatch[0].length)
}
```

Wire a `frontmatter-set` CLI verb (mirrors `replace-region`: reads `--json`, `--kind property|dossier` selects the owned key set, supports `--dry-run`).

- [ ] **Step 4: Run, verify pass** (11 total)

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: vault-fence frontmatter-set (key-scoped, preserves human edits) (TDD)"
```

---

### Task 6: `--dry-run` unified diff (TDD)

**Files:**
- Modify: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Append failing test**

```javascript
import { unifiedDiff } from "./vault-fence.mjs"

test("unifiedDiff shows only changed lines and writes nothing", () => {
  const a = "line1\nOLD\nline3\n"
  const b = "line1\nNEW\nline3\n"
  const d = unifiedDiff("f.md", a, b)
  assert.match(d, /-OLD/)
  assert.match(d, /\+NEW/)
  assert.doesNotMatch(d, /line1.*\n.*line1/)  // unchanged lines not duplicated as +/-
})

test("unifiedDiff is empty string when identical", () => {
  assert.equal(unifiedDiff("f.md", "same\n", "same\n"), "")
})
```

- [ ] **Step 2: Run, verify fail** (the Task 4/5 stub returns "")

- [ ] **Step 3: Implement a minimal line-level unified diff** (no deps — LCS over lines)

```javascript
export function unifiedDiff(label, a, b) {
  if (a === b) return ""
  const al = a.split("\n"), bl = b.split("\n")
  // Minimal: emit a hunk with all lines, marking equal/added/removed via LCS.
  const n = al.length, m = bl.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = [`--- ${label}`, `+++ ${label} (proposed)`]
  let i = 0, j = 0
  while (i < n && j < m) {
    if (al[i] === bl[j]) { out.push(` ${al[i]}`); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`-${al[i]}`); i++ }
    else { out.push(`+${bl[j]}`); j++ }
  }
  while (i < n) out.push(`-${al[i++]}`)
  while (j < m) out.push(`+${bl[j++]}`)
  return out.join("\n") + "\n"
}
```

- [ ] **Step 4: Run, verify pass** (13 total). Also manually verify the `replace-region --dry-run` path now prints a diff and does not modify the file:

```bash
cd skills/padsplit-message-responder/bin
cp fixtures/property-fenced.md /tmp/t.md 2>/dev/null || printf -- '---\na: 1\n---\n<!-- SWEEP:roster -->\nX\n<!-- /SWEEP:roster -->\n' > /tmp/t.md
printf 'NEWBODY' > /tmp/body.txt
node vault-fence.mjs replace-region /tmp/t.md roster --body-file /tmp/body.txt --dry-run
grep -q NEWBODY /tmp/t.md && echo "FAIL: file mutated" || echo "OK: dry-run wrote nothing"
```

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: vault-fence --dry-run unified diff (TDD)"
```

---

### Task 7: `vault-fence migrate` — idempotent fence + frontmatter migration (TDD)

**Files:**
- Modify: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Append failing tests**

```javascript
import { migrate } from "./vault-fence.mjs"

const LEGACY_PROPERTY = `---
address: "733 Tarpon Ave, Sarasota, FL 34237"
rooms: 6
platform: "PadSplit"
---

# 733 Tarpon Ave

## Current Members

| Room | Name | Status | Balance Due | Notes |
|------|------|--------|-------------|-------|
| R1 | Jeffrey Byrd | Active | $0 | |

## Interaction Log

- 2026-05-01: existing note KEEP
`

test("migrate inserts a roster fence wrapping the existing Current Members table", () => {
  const out = migrate(LEGACY_PROPERTY, "property")
  assert.match(out, /<!-- SWEEP:roster -->/)
  assert.match(out, /<!-- \/SWEEP:roster -->/)
  // Existing member table is now INSIDE the fence.
  const r = parseVaultFile(out).regions.roster
  assert.match(r.body, /Jeffrey Byrd/)
  // Responder content preserved.
  assert.match(out, /existing note KEEP/)
})

test("migrate adds canonical frontmatter keys (null where unknown)", () => {
  const out = migrate(LEGACY_PROPERTY, "property")
  const fm = parseVaultFile(out).frontmatter
  assert.ok("padsplit-property-id" in fm)
  assert.ok("status" in fm)
  assert.ok("last-swept" in fm)
})

test("migrate is detect-and-skip: second run is byte-identical", () => {
  const once = migrate(LEGACY_PROPERTY, "property")
  const twice = migrate(once, "property")
  assert.equal(once, twice)
})

test("migrate on a dossier inserts canonical dossier keys incl. property", () => {
  const legacyDossier = `---\nname: "Abhay Azariah"\nbalance: "0.00"\nproperty: null\n---\n\n# Dossier\n`
  const out = migrate(legacyDossier, "dossier")
  const fm = parseVaultFile(out).frontmatter
  assert.ok("member-id" in fm)
  assert.ok("days-past-due" in fm)
  assert.equal(fm.property, null)  // preserved, not clobbered
})
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement `migrate`**

```javascript
const CURRENT_MEMBERS_HEADING_RE = /^##\s+Current Members\s*$/m

export function migrate(content, kind) {
  let out = content
  const parsed = parseVaultFile(out)

  // 1. Fence (property files only — dossiers have no roster table).
  if (kind === "property" && !parsed.regions.roster) {
    const h = out.match(CURRENT_MEMBERS_HEADING_RE)
    if (h) {
      // Wrap everything from just after the heading to the next ## or --- in a fence.
      const afterHeading = h.index + h[0].length
      const rest = out.slice(afterHeading)
      const stop = rest.search(/\n##\s|\n---/)
      const tableBlock = stop === -1 ? rest : rest.slice(0, stop)
      const tail = stop === -1 ? "" : rest.slice(stop)
      out =
        out.slice(0, afterHeading) +
        `\n\n<!-- SWEEP:roster -->` + tableBlock + `\n<!-- /SWEEP:roster -->` + tail
    } else {
      // No Current Members section — insert an empty fence right after frontmatter.
      const fm = out.match(FM_RE)[0]
      out = fm + `\n<!-- SWEEP:roster -->\n_(populated by deep sweep)_\n<!-- /SWEEP:roster -->\n` + out.slice(fm.length)
    }
  }

  // 2. Canonical frontmatter keys (null where unknown). Never overwrite existing values.
  const ownedKeys = kind === "property" ? SWEEP_PROPERTY_KEYS : SWEEP_DOSSIER_KEYS
  const fmNow = parseVaultFile(out).frontmatter
  const additions = {}
  for (const k of ownedKeys) if (!(k in fmNow)) additions[k] = null
  if (Object.keys(additions).length > 0) out = frontmatterSet(out, additions, ownedKeys)

  return out
}
```

Wire a `migrate` CLI verb (`--kind property|dossier`, `--dry-run`).

- [ ] **Step 4: Run, verify pass** (17 total)

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: vault-fence migrate (idempotent fence+frontmatter) (TDD)"
```

---

### Task 8: Real anonymized fixtures

**Files:**
- Create: `skills/padsplit-message-responder/bin/fixtures/property-legacy.md`
- Create: `skills/padsplit-message-responder/bin/fixtures/property-fenced.md`
- Create: `skills/padsplit-message-responder/bin/fixtures/dossier-legacy.md`
- Create: `skills/padsplit-message-responder/bin/fixtures/dossier-fenced.md`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Capture two real vault files, anonymize, save as the legacy fixtures**

```bash
cd skills/padsplit-message-responder/bin/fixtures
# Use a real property + dossier so the parser is tested against true structure.
sed 's/[0-9]\{3\}-[0-9]\{4\}/XXX-XXXX/g; s/[A-Za-z0-9._%+-]\+@[A-Za-z0-9.-]\+/redacted@example.com/g' \
  ~/Documents/CoHost-Knowledge-Hub/733-Tarpon-Ave-Sarasota-FL.md > property-legacy.md
sed 's/[0-9]\{3\}-[0-9]\{4\}/XXX-XXXX/g; s/[A-Za-z0-9._%+-]\+@[A-Za-z0-9.-]\+/redacted@example.com/g' \
  ~/Documents/CoHost-Knowledge-Hub/members/Abhay-Azariah.md > dossier-legacy.md
```

- [ ] **Step 2: Generate the expected post-migration fixtures from the tool itself**

```bash
cd skills/padsplit-message-responder/bin
node -e 'import("./vault-fence.mjs").then(m=>{const fs=require("node:fs");fs.writeFileSync("fixtures/property-fenced.md",m.migrate(fs.readFileSync("fixtures/property-legacy.md","utf8"),"property"));fs.writeFileSync("fixtures/dossier-fenced.md",m.migrate(fs.readFileSync("fixtures/dossier-legacy.md","utf8"),"dossier"))})'
```

- [ ] **Step 3: Add a regression test pinning migration output to the fixtures**

```javascript
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))
const fx = (n) => readFileSync(join(HERE, "fixtures", n), "utf8")

test("migrate(property-legacy) === property-fenced fixture", () => {
  assert.equal(migrate(fx("property-legacy.md"), "property"), fx("property-fenced.md"))
})
test("migrate(dossier-legacy) === dossier-fenced fixture", () => {
  assert.equal(migrate(fx("dossier-legacy.md"), "dossier"), fx("dossier-fenced.md"))
})
test("re-migrating the fenced fixtures is a no-op", () => {
  assert.equal(migrate(fx("property-fenced.md"), "property"), fx("property-fenced.md"))
  assert.equal(migrate(fx("dossier-fenced.md"), "dossier"), fx("dossier-fenced.md"))
})
```

- [ ] **Step 4: Run, verify pass** (20 total)

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/bin/fixtures skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: anonymized vault fixtures + migration regression tests"
```

---

### Task 9: `rollup` + `roster` regenerators (TDD) + CI wiring

**Files:**
- Modify: `skills/padsplit-message-responder/bin/vault-fence.mjs`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Append failing tests**

```javascript
import { buildRoster, buildPortfolio } from "./vault-fence.mjs"

const DOSSIERS = [
  { frontmatter: { name: "A", room: "R1", property: "1311 Morgana Rd", status: "Active", balance: "0.00", "payment-tier": "CURRENT" } },
  { frontmatter: { name: "B", room: "R2", property: "733 Tarpon Ave", status: "Terminated", balance: "-407.90", "payment-tier": "HIGH_RISK" } },
]
const PROPERTIES = [
  { frontmatter: { address: "1311 Morgana Rd", rooms: "6", status: "ACTIVE" }, occupied: 4, vacant: 2 },
  { frontmatter: { address: "733 Tarpon Ave", rooms: "6", status: "ACTIVE" }, occupied: 3, vacant: 3 },
]

test("buildRoster emits one table row per dossier with property linkage", () => {
  const md = buildRoster(DOSSIERS)
  assert.match(md, /\| A \| R1 \| 1311 Morgana Rd \| Active \|/)
  assert.match(md, /\| B \| R2 \| 733 Tarpon Ave \| Terminated \|/)
  assert.match(md, /\*\*Total Members:\*\* 2/)
})

test("buildPortfolio rolls up totals", () => {
  const md = buildPortfolio(PROPERTIES)
  assert.match(md, /Properties:\*\* 2/)
  assert.match(md, /Total rooms:\*\* 12/)
  assert.match(md, /Occupied:\*\* 7/)
  assert.match(md, /Vacant:\*\* 5/)
})
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement `buildRoster` + `buildPortfolio`** (pure functions over parsed frontmatter arrays) and CLI verbs `roster`/`rollup` that glob the vault, parse each file, and call these. Full code:

```javascript
export function buildRoster(dossiers) {
  const rows = dossiers.map((d) => {
    const f = d.frontmatter
    return `| ${f.name ?? "?"} | ${f.room ?? "?"} | ${f.property ?? "(unlinked)"} | ${f.status ?? "?"} | ${f.balance ?? "?"} | ${f["payment-tier"] ?? "?"} |`
  })
  return `# CoHost Management — Member Roster

**Last Updated:** ${new Date().toISOString().slice(0, 10)}
**Total Members:** ${dossiers.length}
**Source:** PadSplit deep-sweep reconciliation

| Name | Room | Property | Status | Balance | Pay Tier |
|------|------|----------|--------|---------|----------|
${rows.join("\n")}
`
}

export function buildPortfolio(properties) {
  const totalRooms = properties.reduce((s, p) => s + Number(p.frontmatter.rooms || 0), 0)
  const occ = properties.reduce((s, p) => s + (p.occupied || 0), 0)
  const vac = properties.reduce((s, p) => s + (p.vacant || 0), 0)
  return `# CoHost Management — Portfolio Rollup

**Last full sweep:** ${new Date().toISOString()}

- **Properties:** ${properties.length}
- **Total rooms:** ${totalRooms}
- **Occupied:** ${occ}
- **Vacant:** ${vac}

| Property | Rooms | Occupied | Vacant | Status |
|----------|-------|----------|--------|--------|
${properties.map((p) => `| ${p.frontmatter.address} | ${p.frontmatter.rooms} | ${p.occupied || 0} | ${p.vacant || 0} | ${p.frontmatter.status ?? "?"} |`).join("\n")}
`
}
```

- [ ] **Step 4: Run, verify pass** (24 total)

- [ ] **Step 5: Add CI step**

In `.github/workflows/ci.yml`, after the "Unit tests" step, add:

```yaml
      - name: Deep-sweep fence tool tests
        working-directory: .
        run: node --test skills/padsplit-message-responder/bin/vault-fence.test.mjs
```

(Note: this step runs from repo root, not `./roomos` — adjust `working-directory` accordingly since the workflow's default is `./roomos`.)

- [ ] **Step 6: Commit**

```bash
git add skills/padsplit-message-responder/bin/vault-fence.mjs skills/padsplit-message-responder/bin/vault-fence.test.mjs .github/workflows/ci.yml
git commit -m "deepsweep: roster + portfolio regenerators (TDD) + CI step"
```

---

### Task 10: Author `references/deep-sweep.md` — the sweep protocol

**Files:**
- Create: `skills/padsplit-message-responder/references/deep-sweep.md`

- [ ] **Step 1: Write the protocol doc**

Cover, in skill-instruction prose (the skill reads this file when entering sweep mode):

1. **Entry conditions** — read by SKILL.md when (a) the `_RECONCILE-NOW` sentinel exists at vault root, or (b) it is the nightly window (after 03:00 ET and no successful full sweep in `_RECONCILE-LOG.md` for the current date).
2. **The 4-stage walk** (spec §6): `/host/listings` (paginated) → per-property `/host/listing/<id>` → `/host/members` all tabs → per-member `/host/occupant-profile/<id>`. Exact navigation, what to extract per page, mapped to the §5 schema.
3. **Every write goes through the tool.** Concrete command templates the skill must use — never hand-edit:
   - `node ~/.codex/skills/padsplit-message-responder/bin/vault-fence.mjs migrate <file> --kind property` (first-touch)
   - `… frontmatter-set <file> --kind property --json '{"rooms":"6","status":"ACTIVE","last-swept":"<iso>"}'`
   - `… replace-region <file> roster --body-file /tmp/roster.md`
   - `… roster --vault <hub> --out members/_ROSTER.md` and `… rollup --vault <hub> --out _PORTFOLIO.md` at end of a full sweep.
4. **Pacing** — round-robin slices, 3–8 s jitter between page loads, longer pause between properties, target ≤1 burst-equivalent. Cite the retired-scraper lesson.
5. **Resume cursor** — read/write `_RECONCILE-STATE.md` (`last-property-id`, `last-stage`, `started-at`); on entry, if a state file exists with an incomplete run, resume from the cursor rather than restart.
6. **Session expiry** — on auth wall: persist work so far via the tool, append a `DEGRADED` block to `_RECONCILE-LOG.md`, P1 flag, stop cleanly.
7. **Ledger** — append a run block to `_RECONCILE-LOG.md` (started/completed, properties/members swept, diffs: added properties, members whose property/room changed, balance deltas > $50, rooms flipped occupied↔vacant, skipped pages).
8. **Snapshot** — only on a *complete* (non-resumed) sweep: `cp -R` property + dossier files into `_SNAPSHOT-YYYY-MM-DD/`, append to `_SNAPSHOT-INDEX.md`.
9. **On-demand cleanup** — delete `_RECONCILE-NOW` only after a complete sweep; if a sweep was already in progress when the sentinel appeared, ignore it and still delete on completion.
10. **Dry-run mode** — when invoked with dry-run intent, pass `--dry-run` to every tool call, collect the diffs, write a single `_RECONCILE-LOG.md` "DRY RUN PREVIEW" block, write nothing else.

- [ ] **Step 2: Self-review checklist (no test — this is skill prose)**

- Every spec §6 stage present with exact URLs.
- Every write path names a specific `vault-fence.mjs` verb — zero "edit the file" instructions.
- Resume + session-expiry + ledger + snapshot + sentinel-cleanup + dry-run all covered.
- No contradiction with `references/knowledge-hub.md` ownership (Task 11).

- [ ] **Step 3: Commit**

```bash
git add skills/padsplit-message-responder/references/deep-sweep.md
git commit -m "deepsweep: author the deep-sweep protocol reference"
```

---

### Task 11: Extend `references/knowledge-hub.md` with the fence-ownership contract

**Files:**
- Modify: `skills/padsplit-message-responder/references/knowledge-hub.md`

- [ ] **Step 1: Add a "Section Ownership" section**

Insert after the existing "## Property File Updates" section:

```markdown
## Section Ownership (Deep-Sweep Contract)

Two writers touch vault files: this reactive responder and the deep sweep
(`references/deep-sweep.md`). Regions are owned. A writer never edits a region
it does not own.

- **Sweep-owned:** YAML frontmatter (the canonical keys listed in
  `bin/vault-fence.mjs` `SWEEP_PROPERTY_KEYS` / `SWEEP_DOSSIER_KEYS`) and the
  `<!-- SWEEP:roster -->…<!-- /SWEEP:roster -->` region.
- **Responder-owned:** `## Interaction Log`, `## Flags & Alerts`,
  `## Open Maintenance Items`, and all dossier narrative sections.

When this reactive responder needs to record an observed status/balance change
for a member, it MUST NOT edit the `SWEEP:roster` table or sweep frontmatter
keys directly. Instead, append the observation to `## Interaction Log` and let
the next deep sweep reconcile the structured fields. The sweep is authoritative
for structured truth; the responder is authoritative for narrative.

If a file lacks the `SWEEP:roster` fence, do not add it here — the deep sweep's
migration owns fence insertion. Treat a fence-less file as legacy and use the
existing targeted-edit rules until the sweep migrates it.
```

- [ ] **Step 2: Update the existing "## Property File Updates" bullet that says "Update `## Current Members` only for observed status/balance changes"** — change it to point at the new ownership rule (responder appends to Interaction Log; sweep owns the roster).

- [ ] **Step 3: Self-review** — the contract here matches Task 10's tool commands and spec §4 exactly; no instruction tells the responder to write a sweep region.

- [ ] **Step 4: Commit**

```bash
git add skills/padsplit-message-responder/references/knowledge-hub.md
git commit -m "deepsweep: fence-ownership contract in knowledge-hub reference"
```

---

### Task 12: Wire sweep-mode trigger into `SKILL.md`

**Files:**
- Modify: `skills/padsplit-message-responder/SKILL.md`

- [ ] **Step 1: Add sweep detection to "## Start Of Run"**

After step 5 (load `_INDEX.md`), add:

```markdown
8. Check for deep-sweep mode. Read `references/deep-sweep.md` if either:
   - the file `_RECONCILE-NOW` exists at the vault root (on-demand trigger), or
   - it is past 03:00 America/New_York and `_RECONCILE-LOG.md` has no completed
     full-sweep block dated today (nightly baseline).
   If neither, skip deep-sweep this run and proceed with the normal inbox workflow.
```

- [ ] **Step 2: Add a top-level "## Deep Sweep Mode" section** (after "## Daily And Every-Run Sweeps")

```markdown
## Deep Sweep Mode

When entered (see Start Of Run step 8), the deep sweep reconciles the entire
PadSplit host account into the vault per `references/deep-sweep.md`. It runs
*in addition to* normal inbox work unless the run is dry-run only.

- All vault writes in sweep mode go through `bin/vault-fence.mjs` — never
  hand-edit frontmatter or a `SWEEP:` region.
- Honor the resume cursor (`_RECONCILE-STATE.md`); a sweep may span multiple
  runs when round-robin paced.
- Respect the Section Ownership contract in `references/knowledge-hub.md`:
  the sweep owns frontmatter + the roster fence and nothing else.
- A full sweep ends by regenerating `members/_ROSTER.md` and `_PORTFOLIO.md`
  and (if not resumed) writing a dated snapshot.
- The first production sweep MUST be dry-run; review the `_RECONCILE-LOG.md`
  preview before any real write (see `docs/superpowers/DEPLOYMENT-DEEPSWEEP.md`).
```

- [ ] **Step 3: Add the new reference to the "## References" list**

```markdown
- `references/deep-sweep.md`: nightly + on-demand full-portfolio reconciliation protocol, the 4-stage PadSplit walk, pacing, resume cursor, ledger/snapshots, and the vault-fence tool commands for all writes.
```

- [ ] **Step 4: Self-review** — Start-Of-Run trigger, Deep Sweep Mode section, and References entry are mutually consistent and consistent with Tasks 10–11. No instruction bypasses `vault-fence.mjs`.

- [ ] **Step 5: Commit**

```bash
git add skills/padsplit-message-responder/SKILL.md
git commit -m "deepsweep: SKILL.md sweep-mode trigger + section + reference"
```

---

### Task 13: Deploy-script hardening + `node --test` full-suite gate

**Files:**
- Modify: `skills/deploy.sh`
- Modify: `skills/padsplit-message-responder/bin/vault-fence.test.mjs`

- [ ] **Step 1: Add a pre-deploy test gate to `deploy.sh`**

```bash
# Before rsync, run the fence tool's tests; refuse to deploy on failure.
echo "Running vault-fence tests before deploy…"
node --test "$SRC/bin/vault-fence.test.mjs"
```

Place this immediately after `set -euo pipefail` and the `SRC`/`DEST` resolution, before `rsync`. `set -e` aborts the deploy if tests fail.

- [ ] **Step 2: Add a CLI smoke test asserting every verb is reachable**

```javascript
import { execFileSync } from "node:child_process"
test("CLI: parse verb runs on a fixture", () => {
  const out = execFileSync("node", [
    join(HERE, "vault-fence.mjs"), "parse", join(HERE, "fixtures", "property-fenced.md"),
  ], { encoding: "utf8" })
  const j = JSON.parse(out)
  assert.ok(j.hasFence)
  assert.ok("padsplit-property-id" in j.frontmatter)
})
```

- [ ] **Step 3: Run full suite, verify pass** (25 total)

```bash
node --test skills/padsplit-message-responder/bin/vault-fence.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add skills/deploy.sh skills/padsplit-message-responder/bin/vault-fence.test.mjs
git commit -m "deepsweep: deploy.sh pre-deploy test gate + CLI smoke test"
```

---

### Task 14: Finalize DEPLOYMENT-DEEPSWEEP.md (dry-run + first-real-sweep procedure)

**Files:**
- Modify: `docs/superpowers/DEPLOYMENT-DEEPSWEEP.md`

- [ ] **Step 1: Fill §2–§3 with the exact operator procedure**

```markdown
## 2. First run — DRY RUN ONLY

On the Mac Studio, with the skill deployed:

1. Trigger a dry-run sweep (no writes): create the sentinel AND a dry-run marker:
   \`\`\`bash
   touch ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-NOW
   touch ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-DRYRUN
   \`\`\`
   On its next run the skill enters sweep mode, sees `_RECONCILE-DRYRUN`, passes
   `--dry-run` to every `vault-fence.mjs` call, and writes only a
   `_RECONCILE-LOG.md` "DRY RUN PREVIEW" block.
2. Review `~/Documents/CoHost-Knowledge-Hub/_RECONCILE-LOG.md`. Confirm:
   - property count matches PadSplit `/host/listings`
   - the migration would touch every legacy file once (fence + canonical keys)
   - no responder-owned region appears in any diff
3. If wrong, fix and re-dry-run. Nothing has been written to vault files yet.

## 3. First real sweep

1. Remove the dry-run marker, keep the sentinel:
   \`\`\`bash
   rm ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-DRYRUN
   \`\`\`
2. The next run performs the real first sweep: one-time migration of all 57
   property files + 378 dossiers, then full reconciliation, then `_ROSTER.md` +
   `_PORTFOLIO.md`, then a dated snapshot. Expect 1–2 h, round-robin paced; it
   may span multiple runs via `_RECONCILE-STATE.md`.
3. The skill deletes `_RECONCILE-NOW` when the full sweep completes.
```

(Note: this introduces a `_RECONCILE-DRYRUN` marker — ensure Task 10's deep-sweep.md §10 and Task 12's SKILL.md trigger reference it. If they don't, this is a spec gap: add the dry-run marker check to deep-sweep.md before finalizing this task.)

- [ ] **Step 2: Cross-check Task 10/12 reference `_RECONCILE-DRYRUN`.** If missing, append to `references/deep-sweep.md` §10: "Dry-run is active when `_RECONCILE-DRYRUN` exists at vault root; pass `--dry-run` to every tool call and write only the preview block." Commit that fix too.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-DEEPSWEEP.md skills/padsplit-message-responder/references/deep-sweep.md
git commit -m "docs(deepsweep): finalize dry-run + first-real-sweep procedure"
```

---

### Task 15: End-to-end dry-run rehearsal + spot-check

**Files:**
- Modify: `docs/superpowers/DEPLOYMENT-DEEPSWEEP.md` (§4 smoke)

- [ ] **Step 1: Rehearse the tool against the real vault, read-only**

Without deploying, prove the tool is safe on real data using `--dry-run`:

```bash
cd skills/padsplit-message-responder/bin
# Pick 3 real property files + 2 dossiers; dry-run migrate each.
for f in ~/Documents/CoHost-Knowledge-Hub/1311-Morgana-Rd-Jacksonville-FL.md \
         ~/Documents/CoHost-Knowledge-Hub/733-Tarpon-Ave-Sarasota-FL.md \
         ~/Documents/CoHost-Knowledge-Hub/8506-Eaton-St-Arvada-CO.md; do
  echo "=== $f ===" 
  node vault-fence.mjs migrate "$f" --kind property --dry-run | head -30
done
# Confirm NOTHING changed:
git -C ~/Documents/CoHost-Knowledge-Hub status --porcelain 2>/dev/null | head || \
  echo "(vault not a git repo — verify mtimes unchanged)"
```

Expected: diffs show only fence insertion + canonical-key additions; zero changes to Interaction Log / Flags lines; the files themselves are unmodified (dry-run).

- [ ] **Step 2: Verify byte-exactness on a responder-owned region**

```bash
cd skills/padsplit-message-responder/bin
node -e 'const fs=require("node:fs");import("./vault-fence.mjs").then(m=>{const p=process.env.HOME+"/Documents/CoHost-Knowledge-Hub/1311-Morgana-Rd-Jacksonville-FL.md";const a=fs.readFileSync(p,"utf8");const b=m.migrate(a,"property");const il=s=>s.slice(s.indexOf("## Interaction Log"));console.log(il(a)===il(b)?"OK Interaction Log byte-identical":"FAIL Interaction Log changed")})'
```

Expected: `OK Interaction Log byte-identical`.

- [ ] **Step 3: Finalize DEPLOYMENT §4**

```markdown
## 4. Smoke test (after first real sweep)

1. `members/_ROSTER.md` — header date is today; member count matches PadSplit.
2. `_PORTFOLIO.md` — property/room/occupied/vacant totals are plausible vs PadSplit `/host/listings`.
3. Spot-check 3 properties (one full, one with vacant rooms, one onboarding):
   the `SWEEP:roster` table lists every room incl. vacant; `## Interaction Log`
   is byte-identical to its pre-sweep content (diff a snapshot copy).
4. Spot-check 3 dossiers (current / past-due / terminated): `property` is no
   longer null; balance + payment-tier + days-past-due populated.
5. Within ≤15 min, the RoomOS dashboard (`/properties`) reflects the fuller
   portfolio with zero RoomOS code change (Phase 2A adapter picked it up).
6. `_RECONCILE-LOG.md` last block: status complete, skipped pages = 0 (or
   explained), diffs sane.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/DEPLOYMENT-DEEPSWEEP.md
git commit -m "docs(deepsweep): finalize smoke test + record dry-run rehearsal"
```

---

## Self-review notes (post-write)

- **Spec coverage**: §3 architecture → Task 2 (repo import + deploy) + Task 12 (trigger). §4 ownership contract → Task 11 + enforced by Tasks 3–5 (tool). §5 schema → `SWEEP_*_KEYS` Task 5, roster/portfolio Task 9. §6 walk/pacing → Task 10. §7 migration → Task 7 + Task 15 rehearsal. §8 ledger/snapshots → Task 10 (protocol) — *note: ledger/snapshot are skill-prose operations, not tool verbs, by design; the tool stays a pure text editor.* §9 error handling → Task 10 (session expiry, markup skip, fence-collision="owner wins"=Task 5 behavior, unlinked-member gap-log). §10 testing → Tasks 3–9, 13, 15 + CI. §11 success criteria → Task 15 smoke. ✓
- **Placeholder scan**: no TBDs. Task 4 deliberately stubs `unifiedDiff`/`writeFileSync` import with the stub *named and shown*, completed in Task 6 — explicit, not a placeholder. ✓
- **Type/name consistency**: `parseVaultFile`, `replaceRegion`, `frontmatterSet`, `migrate`, `unifiedDiff`, `buildRoster`, `buildPortfolio`, `SWEEP_PROPERTY_KEYS`, `SWEEP_DOSSIER_KEYS` consistent across Tasks 3–9 and referenced verbs in Tasks 10/12. CLI verbs (`parse|replace-region|frontmatter-set|migrate|rollup|roster`) consistent between the file-structure table and Task 10's command templates. ✓
- **Found + fixed inline**: Task 14 surfaced a `_RECONCILE-DRYRUN` marker not present in §10 of the spec's protocol; Task 14 Step 2 explicitly patches `deep-sweep.md` so the trigger, protocol, and deployment doc agree. ✓

---

**Next:** after this ships and the first real sweep completes, the Phase 2A adapter delivers the fuller portfolio to the dashboard automatically. Phase 2B (Airbnb) and 2C (REI Hub) plans remain independent.
