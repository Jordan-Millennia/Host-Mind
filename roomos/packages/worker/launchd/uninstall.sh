#!/usr/bin/env bash
set -euo pipefail

PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist"

if [ -f "$PLIST_DEST" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm "$PLIST_DEST"
  echo "Uninstalled com.cohostmgmt.roomos.worker"
else
  echo "No plist found at $PLIST_DEST"
fi
