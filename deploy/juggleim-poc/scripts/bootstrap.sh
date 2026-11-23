#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for tool in docker openssl curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done
docker compose version >/dev/null

if [[ ! -s .env ]]; then
  umask 077
  printf 'MYSQL_ROOT_PASSWORD=%s\n' "$(openssl rand -hex 24)" > .env
  chmod 600 .env
fi

bash "$ROOT/scripts/generate-dev-certs.sh"

# Android apps targeting API 24+ do not automatically trust user-added roots.
# Do not rely on mutable emulator system-store installation: package the
# per-run public PoC CA as a generated Android resource and trust it explicitly
# through Network Security Config. The private CA key never enters the APK.
ANDROID_RAW="$ROOT/../../android/poc/app/src/main/res/raw"
mkdir -p "$ANDROID_RAW"
cp "$ROOT/certs/ca.crt" "$ANDROID_RAW/juggle_poc_ca.crt"
chmod 0644 "$ANDROID_RAW/juggle_poc_ca.crt"

# Fail before starting the stack if the leaf certificate is not signed by
# this exact CA or does not cover the emulator endpoint IP.
openssl verify -CAfile "$ROOT/certs/ca.crt" "$ROOT/certs/server.crt"
openssl x509 -in "$ROOT/certs/server.crt" -noout -checkip 10.0.2.2

docker compose up -d --build

ready=0
for _ in $(seq 1 90); do
  if curl --silent --fail http://127.0.0.1:8090/ >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != "1" ]]; then
  docker compose logs --tail=100 im-server mysql
  echo "JuggleIM admin endpoint did not become ready." >&2
  exit 1
fi

bash "$ROOT/scripts/provision-test-users.sh"
echo "Local JuggleIM PoC stack is ready. Admin and IM APIs are bound to loopback only."
