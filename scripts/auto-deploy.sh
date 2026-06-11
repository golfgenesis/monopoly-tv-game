#!/usr/bin/env bash
# ==============================================================================
# เศรษฐีสยาม — Auto-Deploy Poller
# ==============================================================================
# จุดประสงค์: prod poll origin/main → ถ้ามี commit ใหม่ → git pull + redeploy
#            (docker compose up -d --build)
# ตั้งให้รันผ่าน systemd timer ด้วย: sudo bash scripts/install-auto-deploy.sh
#
# Behavior:
#   1. git fetch origin main (เงียบ)
#   2. ถ้า HEAD == origin/main → exit 0 (no-op)
#   3. ถ้า working tree สกปรก → log warning, skip
#   4. ถ้า local อยู่ "ahead" → log warning, skip
#   5. ปกติ → git pull --ff-only + docker compose up -d --build
#
# Override คำสั่ง deploy ได้ด้วย env:  AUTO_DEPLOY_CMD="npm run build && ..."
#
# Logs:  scripts/auto-deploy.log  (rotate ที่ 5 MB, เก็บ .1 backup)
# Lock:  scripts/.auto-deploy.lock — กัน timer ซ้อนตอน build ยังรัน
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-deploy.log"
LOCK_FILE="$SCRIPT_DIR/.auto-deploy.lock"
MAX_LOG_MB=5

log() {
  local level="$1"; shift
  local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local line="$ts [$level] auto-deploy : $*"
  echo "$line" >> "$LOG_FILE"
  echo "$line"
}

rotate_log() {
  [ -f "$LOG_FILE" ] || return 0
  local size_mb
  size_mb="$(du -m "$LOG_FILE" 2>/dev/null | awk '{print $1}')"
  if [ "${size_mb:-0}" -gt "$MAX_LOG_MB" ]; then
    mv -f "$LOG_FILE" "$LOG_FILE.1"
  fi
}

git_q() { git -C "$REPO_ROOT" "$@"; }

# Resolve the redeploy command (Docker by default; overridable via env).
deploy_cmd() {
  if [ -n "${AUTO_DEPLOY_CMD:-}" ]; then
    echo "$AUTO_DEPLOY_CMD"
  elif docker compose version >/dev/null 2>&1; then
    echo "docker compose up -d --build"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose up -d --build"
  else
    echo ""
  fi
}

# --- Lock (skip if previous run still in progress) -----------------------
if [ -f "$LOCK_FILE" ]; then
  lock_age_min=$(( ( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ) / 60 ))
  if [ "$lock_age_min" -gt 30 ]; then
    log WARN "stale lock ($lock_age_min min) — removing"
    rm -f "$LOCK_FILE"
  else
    # silent — don't log every 5 min while a build is running
    exit 0
  fi
fi

rotate_log
cd "$REPO_ROOT"

# --- Fetch + diff ---------------------------------------------------------
if ! out="$(git_q fetch origin main --quiet 2>&1)"; then
  log ERROR "git fetch failed: $out"
  exit 1
fi

local_head="$(git_q rev-parse HEAD)"
remote_head="$(git_q rev-parse origin/main)"

if [ "$local_head" = "$remote_head" ]; then
  exit 0   # silent — no commits to pull
fi

# --- Safety: refuse on dirty tree ----------------------------------------
dirty="$(git_q status --porcelain)"
if [ -n "$dirty" ]; then
  log WARN "skipping deploy — working tree has uncommitted changes:"
  while IFS= read -r line; do echo "  | $line" >> "$LOG_FILE"; done <<< "$dirty"
  exit 0
fi

# --- Safety: refuse if local is ahead (force-push needed = manual) ------
ahead_behind="$(git_q rev-list --left-right --count HEAD...origin/main)"
ahead="$(echo "$ahead_behind" | awk '{print $1}')"
behind="$(echo "$ahead_behind" | awk '{print $2}')"
if [ "${ahead:-0}" -gt 0 ]; then
  log WARN "skipping deploy — local is $ahead commit(s) ahead of origin/main (manual reconcile needed)"
  exit 0
fi

# --- Deploy --------------------------------------------------------------
DEPLOY="$(deploy_cmd)"
if [ -z "$DEPLOY" ]; then
  log ERROR "no deploy command — install docker compose or set AUTO_DEPLOY_CMD"
  exit 1
fi

: > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log INFO "new commits detected: $behind behind origin/main (${local_head:0:7} → ${remote_head:0:7})"

if ! pull_out="$(git_q pull --ff-only origin main 2>&1)"; then
  log ERROR "git pull failed: $pull_out"
  exit 1
fi
log INFO "git pull OK — running: $DEPLOY"

# Run the redeploy; capture stdout+stderr into the log.
if bash -c "$DEPLOY" 2>&1 | while IFS= read -r line; do
  echo "  | $line" >> "$LOG_FILE"
done; then
  log INFO "deploy complete — now at ${remote_head:0:7}"
else
  rc=$?
  log ERROR "deploy command exited $rc"
  exit "$rc"
fi
