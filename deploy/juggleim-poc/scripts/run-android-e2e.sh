#!/usr/bin/env bash
set -Eeuo pipefail

: "${BOB_TOKEN:?BOB_TOKEN is required}"
: "${ALICE_TOKEN:?ALICE_TOKEN is required}"
: "${BOB_USER_ID:?BOB_USER_ID is required}"
: "${E2E_MESSAGE:?E2E_MESSAGE is required}"

adb root
adb wait-for-device
bash deploy/juggleim-poc/scripts/install-ca-on-emulator.sh

adb install -r android/poc/app/build/outputs/apk/alice/debug/app-alice-debug.apk
adb install -r android/poc/app/build/outputs/apk/bob/debug/app-bob-debug.apk
adb logcat -c

wait_for_log() {
  local pattern="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if adb logcat -d -s JetsonPoC:I 2>/dev/null | grep -Fq -- "$pattern"; then
      echo "Verified emulator event: $pattern"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for emulator event: $pattern" >&2
  adb logcat -d -s JetsonPoC:I || true
  adb logcat -d -s AndroidRuntime:E || true
  return 1
}

adb shell am start -n com.jetson.poc.bob/com.jetson.poc.MainActivity --es poc_test_token "$BOB_TOKEN" --es poc_expected_message "$E2E_MESSAGE"
wait_for_log "JuggleIM connection state=CONNECTED code=0 package=com.jetson.poc.bob"

adb shell am start -n com.jetson.poc.alice/com.jetson.poc.MainActivity --es poc_test_token "$ALICE_TOKEN" --es poc_peer_user_id "$BOB_USER_ID" --es poc_test_message "$E2E_MESSAGE"
wait_for_log "JuggleIM connection state=CONNECTED code=0 package=com.jetson.poc.alice"
wait_for_log "POC_MESSAGE_SENT package=com.jetson.poc.alice"
wait_for_log "POC_MESSAGE_RECEIVED package=com.jetson.poc.bob"

echo "E2E_PASS: Bob received Alice's private message"
