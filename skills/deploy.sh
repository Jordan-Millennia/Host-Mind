#!/usr/bin/env bash
# Deploy the repo copy of the padsplit-message-responder skill to Codex.
# Idempotent. Excludes runtime-only files. Never deletes vault data.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/padsplit-message-responder" && pwd)"
DEST="$HOME/.codex/skills/padsplit-message-responder"
echo "Running vault-fence tests before deploy…"
node --test "$SRC/bin/vault-fence.test.mjs"
mkdir -p "$DEST"
rsync -av --delete \
  --exclude '.DS_Store' \
  --exclude 'bin/fixtures/' \
  --exclude 'bin/vault-fence.test.mjs' \
  --exclude 'references/lock-cooldown.txt' \
  "$SRC"/ "$DEST"/
# Dev/CI-only artifacts must never live in the deployed skill. rsync --exclude
# protects (not deletes) any copy already at $DEST, so remove them explicitly.
# (references/lock-cooldown.txt is runtime state — excluded above, NOT removed.)
rm -f "$DEST/bin/vault-fence.test.mjs"
rm -rf "$DEST/bin/fixtures"
echo "Deployed skill → $DEST"
ls "$DEST/bin/vault-fence.mjs" >/dev/null && echo "vault-fence.mjs present ✓"
[ ! -e "$DEST/bin/vault-fence.test.mjs" ] && [ ! -e "$DEST/bin/fixtures" ] && echo "dev artifacts excluded ✓"
