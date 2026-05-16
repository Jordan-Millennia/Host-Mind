<!-- docs/superpowers/DEPLOYMENT-DEEPSWEEP.md -->
# PadSplit Portfolio Deep-Sweep — Deployment

## 0. Lineage divergence (READ FIRST — important)

There are **two separate lineages** of `padsplit-message-responder`:

| | Codex lineage | **Cowork lineage (the one Jordan runs)** |
|---|---|---|
| Location | `~/.codex/skills/padsplit-message-responder/` | `~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<uuid>/<uuid>/skills/padsplit-message-responder/` |
| Structure | `references/*.md` + `bin/` (lowercase) | flat **UPPERCASE** (`DOSSIERS.md`, `LOCKS.md`, …), 72 KB `SKILL.md` |
| Invoked as | "when Jordan asks **Codex**" | `anthropic-skills:padsplit-message-responder` in **Claude Cowork** |
| Repo copy? | yes — `skills/padsplit-message-responder/` is this lineage | **no** — maintained in place; export is the `.skill` bundle |

The deep-sweep was originally built into the **Codex** lineage. Jordan runs the
**Cowork** lineage, so the capability was ported there in place. The two
`SKILL.md` files are genuinely different documents — **`deploy.sh` must never
overwrite the Cowork `SKILL.md` with the repo one.** Only the lineage-neutral
payload (`vault-fence.mjs`, `DEEP-SWEEP.md`) is synced into Cowork.

> **Open architectural decision for Jordan:** long-term, pick one source of
> truth. Options: (a) keep Cowork in-place + repo holds only the neutral
> payload + this doc (current state); (b) vendor the full Cowork `SKILL.md`
> into the repo as its own lineage so both are version-controlled. Not
> blocking — current state is fully functional.

## Current state (already done in this work)

- **Vault migration APPLIED for real.** 391/435 files now carry canonical
  sweep frontmatter + `<!-- SWEEP:roster -->` fences. Proven additive: 0
  deletions across all 435 files vs backup. 44 files have no YAML frontmatter
  (legacy stubs / case-variant dupes / misfiled notes) — left for the scrape
  to backfill or route to `_GAP-LOG.md`.
- **Pre-migration vault backup:** `~/CoHost-Vault-Backups/CoHost-Knowledge-Hub.pre-migration-20260515-211647.tar.gz` (verified). Rollback in `/tmp/vault-backup-path.txt`.
- **Cowork skill ported + verified:** `DEEP-SWEEP.md` + `vault-fence.mjs` placed
  in the live skill dir; `SKILL.md` got two additive insertions (trigger
  "### 4b. DEEP-SWEEP TRIGGER CHECK" + the Section-Ownership guardrail), 0
  deletions, frontmatter intact, 25/25 vault-fence tests pass, deployed
  `vault-fence.mjs` byte-identical to tested source.
- **Live skill backup:** `~/CoHost-Vault-Backups/cowork-padsplit-skill.pre-deepsweep-20260516-104625.tar.gz`. Path in `/tmp/cowork-skill-backup-path.txt`.
- **Durable re-upload artifact:** `~/Downloads/padsplit-message-responder.deepsweep-YYYYMMDD.skill` (re-emitted by `deploy.sh`).
- **Sentinels armed at vault root:** `_RECONCILE-NOW` present, `_RECONCILE-DRYRUN`
  REMOVED — so the next sweep is a **real** run (migration stage now a no-op).

## 1. Re-deploy (idempotent, safe to re-run anytime)

```bash
cd <repo> && ./skills/deploy.sh
```

Runs the 25-test gate, syncs the Codex lineage, **discovers** the Cowork skill
dir and syncs the neutral payload (never touches Cowork `SKILL.md`), and
re-emits the durable `.skill` bundle. If the Cowork dir ever resets, re-upload
the `.skill` bundle from `~/Downloads/` and re-run `deploy.sh`.

## 2. Run the sweep — in Claude Cowork (NOT Codex / Mac Studio)

The sweep runs wherever the Cowork skill runs (Claude desktop, this machine).
It needs the live PadSplit host session in the browser and is long-running
(1–2 h, round-robin paced) — drive it with Jordan present, or let a scheduled
skill run pick it up.

- **Sentinels are already set for a REAL first sweep.** To make the first
  sweep a safe **dry-run preview** instead (recommended if not reviewed yet):
  ```bash
  touch ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-DRYRUN
  ```
  Then invoke `anthropic-skills:padsplit-message-responder`. It reads
  `DEEP-SWEEP.md`, sees the dry-run flag, passes `--dry-run` everywhere,
  writes only the `_RECONCILE-LOG.md` "DRY RUN PREVIEW" block, sends no
  messages, deletes no sentinel.
- **Real sweep (current armed state):** invoke the skill with only
  `_RECONCILE-NOW` present. The migration stage is a no-op (already applied);
  it scrapes PadSplit, backfills frontmatter + roster fences, routes unlinked
  / no-frontmatter members to `_GAP-LOG.md` (never auto-merge/delete),
  regenerates `members/_ROSTER.md` + `_PORTFOLIO.md`, writes a dated
  `_SNAPSHOT-*/`, then deletes `_RECONCILE-NOW` on full completion. Resumes
  via `_RECONCILE-STATE.md` if it spans runs or hits a session wall.

## 3. Review gate

Review `~/Documents/CoHost-Knowledge-Hub/_RECONCILE-LOG.md`:
- property count matches PadSplit `/host/listings`
- no responder-owned region (`## Interaction Log`, `## Flags & Alerts`,
  `## Open Maintenance Items`, dossier narrative) appears in any diff
- `_GAP-LOG.md` lists the 44 no-frontmatter / unlinked files for sign-off —
  nothing auto-merged or deleted

## 4. Smoke test (after the first real sweep)

1. `members/_ROSTER.md` — `**Last Updated:**` today; member count plausible vs PadSplit `/host/members`.
2. `_PORTFOLIO.md` — property / rooms / occupied / vacant totals plausible vs `/host/listings`.
3. Spot-check 3 properties: `<!-- SWEEP:roster -->` table lists every room incl. vacant; `## Interaction Log` byte-identical to a `_SNAPSHOT-*/` copy (only frontmatter + roster fence differ).
4. Spot-check 3 dossiers (current / past-due / terminated): `property` no longer `null`; `balance`, `payment-tier`, `days-past-due` populated.
5. Within ≤15 min RoomOS `/properties` reflects the fuller portfolio with ZERO RoomOS code change (Phase 2A vault→Postgres adapter picks it up).
6. `_RECONCILE-LOG.md` last block: status complete; skipped pages 0 (or each explained).
7. Sanity SQL on the RoomOS DB the adapter feeds:
   ```sql
   SELECT count(*) FROM properties WHERE padsplit_property_id IS NOT NULL;
   SELECT count(*) FROM members WHERE member_dossier_path IS NOT NULL;
   ```
   Both counts should rise vs the pre-sweep baseline.

## 5. Rollback

- **Vault:** `rm -rf ~/Documents/CoHost-Knowledge-Hub && tar xzf "$(cat /tmp/vault-backup-path.txt)" -C ~/Documents`
- **Cowork skill:** restore from `$(cat /tmp/cowork-skill-backup-path.txt)` (extract over the live skill dir), or re-upload the prior `.skill` bundle.
- The migration is idempotent and provably additive, so rollback is rarely needed; sweeps also self-snapshot to `_SNAPSHOT-*/`.
