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

# Prepare the same ephemeral CA resource for both standalone builds and E2E.
bash "$ROOT/scripts/prepare-android-ca-resource.sh"

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
