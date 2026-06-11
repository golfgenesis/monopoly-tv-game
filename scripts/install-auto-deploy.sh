#!/usr/bin/env bash
# ==============================================================================
# เศรษฐีสยาม — install systemd auto-deploy timer
# ==============================================================================
# ติดตั้ง systemd .service + .timer ที่จะ poll origin/main ทุก 5 นาที
# เจอ commit ใหม่ก็ git pull + docker compose up -d --build อัตโนมัติ
#
# ใช้:
#   sudo bash scripts/install-auto-deploy.sh             # install + enable + start
#   sudo bash scripts/install-auto-deploy.sh --status    # ดูสถานะ + log
#   sudo bash scripts/install-auto-deploy.sh --now       # รันทันที (ทดสอบ)
#   sudo bash scripts/install-auto-deploy.sh --uninstall # ลบ timer ออก
#   sudo bash scripts/install-auto-deploy.sh --interval=10  # เปลี่ยนเป็นทุก 10 นาที
#
# Files:
#   /etc/systemd/system/siamsetthi-auto-deploy.service
#   /etc/systemd/system/siamsetthi-auto-deploy.timer
# Logs:
#   <repo>/scripts/auto-deploy.log  (rotated at 5 MB)
#   journalctl -u siamsetthi-auto-deploy.service  (systemd's view)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

UNIT_SERVICE="siamsetthi-auto-deploy.service"
UNIT_TIMER="siamsetthi-auto-deploy.timer"
SYSTEMD_DIR="/etc/systemd/system"
INTERVAL_MIN=5
MODE=install

for arg in "$@"; do
  case "$arg" in
    --status)    MODE=status ;;
    --now)       MODE=now ;;
    --uninstall) MODE=uninstall ;;
    --interval=*) INTERVAL_MIN="${arg#--interval=}" ;;
    -h|--help)
      sed -n '4,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

CYAN=$'\e[36m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RED=$'\e[31m'; NC=$'\e[0m'
step() { printf '%b==> %s%b\n' "$CYAN"   "$*" "$NC"; }
ok()   { printf '  %b✓ %s%b\n' "$GREEN"  "$*" "$NC"; }
warn() { printf '  %b! %s%b\n' "$YELLOW" "$*" "$NC"; }
err()  { printf '  %b✗ %s%b\n' "$RED"    "$*" "$NC" >&2; }

# Detect the user that owns the repo — the systemd unit runs as that user (not
# root) so git pull uses their SSH keys and the log gets the right ownership.
REPO_USER="$(stat -c '%U' "$REPO_ROOT" 2>/dev/null || echo "${SUDO_USER:-$USER}")"
REPO_GROUP="$(stat -c '%G' "$REPO_ROOT" 2>/dev/null || echo "$REPO_USER")"

# --- Status --------------------------------------------------------------
if [ "$MODE" = status ]; then
  step "Systemd units"
  if ! systemctl list-unit-files "$UNIT_TIMER" --no-legend | grep -q "$UNIT_TIMER"; then
    warn "ยังไม่ได้ติดตั้ง — รัน: sudo bash $0"
    exit 0
  fi
  systemctl status "$UNIT_TIMER" --no-pager -l || true
  echo
  step "Last invocation"
  systemctl status "$UNIT_SERVICE" --no-pager -l || true
  echo
  step "Last 30 log lines"
  if [ -f "$REPO_ROOT/scripts/auto-deploy.log" ]; then
    tail -n 30 "$REPO_ROOT/scripts/auto-deploy.log"
  else
    warn "ยังไม่มี log file — timer ยังไม่เคยรัน หรือไม่มี commit ใหม่"
  fi
  exit 0
fi

# Below requires root
if [ "$(id -u)" -ne 0 ]; then
  err "ต้องรันด้วย sudo: sudo bash $0 $*"
  exit 1
fi

# --- Run now (manual trigger) --------------------------------------------
if [ "$MODE" = now ]; then
  step "Running auto-deploy.sh manually (as $REPO_USER)"
  sudo -u "$REPO_USER" bash "$REPO_ROOT/scripts/auto-deploy.sh"
  exit $?
fi

# --- Uninstall -----------------------------------------------------------
if [ "$MODE" = uninstall ]; then
  step "Removing systemd units"
  systemctl disable --now "$UNIT_TIMER" 2>/dev/null || true
  systemctl disable "$UNIT_SERVICE" 2>/dev/null || true
  rm -f "$SYSTEMD_DIR/$UNIT_TIMER" "$SYSTEMD_DIR/$UNIT_SERVICE"
  systemctl daemon-reload
  ok "Removed $UNIT_TIMER + $UNIT_SERVICE"
  exit 0
fi

# --- Install -------------------------------------------------------------
step "Installing systemd auto-deploy"
echo "    Repo            : $REPO_ROOT"
echo "    Run as user     : $REPO_USER ($REPO_GROUP)"
echo "    Interval        : ทุก $INTERVAL_MIN นาที"
echo "    Service unit    : $SYSTEMD_DIR/$UNIT_SERVICE"
echo "    Timer unit      : $SYSTEMD_DIR/$UNIT_TIMER"

# docker compose runs as $REPO_USER — warn if that user can't reach the daemon.
if ! sudo -u "$REPO_USER" docker info >/dev/null 2>&1; then
  warn "ผู้ใช้ '$REPO_USER' ยังเข้าถึง docker ไม่ได้"
  warn "รัน:  sudo usermod -aG docker $REPO_USER   แล้ว logout/login ใหม่"
fi

chmod +x "$REPO_ROOT/scripts/auto-deploy.sh" 2>/dev/null || true

# Generate the .service unit
cat > "$SYSTEMD_DIR/$UNIT_SERVICE" <<EOF
[Unit]
Description=เศรษฐีสยาม — poll origin/main and redeploy on new commits
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$REPO_USER
Group=$REPO_GROUP
WorkingDirectory=$REPO_ROOT
ExecStart=/usr/bin/env bash $REPO_ROOT/scripts/auto-deploy.sh
# Inherit a sane PATH so 'docker', 'git', 'node' resolve
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
TimeoutStartSec=30min
# Don't restart on failure — the timer will fire again in $INTERVAL_MIN min
EOF

# Generate the .timer unit
cat > "$SYSTEMD_DIR/$UNIT_TIMER" <<EOF
[Unit]
Description=เศรษฐีสยาม — auto-deploy timer (poll every $INTERVAL_MIN min)
Requires=$UNIT_SERVICE

[Timer]
# Fire 2 min after boot, then every N min thereafter
OnBootSec=2min
OnUnitActiveSec=${INTERVAL_MIN}min
# If the system was off when a scheduled run was missed, fire on next boot
Persistent=true
Unit=$UNIT_SERVICE

[Install]
WantedBy=timers.target
EOF

ok "Wrote unit files"

systemctl daemon-reload
ok "systemctl daemon-reload"

systemctl enable --now "$UNIT_TIMER"
ok "Enabled + started $UNIT_TIMER"

echo
ok "Installed!"
echo
echo "  ตรวจสอบสถานะ:    sudo bash $0 --status"
echo "  รันทันทีทดสอบ:    sudo bash $0 --now"
echo "  ลบออก:           sudo bash $0 --uninstall"
echo "  systemd log:     journalctl -u $UNIT_SERVICE -f"
echo "  deploy log:      tail -f $REPO_ROOT/scripts/auto-deploy.log"
