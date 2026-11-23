#!/usr/bin/env bash
# Collect bounded, secret-conscious diagnostics for the Android Emulator CI job.
# This script must never print CI secrets, app tokens, message bodies, or full environments.
set +e
set +u
set +o pipefail

OUT_DIR="${1:-artifacts/emulator-diagnostics}"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/runner-and-emulator.txt"

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
  uname -a 2>&1
  echo "-- memory --"
  free -h 2>&1
  echo "-- disk --"
  df -h "$HOME" "$PWD" 2>&1
  echo "-- CPU virtualization flags --"
  grep -m 1 -E '^(flags|Features)[[:space:]]*:' /proc/cpuinfo 2>/dev/null | tr ' ' '\n' | grep -E '^(vmx|svm)$' || true
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
  command -v java >/dev/null 2>&1 && java -version 2>&1
  command -v adb >/dev/null 2>&1 && adb version 2>&1
  command -v emulator >/dev/null 2>&1 && emulator -version 2>&1 | head -n 5
  echo

  echo "=== ADB DEVICES ==="
  adb devices -l 2>&1
  echo

  echo "=== EMULATOR PROCESSES ==="
  pgrep -af '[e]mulator|[q]emu-system' 2>&1 | sed -E 's/(--?password[ =])[^ ]+/\1[REDACTED]/g' || true
  echo

  echo "=== ANDROID BOOT PROPERTIES (only for connected devices) ==="
  while read -r serial state _; do
    [[ "$serial" == "List" || -z "$serial" ]] && continue
    if [[ "$state" == "device" ]]; then
      echo "device=$serial"
      adb -s "$serial" shell getprop sys.boot_completed 2>&1
      adb -s "$serial" shell getprop init.svc.bootanim 2>&1
      adb -s "$serial" shell getprop ro.build.version.release 2>&1
      adb -s "$serial" shell getprop ro.build.version.sdk 2>&1
    fi
  done < <(adb devices 2>/dev/null | tail -n +2)
  echo

  echo "=== ANDROID RUNTIME ERRORS (bounded; no app message logs) ==="
  adb logcat -d -t 300 -s AndroidRuntime:E 2>&1 | tail -n 300
  echo

  echo "=== AVD CONFIGURATION (selected non-secret keys only) ==="
  if [[ -d "$HOME/.android/avd" ]]; then
    find "$HOME/.android/avd" -maxdepth 3 -type f -name config.ini -print 2>/dev/null
    find "$HOME/.android/avd" -maxdepth 3 -type f -name config.ini -print0 2>/dev/null |
      while IFS= read -r -d '' config; do
        echo "-- $config --"
        grep -E '^(AvdId|abi.type|image.sysdir.1|hw.cpu.arch|hw.ramSize|hw.gpu.enabled|hw.gpu.mode|fastboot.forceColdBoot|fastboot.forceFastBoot|disk.dataPartition.size)=' "$config" 2>/dev/null || true
      done
  else
    echo "AVD directory absent"
  fi
  echo

  echo "=== EMULATOR LOG FILES (bounded) ==="
  if [[ -d "$HOME/.android/avd" ]]; then
    find "$HOME/.android/avd" -maxdepth 4 -type f -name 'emulator*.log' -print0 2>/dev/null |
      while IFS= read -r -d '' log; do
        echo "-- $log (last 300 lines) --"
        tail -n 300 "$log" 2>/dev/null
      done
  fi
} >"$REPORT" 2>&1

echo "Diagnostics written to $REPORT"
exit 0
