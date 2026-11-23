#!/usr/bin/env bash
set -Eeuo pipefail

: "${JUGGLE_SIGN_KEY:?JUGGLE_SIGN_KEY is required}"
: "${BOB_TOKEN:?BOB_TOKEN is required}"
: "${ALICE_TOKEN:?ALICE_TOKEN is required}"
: "${BOB_USER_ID:?BOB_USER_ID is required}"
: "${E2E_MESSAGE:?E2E_MESSAGE is required}"

DIAG_DIR="artifacts/emulator-diagnostics"
DIAG_REPORT="$DIAG_DIR/e2e-live-failure.txt"
CURRENT_STAGE="initialization"
DIAGNOSTICS_CAPTURED=0

capture_failure_diagnostics() {
  local reason="$1"
  [[ "$DIAGNOSTICS_CAPTURED" == "1" ]] && return 0
  DIAGNOSTICS_CAPTURED=1
  mkdir -p "$DIAG_DIR"

  {
    echo "JETSON LIVE E2E FAILURE SNAPSHOT"
    echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
    echo "run_id=${GITHUB_RUN_ID:-unknown}"
    echo "run_attempt=${GITHUB_RUN_ATTEMPT:-unknown}"
    echo "failure_stage=$CURRENT_STAGE"
    echo "failure_reason=$reason"
    echo
    echo "=== ADB DEVICE STATE ==="
    timeout --signal=TERM --kill-after=2s 5s adb devices -l 2>&1 || true
    echo
    echo "=== ANDROID BOOT / NETWORK PROPERTIES ==="
    for prop in sys.boot_completed init.svc.bootanim ro.build.version.release ro.build.version.sdk; do
      printf '%s=' "$prop"
      timeout --signal=TERM --kill-after=2s 5s adb shell getprop "$prop" 2>&1 | head -c 300 || true
      echo
    done
    echo
    echo "=== APP CONNECTION / TLS ERROR MARKERS (NO MESSAGE BODIES) ==="
    timeout --signal=TERM --kill-after=2s 8s adb logcat -d -v time 2>&1 |
      grep -Ei 'JetsonPoC|MSG-Sync|CONV-Sync|MSG-UploadPubKey|CON-Conn|SSLHandshakeException|CertPathValidatorException|Trust anchor|UnknownHostException|ConnectException|SocketTimeoutException|WebSocket|TLS|certificate|handshake|connection.*(fail|error|closed)|auth.*(fail|error)' |
      tail -n 160 |
      sed -E 's/((token|authorization|appsecret|app_secret|password)[=: ]+)[^ ,"]+/\1[REDACTED]/Ig' || true
    echo
    echo "=== SDK / ANDROID EXCEPTION STACKS (BOUNDED) ==="
    timeout --signal=TERM --kill-after=2s 8s adb logcat -d -v time -s System.err:W AndroidRuntime:E 2>&1 |
      tail -n 180 |
      sed -E 's/((token|authorization|appsecret|app_secret|password)[=: ]+)[^ ,"]+/\\1[REDACTED]/Ig; s/(Bearer )[A-Za-z0-9._~+\\/-]+/\\1[REDACTED]/Ig' || true
    echo
    echo "=== JUGGLEIM SERVER / WSS PROXY ERROR MARKERS (FILTERED) ==="
    timeout --signal=TERM --kill-after=2s 10s docker compose -f deploy/juggleim-poc/docker-compose.yml logs --since=10m --tail=400 --no-color im-server wss-proxy 2>&1 |
      grep -Ei 'error|warn|fail|denied|unauthor|invalid|timeout|handshake|tls|websocket|connect|exception|panic' |
      tail -n 180 |
      sed -E 's/((token|authorization|appsecret|app_secret|password)[=: ]+)[^ ,"]+/\1[REDACTED]/Ig' || true
    echo
    echo "=== END SNAPSHOT ==="
  } >"$DIAG_REPORT" 2>&1

  echo "Live failure diagnostics saved: $DIAG_REPORT"
}

