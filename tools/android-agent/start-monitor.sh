#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
ROOT="$HOME/jetson-agent"
mkdir -p "$ROOT"
if pgrep -f '[m]onitor.sh' >/dev/null 2>&1; then
  echo "Jetson monitor already appears to be running."
  exit 0
fi
nohup bash "$HOME/jet/ tools/android-agent/monitor.sh" >>"$ROOT/launcher.log" 2>&1 &
echo "Started monitor PID $!"
