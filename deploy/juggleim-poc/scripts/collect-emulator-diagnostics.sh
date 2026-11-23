#!/usr/bin/env bash
# Collect bounded, secret-conscious diagnostics for the Android Emulator CI job.
# Never print CI secrets, app tokens, message bodies, or full environments.
set +e
set +u
set +o pipefail

OUT_DIR="${1:-artifacts/emulator-diagnostics}"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/runner-and-emulator.txt"

# Every potentially blocking external command is bounded. Keep the whole workflow
# step bounded too (timeout-minutes in juggleim-e2e.yml).
run_bounded() {
  local seconds="$1"; shift
  timeout --signal=TERM --kill-after=2s "${seconds}s" "$@"
  local rc=$?
  if [[ $rc -eq 124 || $rc -eq 137 ]]; then
    echo "[DIAGNOSTIC_TIMEOUT after ${seconds}s] $*"
  elif [[ $rc -ne 0 ]]; then
    echo "[DIAGNOSTIC_COMMAND_EXIT=$rc] $*"
  fi
  return 0
}

adb_bounded() {
  run_bounded 5s adb "$@"
}

{
  echo "JETSON ANDROID EMULATOR DIAGNOSTICS"
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
  echo "run_id=${GITHUB_RUN_ID:-unknown}"
  echo "run_attempt=${GITHUB_RUN_ATTEMPT:-unknown}"
  echo "runner_os=${RUNNER_OS:-unknown}"
  echo "runner_arch=${RUNNER_ARCH:-unknown}"
  echo "java_home=${JAVA_HOME:-unset}"
  echo "android_home=${ANDROID_HOME:-unset}"
  echo "android_sdk_root=${ANDROID_SDK_ROOT:-unset}"
  echo

  echo "=== HOST ==="
  run_bounded 3s uname -a
  echo "-- memory --"
  run_bounded 3s free -h
  echo "-- disk --"
  run_bounded 3s df -h "$HOME" "$PWD"
  echo "-- CPU virtualization flags --"
  run_bounded 3s grep -m 1 -E '^(flags|Features)[[:space:]]*:' /proc/cpuinfo | tr ' ' '\n' | grep -E '^(vmx|svm)$' || true
  echo "-- KVM device --"
  if [[ -e /dev/kvm ]]; then
    ls -l /dev/kvm 2>&1
    [[ -r /dev/kvm ]] && echo "kvm_readable=yes" || echo "kvm_readable=no"
    [[ -w /dev/kvm ]] && echo "kvm_writable=yes" || echo "kvm_writable=no"
  else
    echo "/dev/kvm absent"
  fi
  echo

  echo "=== TOOL VERSIONS ==="
  command -v java >/dev/null 2>&1 && run_bounded 5s java -version
  command -v adb >/dev/null 2>&1 && adb_bounded version
  command -v emulator >/dev/null 2>&1 && run_bounded 5s emulator -version
  echo

  echo "=== ADB DEVICES ==="
  ADB_DEVICES="$(run_bounded 5s adb devices -l 2>&1)"
  ADB_DEVICES_RC=$?
  printf '%s\n' "$ADB_DEVICES"
  echo

  echo "=== EMULATOR PROCESSES ==="
  run_bounded 3s pgrep -af '[e]mulator|[q]emu-system' | sed -E 's/(--?password[ =])[^ ]+/\1[REDACTED]/g' || true
  echo

  echo "=== ANDROID BOOT PROPERTIES (only for connected devices) ==="
  if [[ -n "$ADB_DEVICES" ]]; then
    while read -r serial state _; do
      [[ "$serial" == "List" || -z "$serial" ]] && continue
      if [[ "$state" == "device" ]]; then
        echo "device=$serial"
        adb_bounded -s "$serial" shell getprop sys.boot_completed
        adb_bounded -s "$serial" shell getprop init.svc.bootanim
        adb_bounded -s "$serial" shell getprop ro.build.version.release
        adb_bounded -s "$serial" shell getprop ro.build.version.sdk
      fi
    done <<< "$(printf '%s\n' "$ADB_DEVICES" | tail -n +2)"
  else
    echo "No ADB device list available (command exit=$ADB_DEVICES_RC)"
  fi
  echo

  echo "=== ANDROID RUNTIME ERRORS (bounded; no app message logs) ==="
  run_bounded 8s adb logcat -d -t 300 -s AndroidRuntime:E | tail -n 300
  echo

  echo "=== AVD CONFIGURATION (selected non-secret keys only) ==="
  if [[ -d "$HOME/.android/avd" ]]; then
    run_bounded 5s find "$HOME/.android/avd" -maxdepth 3 -type f -name config.ini -print
    while IFS= read -r config; do
      [[ -z "$config" ]] && continue
      echo "-- $config --"
      run_bounded 3s grep -E '^(AvdId|abi.type|image.sysdir.1|hw.cpu.arch|hw.ramSize|hw.gpu.enabled|hw.gpu.mode|fastboot.forceColdBoot|fastboot.forceFastBoot|disk.dataPartition.size)=' "$config"
    done < <(run_bounded 5s find "$HOME/.android/avd" -maxdepth 3 -type f -name config.ini -print)
  else
    echo "AVD directory absent"
  fi
  echo

  echo "=== EMULATOR LOG FILES (bounded) ==="
  if [[ -d "$HOME/.android/avd" ]]; then
    while IFS= read -r log; do
      [[ -z "$log" ]] && continue
      echo "-- $log (last 300 lines) --"
      run_bounded 3s tail -n 300 "$log"
    done < <(run_bounded 5s find "$HOME/.android/avd" -maxdepth 4 -type f -name 'emulator*.log' -print)
  fi
} >"$REPORT" 2>&1

echo "Diagnostics written to $REPORT"
exit 0
