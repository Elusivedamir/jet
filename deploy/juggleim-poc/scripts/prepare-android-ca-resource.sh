#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

for tool in openssl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

bash "$ROOT/scripts/generate-dev-certs.sh"

# Only the public CA certificate is packaged. Private CA/server keys stay outside Android resources.
ANDROID_RAW="$REPO_ROOT/android/poc/app/src/main/res/raw"
mkdir -p "$ANDROID_RAW"
install -m 0644 "$ROOT/certs/ca.crt" "$ANDROID_RAW/juggle_poc_ca.crt"

openssl verify -CAfile "$ROOT/certs/ca.crt" "$ROOT/certs/server.crt"
openssl x509 -in "$ROOT/certs/server.crt" -noout -checkip 10.0.2.2

test -s "$ANDROID_RAW/juggle_poc_ca.crt"
echo "Android PoC trust resource prepared; only the public CA certificate is included."
