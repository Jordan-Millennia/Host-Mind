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

(Filled in by Task 14 — the read-only first-run procedure + how to review the `_RECONCILE-LOG.md` preview.)

## 3. First real sweep

(Filled in by Task 14.)

## 4. Smoke test

(Filled in by Task 15.)
