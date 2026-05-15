# PadSplit Portfolio Deep-Sweep Protocol

**Read this file when entering deep-sweep mode.** It governs every decision the skill makes during a sweep run. Follow it exactly — it is the single source of truth for sweep behavior.

---

## 1. Entry Conditions

Check these conditions at the start of every skill run, in order:

**Dry-run flag:** Check whether `_RECONCILE-DRYRUN` exists at the vault root. If it does, set `DRY_RUN=true` for this run. Every `vault-fence.mjs` call throughout the sweep MUST include `--dry-run`. In dry-run mode write only the DRY RUN PREVIEW block described in §11 — no fence writes, no frontmatter writes, no roster or rollup files, no snapshot. Do NOT delete `_RECONCILE-NOW` or `_RECONCILE-DRYRUN` in dry-run mode.

**Trigger check:** A deep sweep runs when EITHER condition is true:

- **(a) On-demand:** `_RECONCILE-NOW` exists at the vault root. Run the full sweep immediately.
- **(b) Nightly baseline:** The local time is past 03:00 America/New_York AND `_RECONCILE-LOG.md` contains no completed full-sweep block dated today (look for a `completed:` timestamp whose date matches today in ISO format).

If neither condition is true, skip deep sweep for this run and proceed with normal reactive processing.

**Resume check:** Before starting, check whether `_RECONCILE-STATE.md` exists at the vault root with an `in-progress` status. If it does, resume from the recorded cursor (see §5) rather than restarting from Stage 1.

---

## 2. Section-Ownership Contract

Sweep owns structured truth. The responder owns narrative. These are strict, non-negotiable boundaries.

| Region | Owner |
|---|---|
| YAML frontmatter | **Sweep** (keys defined by `SWEEP_PROPERTY_KEYS` / `SWEEP_DOSSIER_KEYS`) |
| `<!-- SWEEP:roster -->` … `<!-- /SWEEP:roster -->` | **Sweep** |
| `## Flags & Alerts` | Responder — sweep never touches |
| `## Interaction Log` | Responder — sweep never touches |
| `## Open Maintenance Items` | Responder — sweep never touches |
| Dossier narrative sections (Tone History, Reliability, Complaints, Escalation, Interaction Log) | Responder — sweep never touches |

The canonical frontmatter key sets are `SWEEP_PROPERTY_KEYS` and `SWEEP_DOSSIER_KEYS` in `bin/vault-fence.mjs`. Do not maintain a separate list here — read them from the source.

---

## 3. Every Write Goes Through the Tool

**Rule: NEVER hand-edit frontmatter or a `SWEEP:` region directly.** Always shell out to `bin/vault-fence.mjs`. The tool guarantees byte-exactness of sweep-owned regions and enforces ownership boundaries. A direct edit bypasses these guarantees and risks clobbering responder-owned content.

The `<skilldir>` variable below refers to the absolute path of the `padsplit-message-responder` skill directory. Substitute it in every command.

Command templates:

```bash
# Inspect a file (non-destructive, always safe)
node <skilldir>/bin/vault-fence.mjs parse <file>

# First-touch migration (insert fence + canonical frontmatter keys)
node <skilldir>/bin/vault-fence.mjs migrate <file> --kind property [--dry-run]
node <skilldir>/bin/vault-fence.mjs migrate <file> --kind dossier [--dry-run]

# Write sweep-owned frontmatter fields
node <skilldir>/bin/vault-fence.mjs frontmatter-set <file> --kind property --json '<kvjson>' [--dry-run]
node <skilldir>/bin/vault-fence.mjs frontmatter-set <file> --kind dossier --json '<kvjson>' [--dry-run]

# Replace the roster fence body
node <skilldir>/bin/vault-fence.mjs replace-region <file> roster --body-file /tmp/roster-<id>.md [--dry-run]

# Regenerate global files
node <skilldir>/bin/vault-fence.mjs roster --vault <hub> --out members/_ROSTER.md [--dry-run]
node <skilldir>/bin/vault-fence.mjs rollup --vault <hub> --out _PORTFOLIO.md [--dry-run]
```

