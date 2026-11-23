#!/usr/bin/env bash
set -Eeuo pipefail

OUT_DIR="artifacts/transport-probe"
mkdir -p "$OUT_DIR"
LOG_FILE="$OUT_DIR/transport-probe.log"

capture_diagnostics() {
  adb logcat -d -v time -s JetsonPoC:I System.err:W AndroidRuntime:E >"$LOG_FILE" 2>&1 || true
  {
    echo
    echo "=== JUGGLEIM / CADDY LOGS ==="
    timeout --signal=TERM --kill-after=2s 10s docker compose -f deploy/juggleim-poc/docker-compose.yml logs --since=10m --tail=300 --no-color im-server wss-proxy 2>&1 |
      grep -Ei 'error|warn|fail|denied|unauthor|invalid|timeout|handshake|tls|websocket|connect|exception|panic' |
      tail -n 160 || true
  } >>"$LOG_FILE"
}

adb root
adb wait-for-device
bash deploy/juggleim-poc/scripts/install-ca-on-emulator.sh
adb install -r android/poc/app/build/outputs/apk/bob/debug/app-bob-debug.apk
adb logcat -c
adb shell am start -n com.jetson.poc.bob/com.jetson.poc.MainActivity --ez poc_transport_probe_only true

probe_status=""
for attempt in $(seq 1 30); do
  probe_log="$(adb logcat -d -s JetsonPoC:I 2>/dev/null || true)"
  probe_status="$(grep -F "POC_TRANSPORT_WS_STATUS" <<<"$probe_log" | tail -n 1 || true)"
  if [[ -n "$probe_status" ]]; then
    break
  fi
  if grep -Fq "POC_TRANSPORT_PROBE_FAILED" <<<"$probe_log"; then
    capture_diagnostics
    echo "Transport probe failed before receiving an HTTP response." >&2
    exit 1
  fi
  sleep 1
done

capture_diagnostics
if [[ -z "$probe_status" ]]; then
  echo "Transport probe produced no HTTP status." >&2
  exit 1
fi

echo "$probe_status"
if [[ "$probe_status" != *"HTTP/1.1 101"* ]]; then
  echo "TRANSPORT_PROBE_FAIL: expected HTTP 101 Switching Protocols." >&2
  exit 1
fi

echo "TRANSPORT_PROBE_PASS: TLS and WebSocket Upgrade returned HTTP 101."