on_error() {
  local line="$1"
  local code="$2"
  trap - ERR
  set +e
  capture_failure_diagnostics "command_exit=$code line=$line"
  exit "$code"
}
trap 'on_error "$LINENO" "$?"' ERR

adb root
adb wait-for-device
CURRENT_STAGE="install_local_test_ca"
bash deploy/juggleim-poc/scripts/install-ca-on-emulator.sh

CURRENT_STAGE="install_alice_and_bob_apks"
adb install -r android/poc/app/build/outputs/apk/alice/debug/app-alice-debug.apk
adb install -r android/poc/app/build/outputs/apk/bob/debug/app-bob-debug.apk
adb logcat -c

wait_for_log() {
  local pattern="$1"
  local attempt
  CURRENT_STAGE="wait_for:$pattern"
  for attempt in $(seq 1 60); do
    if adb logcat -d -s JetsonPoC:I 2>/dev/null | grep -Fq -- "$pattern"; then
      echo "Verified emulator event: $pattern"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for emulator event: $pattern" >&2
  capture_failure_diagnostics "missing_marker:$pattern"
  return 1
}

CURRENT_STAGE="independent_wss_transport_probe"
adb shell am start -n com.jetson.poc.bob/com.jetson.poc.MainActivity --ez poc_transport_probe_only true
probe_status=""
for attempt in $(seq 1 25); do
  probe_log="$(adb logcat -d -s JetsonPoC:I 2>/dev/null || true)"
  probe_status="$(grep -F "POC_TRANSPORT_WS_STATUS" <<<"$probe_log" | tail -n 1 || true)"
  if [[ -n "$probe_status" ]]; then
    break
  fi
  if grep -Fq "POC_TRANSPORT_PROBE_FAILED" <<<"$probe_log"; then
    capture_failure_diagnostics "independent_transport_probe_failed"
    exit 1
  fi
  sleep 1
done
if [[ -z "$probe_status" ]]; then
  capture_failure_diagnostics "independent_transport_probe_no_http_response"
  echo "Independent WSS probe produced no HTTP response." >&2
  exit 1
fi
echo "Independent transport result: $probe_status"
if [[ "$probe_status" != *"HTTP/1.1 101"* ]]; then
  capture_failure_diagnostics "independent_transport_probe_non_101"
  echo "Independent WSS probe did not receive HTTP 101 Switching Protocols." >&2
  exit 1
fi
adb shell am force-stop com.jetson.poc.bob

CURRENT_STAGE="start_bob"
adb shell am start -n com.jetson.poc.bob/com.jetson.poc.MainActivity --es poc_test_token "$BOB_TOKEN" --es poc_test_sign_key "$JUGGLE_SIGN_KEY" --es poc_expected_message "$E2E_MESSAGE"
wait_for_log "JuggleIM connection state=CONNECTED code=0 package=com.jetson.poc.bob"
# CONNECTED is not the same as ready to receive: JuggleIM defers normal
# inbound messages while its initial message-history synchronization runs.
wait_for_log "POC_MESSAGE_SYNC_COMPLETE package=com.jetson.poc.bob"

CURRENT_STAGE="start_alice"
adb shell am start -n com.jetson.poc.alice/com.jetson.poc.MainActivity --es poc_test_token "$ALICE_TOKEN" --es poc_test_sign_key "$JUGGLE_SIGN_KEY" --es poc_peer_user_id "$BOB_USER_ID" --es poc_test_message "$E2E_MESSAGE"
wait_for_log "JuggleIM connection state=CONNECTED code=0 package=com.jetson.poc.alice"
wait_for_log "POC_MESSAGE_SYNC_COMPLETE package=com.jetson.poc.alice"
wait_for_log "POC_MESSAGE_SENT package=com.jetson.poc.alice"
wait_for_log "POC_MESSAGE_RECEIVED package=com.jetson.poc.bob"

CURRENT_STAGE="complete"
echo "E2E_PASS: Bob received Alice's private message"
