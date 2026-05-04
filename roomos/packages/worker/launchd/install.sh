#!/usr/bin/env bash
set -euo pipefail

# Resolve absolute paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"  # …/roomos-phase-1a
HOME_DIR="$HOME"
PNPM_BIN="$(command -v pnpm)"

if [ -z "$PNPM_BIN" ]; then
  echo "ERROR: pnpm not found in PATH. Install with: npm i -g pnpm" >&2
  exit 1
fi

PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist"
TEMPLATE="$SCRIPT_DIR/com.cohostmgmt.roomos.worker.plist.template"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/RoomOS"

# Substitute placeholders
sed \
  -e "s|__PNPM_BIN__|$PNPM_BIN|g" \
  -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  -e "s|__HOME__|$HOME_DIR|g" \
  "$TEMPLATE" > "$PLIST_DEST"

# (Re)load
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load -w "$PLIST_DEST"

echo "Installed and started com.cohostmgmt.roomos.worker"
echo "  plist:  $PLIST_DEST"
echo "  logs:   $HOME/Library/Logs/RoomOS/"
echo "  stop:   launchctl unload $PLIST_DEST"
echo "  status: launchctl list | grep cohostmgmt"
