#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CA_CERT="$ROOT/certs/ca.crt"
[[ -s "$CA_CERT" ]] || { echo "Missing local CA: $CA_CERT" >&2; exit 1; }

command -v adb >/dev/null 2>&1 || { echo "adb is required." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required." >&2; exit 1; }

HASH="$(openssl x509 -in "$CA_CERT" -subject_hash_old -noout)"
TMP_DER="$(mktemp)"
trap 'rm -f "$TMP_DER"' EXIT
openssl x509 -in "$CA_CERT" -outform DER -out "$TMP_DER"

adb root
adb wait-for-device
adb remount
adb push "$TMP_DER" "/system/etc/security/cacerts/$HASH.0"
adb shell chown 0:0 "/system/etc/security/cacerts/$HASH.0"
adb shell chmod 0644 "/system/etc/security/cacerts/$HASH.0"
adb reboot
adb wait-for-device

for _ in $(seq 1 90); do
  [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && break
  sleep 2
done
[[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == "1" ]] || {
  echo "Emulator did not finish rebooting after CA installation." >&2
  exit 1
}
echo "Local PoC CA installed in the emulator system trust store."