When `DRY_RUN=true`, append `--dry-run` to every call above without exception.

---

## 4. The 4-Stage Walk

Work through the four stages in order. Update `_RECONCILE-STATE.md` at each stage boundary (see §5).

### Stage 1 — Property Enumeration

URL: `https://www.padsplit.com/host/listings` (paginated — follow all pages)

For each property discovered:

1. Record: property ID, address, market, state, room count, status (`ACTIVE`/`INACTIVE`/`ONBOARDING`/`PENDING`).
2. Locate or create the property file in the vault (filename derived from address/ID per existing vault convention).
3. **First-touch migration** — run migrate unconditionally; it is idempotent and skips files already migrated:
   ```bash
   node <skilldir>/bin/vault-fence.mjs migrate <propertyFile> --kind property [--dry-run]
   ```
4. Write the enumerated frontmatter:
   ```bash
   node <skilldir>/bin/vault-fence.mjs frontmatter-set <propertyFile> --kind property \
     --json '{"padsplit-property-id":"<id>","address":"<address>","market":"<market>","state":"<state>","rooms":"<count>","status":"<STATUS>","last-swept":"<iso>"}' \
     [--dry-run]
   ```

Pause 3–8 s between page loads (see §7 on pacing). After exhausting all pages, write `stage: 1-complete` to `_RECONCILE-STATE.md`.

### Stage 2 — Room Roster Per Property

URL: `https://www.padsplit.com/host/listing/<id>` — one request per property

For each property, visit its listing detail page and extract every room, including vacant rooms. Build a markdown table of rooms with columns for: room number, status (`OCCUPIED`/`VACANT`/`MOVING_IN`/`MOVING_OUT`/`NEEDS_FLIP`/`INACTIVE`), weekly rate, current member name (or `— vacant —`), and member balance.

Write the roster table to a temp file, then replace the fence:

```bash
# Write table to temp file
cat > /tmp/roster-<id>.md <<'ROSTER'
<markdown table rows>
ROSTER

# Replace the fence
node <skilldir>/bin/vault-fence.mjs replace-region <propertyFile> roster \
  --body-file /tmp/roster-<id>.md [--dry-run]
```

Pause between properties (longer than between pages — see §7). After all properties, write `stage: 2-complete` to `_RECONCILE-STATE.md`.

### Stage 3 — Full Member Roster

URL: `https://www.padsplit.com/host/members`

Visit all four tabs in sequence: **Active**, **Moving in**, **Moving out**, **Past due**. For each member record: member ID, name, room, property, status. This produces the complete cross-property member list with property linkage established. After all tabs, write `stage: 3-complete` to `_RECONCILE-STATE.md`.

### Stage 4 — Member Financial Truth

URL: `https://www.padsplit.com/host/occupant-profile/<id>` — one request per member

For each member from Stage 3:

1. Locate or create the dossier file in `members/` (filename derived from member name/ID per existing vault convention).
2. **First-touch migration** — idempotent:
   ```bash
   node <skilldir>/bin/vault-fence.mjs migrate <dossierFile> --kind dossier [--dry-run]
   ```
3. Write financial frontmatter. **Critically: always populate `property` — this fixes the `property: null` gap that makes portfolio rollups incomplete.** Use the property linkage established in Stage 3; if no property could be resolved, write `"property": null` AND add the member to `_GAP-LOG.md` (see §9):
   ```bash
   node <skilldir>/bin/vault-fence.mjs frontmatter-set <dossierFile> --kind dossier \
     --json '{"member-id":"<id>","name":"<name>","status":"<status>","balance":"<balance>","payment-tier":"<tier>","days-past-due":"<days>","room":"<room>","property":"<propertyId>","move-in-date":"<date>","weekly-rate":"<rate>","move-in-fee":"<fee>","last-payment-date":"<date>","last-payment-amount":"<amount>","phone":"<phone>","email":"<email>","rating":"<rating>","last-swept":"<iso>"}' \
     [--dry-run]
   ```

