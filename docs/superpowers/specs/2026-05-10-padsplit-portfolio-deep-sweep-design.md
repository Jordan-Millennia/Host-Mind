# PadSplit Portfolio Deep-Sweep — Design

**Status:** Approved (2026-05-10)
**Operator:** Jordan Ruvalcaba / CoHost Management
**Problem:** The CoHost Knowledge Hub vault is a *reactive cache*, not a systematic mirror. It is maintained by the `padsplit-message-responder` skill, which only touches a property/member/room when that member appears in the PadSplit inbox. Properties and members with no recent inbox activity are stale or missing. The vault is therefore an incomplete dataset for the PadSplit portfolio.
**Goal:** Make the vault a faithful, periodically-reconciled mirror of the *entire* PadSplit host account — full property/room enumeration (including vacant rooms), member completeness with correct property linkage, and financial truth — without rebuilding the brittle Phase 1B scraper and without the reactive responder and the reconciler clobbering each other's work.

---

## 1. Evidence of the gap (why this is needed)

- `members/_ROSTER.md` is frozen at "143 members, Apr 19 scrape" — the last *comprehensive* PadSplit pull. 378 dossier files have since accumulated reactively with no current authoritative roster.
- Many member dossiers carry `property: null` — the system knows the member's name, room, balance, but not which property they live in. This breaks every portfolio-level rollup.
- Property files are created on-demand; `_GAP-LOG.md` tracks "needs property file" entries discovered reactively. 57 property files exist for a ~60-property PadSplit portfolio, and existing files often list only rooms whose members messaged — vacant/quiet rooms are invisible.
- No process enumerates `padsplit.com/host`'s full property → room → member → financial tree on a cadence. The retired RoomOS Phase 1B Playwright scraper attempted this and was killed for brittleness; nothing replaced its discovery function.

## 2. Goals & non-goals

**Goals**
- The vault becomes a periodically-reconciled mirror of the full PadSplit host account: every property, every room (occupied *and* vacant), every member with correct property linkage, and per-member financial truth.
- Reconciliation is an additive capability of the *existing* `padsplit-message-responder` skill (a new "deep-sweep" mode), not a new process.
- Nightly baseline (03:00 ET) plus an on-demand trigger; internally round-robin paced so no single burst looks bot-like.
- The reactive responder and the deep sweep write the same `.md` files without clobbering each other, via an explicit section-ownership contract.
- A current authoritative `_ROSTER.md` and a new `_PORTFOLIO.md` rollup are regenerated every sweep.
- Downstream is free: the existing Phase 2A vault→Postgres adapter turns a complete vault into a complete RoomOS dashboard with zero RoomOS changes.

**Non-goals**
- Airbnb portfolio (Phase 2B, separate). This sweep is PadSplit-only.
- REI Hub / long-term lease (Phase 2C).
- Changing RoomOS code. The payoff is entirely from a more-complete vault flowing through the existing Phase 2A adapter.
- Replacing the reactive responder. Real-time inbox-driven updates stay exactly as they are.
- Resurrecting the Phase 1B Playwright scraper. The deep sweep uses the responder's existing Computer-Use / Claude-in-Chrome session — not brittle Playwright selectors.

## 3. Architecture & data flow

```
   PadSplit host account (authoritative for the full portfolio)
        │
        ├─◀ reactive  ── padsplit-message-responder (every ~15 min, inbox-driven)
        │                  writes: Interaction Log, narrative Flags, tone/voice
        │
        └─◀ deep sweep ── padsplit-message-responder :: SWEEP MODE  ← NEW
                            nightly 03:00 ET + on-demand trigger
                            internally round-robin paced
                            writes: frontmatter + full room roster + financial fields
        ▼
   CoHost Knowledge Hub vault  (the mirror — section-fenced .md files)
        ▼
   RoomOS Phase 2A vault→Postgres adapter  (every 15 min, already shipping)
        ▼
   Railway Postgres → RoomOS dashboard  (already shipping)
```

The sweep is a new *mode* of the existing skill, reusing its authenticated PadSplit session, vault write protocols, run logging, and guardrails. The on-demand trigger and the nightly run are the same code path.

## 4. Section-ownership contract

Every property file and member dossier carries fenced regions. **Sweep owns structured truth; responder owns narrative.** A writer that does not own a region must never modify it. Each writer reads the whole file, replaces only its owned regions, and writes back — never a blind overwrite.

