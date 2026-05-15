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
  --exclude 'references/lock-cooldown.txt' \
  "$SRC"/ "$DEST"/
echo "Deployed skill → $DEST"
ls "$DEST/bin/vault-fence.mjs" >/dev/null && echo "vault-fence.mjs present ✓"