After all members, write `stage: 4-complete` to `_RECONCILE-STATE.md`.

### End-of-Sweep Global Files

After Stage 4 completes, regenerate the two global files:

```bash
node <skilldir>/bin/vault-fence.mjs roster --vault <hub> --out members/_ROSTER.md [--dry-run]
node <skilldir>/bin/vault-fence.mjs rollup --vault <hub> --out _PORTFOLIO.md [--dry-run]
```

This replaces the frozen Apr-19 roster snapshot with a current authoritative roster, and produces `_PORTFOLIO.md` as a one-screen rollup of the full portfolio.

---

## 5. Resume Cursor

`_RECONCILE-STATE.md` at the vault root tracks progress for a running or incomplete sweep.

**Format:**

```yaml
started-at: <iso>
status: in-progress | complete
stage: 0 | 1-complete | 2-complete | 3-complete | 4-complete
last-property-id: <id>
last-member-id: <id>
```

**On entry:** If `_RECONCILE-STATE.md` exists with `status: in-progress`, read `stage` and `last-property-id`/`last-member-id`. Resume from where the previous run stopped — skip properties/members already processed.

**During a run:** Update `last-property-id` and `last-member-id` after each successful file write. Update `stage` at each stage boundary.

**On completion:** Set `status: complete` then delete `_RECONCILE-STATE.md`. A clean vault root (no cursor file) means the last sweep finished fully.

---

## 6. Session Expiry

If PadSplit presents an authentication wall mid-sweep:

1. Persist all work gathered so far: flush any in-progress temp files through the tool before stopping. **Never leave a partial fence write** — either the fence is updated via the tool or it is unchanged.
2. Append a `DEGRADED` block to `_RECONCILE-LOG.md` recording the point of failure (which stage, which property/member ID was being processed, timestamp).
3. Append a `P1` flag to `_RUN-LOG.md` indicating auth re-authentication required.
4. Write the current cursor to `_RECONCILE-STATE.md` with `status: in-progress` so the next run resumes from this point.
5. Stop the sweep cleanly. Do not attempt to continue past the auth wall.

---

## 7. Pacing

**Round-robin slices with jitter.** The retired Phase 1B Playwright scraper's hard-won lesson: brittle bursts trip bot detection. The deep sweep replaces it entirely, and must not repeat that mistake.

Rules:
- Wait 3–8 seconds (random jitter) between consecutive page loads within a stage.
- Wait a longer pause (15–30 seconds) between finishing one property and starting the next.
- Never issue back-to-back requests with no delay.
- A full nightly run may take 1–2 hours; this is expected and acceptable at 03:00 ET. Do not rush.

The pacing is not optional. A sweep that triggers bot detection fails the whole portfolio.

---

## 8. Markup-Change Resilience

If a property or member page cannot be parsed (markup changed, element missing, unexpected structure):

1. Skip that specific page only — do not abort the sweep.
2. Record `{page: "<url>", reason: "<description>"}` as a skipped entry in the current run's `_RECONCILE-LOG.md` block.
3. Continue with the next property or member.

A member with no resolvable property linkage (cannot determine which property they live in from the page content):
- Still write the dossier with `"property": null` via `frontmatter-set`.
- Add the member name and dossier file path to the `_GAP-LOG.md` "unlinked members" section for tracking.

Never let a single bad page abort the entire sweep.

---

## 9. Reconciliation Ledger

Append a run block to `_RECONCILE-LOG.md` at the end of every sweep attempt. The block format:

