<!-- docs/superpowers/DEPLOYMENT-DEEPSWEEP.md -->
# PadSplit Portfolio Deep-Sweep — Deployment

Run after this work lands on `main`.

## 1. Deploy the updated skill to Codex

```bash
cd <repo>
./skills/deploy.sh
```

This rsyncs `skills/padsplit-message-responder/` → `~/.codex/skills/padsplit-message-responder/`. Confirm:

```bash
ls ~/.codex/skills/padsplit-message-responder/bin/vault-fence.mjs
grep -c "Deep Sweep Mode" ~/.codex/skills/padsplit-message-responder/SKILL.md
```

## 2. First run — DRY RUN ONLY

On the Mac Studio, with the skill deployed:

1. Trigger a dry-run sweep (no writes): create both the sentinel and the dry-run marker at the vault root:
   ```bash
   touch ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-NOW
   touch ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-DRYRUN
   ```
   On its next run the skill enters sweep mode, sees `_RECONCILE-DRYRUN`, passes `--dry-run` to every `vault-fence.mjs` call, and writes only a `_RECONCILE-LOG.md` "DRY RUN PREVIEW" block.
2. Review `~/Documents/CoHost-Knowledge-Hub/_RECONCILE-LOG.md`. Confirm:
   - property count matches PadSplit `/host/listings`
   - the migration would touch every legacy file once (fence + canonical keys)
   - no responder-owned region (`## Interaction Log`, `## Flags & Alerts`, `## Open Maintenance Items`, dossier narrative) appears in any diff
3. If anything is wrong, fix and re-run the dry-run. Nothing has been written to vault files yet (dry-run writes only the preview block; neither marker is deleted in dry-run).

## 3. First real sweep

1. Remove the dry-run marker, keep the sentinel:
   ```bash
   rm ~/Documents/CoHost-Knowledge-Hub/_RECONCILE-DRYRUN
   ```
2. The next run performs the real first sweep: the one-time idempotent migration of all property files + dossiers (insert `<!-- SWEEP:roster -->` fence + canonical frontmatter keys), then full reconciliation, then regenerates `members/_ROSTER.md` + `_PORTFOLIO.md`, then writes a dated `_SNAPSHOT-YYYY-MM-DD/`. Expect 1–2 h, round-robin paced; it may span multiple normal runs via the `_RECONCILE-STATE.md` resume cursor.
3. The skill deletes `_RECONCILE-NOW` only when the full sweep completes. Until then, re-runs resume from the cursor.

## 4. Smoke test (after the first real sweep)

1. `members/_ROSTER.md` — header `**Last Updated:**` is today's date; member count is plausible vs PadSplit `/host/members`.
2. `_PORTFOLIO.md` — property / total-rooms / occupied / vacant totals are plausible vs PadSplit `/host/listings`.
3. Spot-check 3 properties (one fully occupied, one with vacant rooms, one onboarding): the `<!-- SWEEP:roster -->` table lists every room incl. vacant; `## Interaction Log` is byte-identical to a pre-sweep snapshot copy (`diff` a `_SNAPSHOT-*/` copy against the live file — only frontmatter + the roster fence should differ).
4. Spot-check 3 dossiers (one current, one past-due, one terminated): `property` is no longer `null`; `balance`, `payment-tier`, `days-past-due` populated.
5. Within ≤15 min the RoomOS dashboard (`/properties`) reflects the fuller portfolio with ZERO RoomOS code change — the Phase 2A vault→Postgres adapter picked it up automatically.
6. `_RECONCILE-LOG.md` last block: status complete; skipped pages = 0 (or each explained); diffs sane (no responder-owned region in any diff).
7. Sanity SQL against the RoomOS DB the adapter feeds:
   ```sql
   SELECT count(*) FROM properties WHERE padsplit_property_id IS NOT NULL;
   SELECT count(*) FROM members WHERE member_dossier_path IS NOT NULL;
   ```
   Both counts should rise after the sweep vs the pre-sweep baseline.

If any check fails, the dry-run preview in `_RECONCILE-LOG.md` from step §2 is the diagnostic of record — compare it to what actually landed.
