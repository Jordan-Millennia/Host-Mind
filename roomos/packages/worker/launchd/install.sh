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

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/RoomOS"

# Parse arguments
INSTALL_WORKER=false
INSTALL_VAULT=false
VAULT_PATH=""
DATABASE_URL=""
REDIS_URL=""
WORKER_HEARTBEAT_URL=""
WORKER_TOKEN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --worker)
      INSTALL_WORKER=true
      shift
      ;;
    --vault)
      INSTALL_VAULT=true
      shift
      ;;
    --vault-path)
      VAULT_PATH="$2"
      shift 2
      ;;
    --database-url)
      DATABASE_URL="$2"
      shift 2
      ;;
    --redis-url)
      REDIS_URL="$2"
      shift 2
      ;;
    --worker-heartbeat-url)
      WORKER_HEARTBEAT_URL="$2"
      shift 2
      ;;
    --worker-token)
      WORKER_TOKEN="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Default to installing worker if no flags specified
if [ "$INSTALL_WORKER" = false ] && [ "$INSTALL_VAULT" = false ]; then
  INSTALL_WORKER=true
fi

# Install worker plist
if [ "$INSTALL_WORKER" = true ]; then
  PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.worker.plist"
  TEMPLATE="$SCRIPT_DIR/com.cohostmgmt.roomos.worker.plist.template"

  sed \
    -e "s|__PNPM_BIN__|$PNPM_BIN|g" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|__HOME__|$HOME_DIR|g" \
    "$TEMPLATE" > "$PLIST_DEST"

  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load -w "$PLIST_DEST"

  echo "Installed and started com.cohostmgmt.roomos.worker"
  echo "  plist:  $PLIST_DEST"
  echo "  logs:   $HOME/Library/Logs/RoomOS/worker.stdout.log"
  echo "  stop:   launchctl unload $PLIST_DEST"
fi

# Install vault plist
if [ "$INSTALL_VAULT" = true ]; then
  if [ -z "$VAULT_PATH" ]; then
    echo "ERROR: --vault requires --vault-path argument" >&2
    exit 1
  fi

  # Load from .env if available
  if [ -z "$DATABASE_URL" ] && [ -f "$REPO_ROOT/roomos/packages/worker/.env.local" ]; then
    DATABASE_URL="$(grep DATABASE_URL "$REPO_ROOT/roomos/packages/worker/.env.local" | cut -d= -f2- || true)"
  fi
  if [ -z "$REDIS_URL" ] && [ -f "$REPO_ROOT/roomos/packages/worker/.env.local" ]; then
    REDIS_URL="$(grep REDIS_URL "$REPO_ROOT/roomos/packages/worker/.env.local" | cut -d= -f2- || true)"
  fi
  if [ -z "$WORKER_HEARTBEAT_URL" ] && [ -f "$REPO_ROOT/roomos/packages/worker/.env.local" ]; then
    WORKER_HEARTBEAT_URL="$(grep WORKER_HEARTBEAT_URL "$REPO_ROOT/roomos/packages/worker/.env.local" | cut -d= -f2- || true)"
  fi
  if [ -z "$WORKER_TOKEN" ] && [ -f "$REPO_ROOT/roomos/packages/worker/.env.local" ]; then
    WORKER_TOKEN="$(grep WORKER_TOKEN "$REPO_ROOT/roomos/packages/worker/.env.local" | cut -d= -f2- || true)"
  fi

  PLIST_DEST="$HOME/Library/LaunchAgents/com.cohostmgmt.roomos.vault.plist"
  TEMPLATE="$SCRIPT_DIR/com.cohostmgmt.roomos.vault.plist.template"

  sed \
    -e "s|__PNPM_BIN__|$PNPM_BIN|g" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|__HOME__|$HOME_DIR|g" \
    -e "s|__VAULT_PATH__|$VAULT_PATH|g" \
    -e "s|__DATABASE_URL__|$DATABASE_URL|g" \
    -e "s|__REDIS_URL__|$REDIS_URL|g" \
    -e "s|__WORKER_HEARTBEAT_URL__|$WORKER_HEARTBEAT_URL|g" \
    -e "s|__WORKER_TOKEN__|$WORKER_TOKEN|g" \
    "$TEMPLATE" > "$PLIST_DEST"

  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load -w "$PLIST_DEST"

  echo "Installed and started com.cohostmgmt.roomos.vault"
  echo "  plist:  $PLIST_DEST"
  echo "  logs:   $HOME/Library/Logs/RoomOS/vault.stdout.log"
  echo "  stop:   launchctl unload $PLIST_DEST"
fi

echo "  status: launchctl list | grep cohostmgmt"
