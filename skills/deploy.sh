#!/usr/bin/env bash
# Deploy the padsplit-message-responder deep-sweep payload.
# Idempotent. Excludes runtime-only files. Never deletes vault data.
#
# TWO LINEAGES (see docs/superpowers/DEPLOYMENT-DEEPSWEEP.md "Lineage divergence"):
#   - Codex lineage  = this repo copy (references/ + bin/ structure).
#   - Cowork lineage = the live skill Jordan runs in Claude (flat UPPERCASE
#                      files, rich 72KB SKILL.md). DIFFERENT document — must
#                      NOT be overwritten with the repo SKILL.md.
# Only the deep-sweep payload (vault-fence.mjs + DEEP-SWEEP.md) is lineage-
# neutral and safe to sync into the Cowork skill. The Cowork SKILL.md trigger
# + ownership-guardrail insertions are applied once in place and tracked in
# the DEPLOYMENT doc; this script re-syncs only the neutral payload and
# re-emits a durable .skill bundle.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/padsplit-message-responder" && pwd)"

echo "Running vault-fence tests before deploy…"
node --test "$SRC/bin/vault-fence.test.mjs"

# ---------- Codex lineage (~/.codex/skills) ----------
CODEX_DEST="$HOME/.codex/skills/padsplit-message-responder"
if [ -d "$HOME/.codex/skills" ] || [ "${DEPLOY_CODEX:-0}" = "1" ]; then
  mkdir -p "$CODEX_DEST"
  rsync -av --delete \
    --exclude '.DS_Store' \
    --exclude 'bin/fixtures/' \
    --exclude 'bin/vault-fence.test.mjs' \
    --exclude 'references/lock-cooldown.txt' \
    "$SRC"/ "$CODEX_DEST"/
  # rsync --exclude protects (not deletes) an existing dest copy from --delete,
  # so strip dev/CI artifacts explicitly. lock-cooldown.txt is runtime state —
  # excluded above, NOT removed.
  rm -f "$CODEX_DEST/bin/vault-fence.test.mjs"
  rm -rf "$CODEX_DEST/bin/fixtures"
  echo "Codex skill   → $CODEX_DEST"
  ls "$CODEX_DEST/bin/vault-fence.mjs" >/dev/null && echo "  vault-fence.mjs present ✓"
  [ ! -e "$CODEX_DEST/bin/vault-fence.test.mjs" ] && [ ! -e "$CODEX_DEST/bin/fixtures" ] \
    && echo "  dev artifacts excluded ✓"
else
  echo "Codex skill   → skipped (~/.codex/skills absent; set DEPLOY_CODEX=1 to force)"
fi

# ---------- Cowork lineage (live Claude skill dir, discovered) ----------
# The Cowork skill dir lives under the Claude desktop local-agent-mode-sessions
# tree with session/install UUIDs in the path — discover it, never hardcode.
COWORK_BASE="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
COWORK_DIRS=()
if [ -d "$COWORK_BASE" ]; then
  while IFS= read -r d; do COWORK_DIRS+=("$d"); done < <(find "$COWORK_BASE" \
    -type d -path '*/skills-plugin/*/skills/padsplit-message-responder' 2>/dev/null)
fi

if [ "${#COWORK_DIRS[@]}" -eq 0 ]; then
  echo "Cowork skill  → not found (Claude not installed here, or no session yet)"
else
  for CW in "${COWORK_DIRS[@]}"; do
    # Lineage-neutral payload ONLY. Do NOT touch SKILL.md or the UPPERCASE
    # companion files — that is the Cowork lineage's own document.
    cp "$SRC/bin/vault-fence.mjs" "$CW/vault-fence.mjs"
    if [ ! -f "$CW/DEEP-SWEEP.md" ]; then
      echo "  NOTE: $CW has no DEEP-SWEEP.md — port it from references/deep-sweep.md"
      echo "        (path-adapt bin/vault-fence.mjs → vault-fence.mjs). See DEPLOYMENT doc."
    fi
    if grep -q 'DEEP-SWEEP.md' "$CW/SKILL.md" 2>/dev/null; then
      echo "Cowork skill  → $CW  (payload synced, SKILL.md wired ✓)"
    else
      echo "Cowork skill  → $CW  (payload synced; SKILL.md NOT wired — see DEPLOYMENT doc)"
    fi
  done

  # ---------- Durable .skill bundle (re-upload artifact) ----------
  CW="${COWORK_DIRS[0]}"
  BUNDLE="$HOME/Downloads/padsplit-message-responder.deepsweep-$(date +%Y%m%d).skill"
  ( cd "$(dirname "$CW")" && rm -f "$BUNDLE" \
      && zip -rq "$BUNDLE" "padsplit-message-responder" -x '*.bak.*' -x '*/.DS_Store' )
  echo "Durable bundle → $BUNDLE"
fi