| Region | Owner | Contents |
|---|---|---|
| YAML frontmatter | **Sweep** | property: `padsplit-property-id`, `address`, `market`, `state`, `rooms`, `status`, `last-swept` · dossier: `member-id`, `status`, `balance`, `payment-tier`, `days-past-due`, `room`, `property`, `move-in-date`, `weekly-rate`, `move-in-fee`, `last-payment-date`, `last-payment-amount`, `phone`, `email`, `rating`, `last-swept` |
| `<!-- SWEEP:roster -->` … `<!-- /SWEEP:roster -->` | **Sweep** | Full per-property room table: every room incl. vacant, current member or `— vacant —`, weekly rate, member balance, room status |
| `## Flags & Alerts` | **Responder** | Narrative operational flags (unchanged) |
| `## Interaction Log` | **Responder** | Append-only conversation history (sweep never touches) |
| `## Open Maintenance Items` | **Responder** | Unchanged |
| Dossier narrative sections (Tone History, Reliability, Complaints, Escalation, Interaction Log) | **Responder** | Unchanged |

If a fence is missing on an existing file, the sweep's first pass inserts it idempotently (see §7 migration).

## 5. Canonical schema

**Per property** (frontmatter + roster fence):
- `padsplit-property-id`, `address`, `market`, `state`
- `rooms` — true total room count from the listing page (not "rows that had a member")
- `status` — `ACTIVE` / `INACTIVE` / `ONBOARDING` / `PENDING`
- `last-swept` — ISO timestamp of last successful sweep of this property

**Per room** (the roster fence — rooms become first-class, vacant included):
- `room_number`, `status` (`OCCUPIED`/`VACANT`/`MOVING_IN`/`MOVING_OUT`/`NEEDS_FLIP`/`INACTIVE`)
- `weekly_rate`, current member name (or `— vacant —`), member balance

**Per member** (dossier frontmatter):
- `member-id` (PadSplit occupant ID), `name`, `status`
- `property` — the linkage currently `null` everywhere
- `room`, `move-in-date`, `weekly-rate`, `move-in-fee`
- `balance`, `payment-tier`, `days-past-due`, `last-payment-date`, `last-payment-amount`
- `phone`, `email`, `rating`, `last-swept`

**Global** (regenerated every sweep):
- `members/_ROSTER.md` — current authoritative roster, replacing the frozen Apr-19 snapshot
- `_PORTFOLIO.md` — new one-screen rollup: properties, total rooms, occupied/vacant counts, total past-due, member count, last full-sweep completion time

## 6. The deep-sweep walk & pacing

PadSplit pages walked, in order:

1. **`/host/listings`** (paginated) → enumerate every property + room count + status. Create missing property files; update `rooms`/`status` frontmatter.
2. **`/host/listing/<id>`** per property → every room with status + rate + occupant, **including vacant rooms**. Write the roster fence.
3. **`/host/members`** across all tabs (Active / Moving in / Moving out / Past due) → full member roster with room + property linkage.
4. **`/host/occupant-profile/<id>`** per member → balance, payment tier, days past due, last payment. Write dossier financial frontmatter.

