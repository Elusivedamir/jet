#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
REPO_DIR="${JETSON_REPO_DIR:-$HOME/jet}"
ROOT="$HOME/jetson-agent"
mkdir -p "$ROOT"
SCRIPT="$REPO_DIR/tools/android-agent/monitor.sh"
if [[ ! -f "$SCRIPT" ]]; then
  echo "Monitor script not found: $SCRIPT"
  echo "Clone Elusivedamir/jet into $REPO_DIR first."
  exit 2
fi
if pgrep -f "^bash ${SCRIPT}$" >/dev/null 2>&1; then
  echo "Jetson monitor already appears to be running."
  exit 0
fi
nohup bash "$SCRIPT" >>"$ROOT/launcher.log" 2>&1 &
echo "Started monitor PID $!"
