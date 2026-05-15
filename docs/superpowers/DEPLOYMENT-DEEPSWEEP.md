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

## 4. Smoke test

(Filled in by Task 15.)