**Pacing (anti-bot — the retired scraper's hard-won lesson):**
- Internally round-robin: process the portfolio in slices with 3–8 s jitter between page loads and a longer pause between properties — never a tight burst.
- A nightly run may take 1–2 h; acceptable at 03:00 ET, paced deliberately.
- Resumable: a `_RECONCILE-STATE.md` cursor records progress; an interrupted sweep resumes mid-portfolio next run rather than restarting.
- Session-expiry aware: if PadSplit logs out mid-sweep, log the gap, write what was gathered, flag for re-auth — same pattern the responder already uses.
- On-demand trigger: a sentinel file `_RECONCILE-NOW` at the vault root (or a RoomOS "Reconcile now" action that creates it). The skill checks for it each normal run; if present, it runs the full sweep immediately and deletes the sentinel on completion.

## 7. One-time migration

The first *real* sweep run (the dry-run of §10 writes nothing) performs an idempotent migration over the 57 existing property files and 378 dossiers:
- If the `<!-- SWEEP:roster -->` fence is absent, insert it immediately after the property's existing "Current Members" heading (or after frontmatter if no such heading), wrapping any existing member table so the sweep can take ownership going forward.
- Normalize frontmatter keys to the §5 canonical names (e.g. ensure `property`, `member-id`, `days-past-due` exist; backfill `null` where unknown so the schema is uniform).
- Migration is detectable-and-skip: a file already carrying the fence + canonical frontmatter is left untouched on subsequent runs.
- Each migrated file is recorded in `_RECONCILE-LOG.md` so the first run's structural changes are auditable.

## 8. Reconciliation ledger & snapshots

- **`_RECONCILE-LOG.md`** — append-only. Each sweep appends a run block: started/completed timestamps, properties swept, members swept, diffs detected (properties added, members whose `property`/`room` changed, balance deltas over a threshold, rooms that flipped occupied↔vacant), and any pages skipped due to session expiry.
- **Dated snapshot** — on a successful *full* sweep (not a resumed partial), drop a `_SNAPSHOT-YYYY-MM-DD/` copy of the reconciled property + dossier set, mirroring the vault's existing snapshot convention (`_SNAPSHOT-2026-04-25/26/30`). Keeps a point-in-time audit trail and a rollback source.

## 9. Error handling

- **Session expiry mid-sweep:** persist work-so-far, write a `P1` flag to `_RUN-LOG.md` and `_RECONCILE-LOG.md`, stop the sweep cleanly (do not partial-write fences), resume from the `_RECONCILE-STATE.md` cursor next run.
- **PadSplit markup change / unparseable page:** skip that one property or member, record `{page, reason}` in `_RECONCILE-LOG.md`, continue the sweep. Never abort the whole run for one bad page.
- **Fence collision (responder edited a sweep region, or vice versa):** the owning writer's value wins on its next pass; the discarded foreign edit is logged to `_RECONCILE-LOG.md` so drift is visible. Section ownership is strict — there is no merge of conflicting edits within a region.
- **Member with no resolvable property:** still write the dossier with `property: null` but add it to a `_GAP-LOG.md` "unlinked members" section so the gap is tracked rather than silent (current behavior makes this invisible).
- **On-demand sentinel present but a sweep is already running:** ignore the sentinel; the in-flight sweep already produces a fresh full picture. Delete the sentinel when that sweep completes.

## 10. Testing

The deep-sweep logic is part of the Codex skill, not the RoomOS TypeScript codebase, so testing is fixture- and dry-run-based:

- **Parser fixtures:** captured HTML of `/host/listings`, `/host/listing/<id>`, `/host/members` (each tab), `/host/occupant-profile/<id>` stored under the skill's `references/` or a `fixtures/` dir. Unit-style assertions: a known listings fixture yields the expected property+room enumeration; a known occupant fixture yields the expected balance/tier/days-past-due.
- **Fence-merge tests:** given a property file with existing responder content (Interaction Log, Flags) and a stale roster fence, applying the sweep replaces only the fence and frontmatter and leaves every responder region byte-identical. Reverse: a responder write leaves the fence + frontmatter byte-identical.
- **Idempotency:** running the sweep twice over the same fixture vault produces zero diffs on the second run (migration detects-and-skips; fences stable).
- **Dry-run mode:** a `--dry-run` flag walks PadSplit and computes diffs but writes nothing except a `_RECONCILE-LOG.md` preview block — used for the first production run so Jordan can review what *would* change before the first real write.
- **Spot-check:** after the first real sweep, three properties verified by hand against PadSplit (one fully occupied, one with vacant rooms, one onboarding) and three dossiers (one current, one past-due, one terminated).

## 11. Success criteria

This ships when:
- The first dry-run produces a `_RECONCILE-LOG.md` preview that Jordan reviews and approves.
- The first real sweep makes every property file carry the canonical frontmatter + roster fence, every dossier carry the canonical financial frontmatter with a non-null `property`, and regenerates `_ROSTER.md` + `_PORTFOLIO.md`.
- Every PadSplit property is represented (count matches `/host/listings`); every room incl. vacant appears in its property's roster fence.
- Zero responder-owned regions changed by the sweep (verified by diffing a property file's Interaction Log before/after).
- A subsequent reactive responder run leaves all sweep-owned regions byte-identical.
- The nightly schedule + on-demand sentinel both trigger the same sweep code path.
- Within one Phase 2A adapter cycle (≤15 min) of a sweep, the RoomOS dashboard reflects the newly-complete portfolio with no RoomOS code change.

## 12. References

- `~/Documents/CoHost-Knowledge-Hub/` — the vault (mirror target).
- `~/.codex/skills/padsplit-message-responder/SKILL.md` + `references/knowledge-hub.md` + `references/message-playbook.md` — the skill the sweep mode extends; existing vault write protocol.
- `docs/superpowers/specs/2026-05-08-roomos-vault-fed-pivot-design.md` — the Phase 2A pipeline the complete vault flows into.
- `_GAP-LOG.md`, `_RUN-LOG.md`, `_SNAPSHOT-INDEX.md` — existing vault ledgers the sweep extends/follows.