```
## Sweep Run — <iso timestamp>

started: <iso>
completed: <iso>   ← present only on a fully complete run
status: complete | degraded | dry-run-preview

properties-swept: <count>
members-swept: <count>

### Diffs
- Properties added: <list or "none">
- Members with changed property/room: <list or "none">
- Balance deltas > $50: <list of member + delta or "none">
- Rooms flipped occupied↔vacant: <list or "none">

### Pages Skipped
<list of {page, reason} or "none">

### Migration
<list of files migrated on this run, or "none">
```

For a dry-run, replace the diffs section with the unified diff preview (see §11). Do not write a `completed` timestamp or status `complete` for a dry-run.

---

## 10. Snapshot

Take a snapshot only on a COMPLETE, non-resumed, non-dry-run sweep.

```bash
cp -R <propertyFiles> <dossierFiles> _SNAPSHOT-<YYYY-MM-DD>/
```

Append an entry to `_SNAPSHOT-INDEX.md`:

```
- _SNAPSHOT-<YYYY-MM-DD>/ — <iso timestamp> — <properties count> properties, <members count> members
```

This mirrors the vault's existing snapshot convention (`_SNAPSHOT-2026-04-25/`, `_SNAPSHOT-2026-04-26/`, `_SNAPSHOT-2026-04-30/`) and provides a point-in-time rollback source.

Do NOT take a snapshot for:
- Resumed sweeps (partial state — the snapshot would be incomplete)
- Dry-run sweeps (nothing was written)
- Degraded sweeps that stopped early due to session expiry

---

## 11. Dry-Run Mode

When `_RECONCILE-DRYRUN` exists at the vault root (`DRY_RUN=true`):

1. Pass `--dry-run` to every `vault-fence.mjs` call. The tool emits unified diffs to stdout instead of writing files.
2. Collect all emitted diffs across all four stages.
3. Write a single `_RECONCILE-LOG.md` "DRY RUN PREVIEW" block aggregating the collected diffs:

   ```
   ## DRY RUN PREVIEW — <iso timestamp>

   status: dry-run-preview
   started: <iso>

   The following changes WOULD be made on a real sweep:

   ### Property frontmatter diffs
   <aggregated unified diffs for property files>

   ### Roster fence diffs
   <aggregated unified diffs for roster regions>

   ### Dossier frontmatter diffs
   <aggregated unified diffs for dossier files>

   ### Global file diffs
   <unified diff for members/_ROSTER.md>
   <unified diff for _PORTFOLIO.md>
   ```

4. Write nothing else — no fence updates, no frontmatter writes, no roster/rollup files, no snapshot.
5. Leave `_RECONCILE-NOW` and `_RECONCILE-DRYRUN` in place. Do not delete either sentinel.

The dry-run preview is what Jordan reviews before approving the first real sweep.

---

## 12. On-Demand Cleanup

Delete `_RECONCILE-NOW` ONLY after a COMPLETE, real (non-dry-run) sweep.

- If a sweep was already in progress when `_RECONCILE-NOW` appeared: ignore the sentinel during the running sweep; delete it when that sweep completes normally.
- If the sweep ends in a `DEGRADED` state (session expiry): do NOT delete `_RECONCILE-NOW`. Leave it in place so the next run re-triggers.
- In dry-run mode: leave `_RECONCILE-NOW` in place always.

---

## Quick Reference

| Sentinel file | Meaning | Sweep action |
|---|---|---|
| `_RECONCILE-NOW` | On-demand trigger | Delete on complete real run; leave otherwise |
| `_RECONCILE-DRYRUN` | Dry-run flag | Never delete |
| `_RECONCILE-STATE.md` | Resume cursor | Delete on complete run; update on each write |
| `_RECONCILE-LOG.md` | Append-only ledger | Append each run block |
| `_GAP-LOG.md` | Unlinked members + structural gaps | Append unresolved members |
| `_RUN-LOG.md` | Operational flags | Append P1 on session expiry |
| `_SNAPSHOT-INDEX.md` | Snapshot manifest | Append on complete non-resumed real run |
