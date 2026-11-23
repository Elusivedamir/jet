#!/usr/bin/env bash
set -Eeuo pipefail

# A minimal, credential-free RFC 6455 Upgrade probe. It checks the IM server
# directly and through Caddy so a proxy failure can be distinguished from an
# upstream/server failure without booting an Android emulator.

probe() {
  local label="$1"
  local url="$2"
  local dir status rc
  dir="$(mktemp -d)"
  set +e
  status="$(curl --http1.1 --silent --show-error --max-time 3 \
    --output "$dir/body" --dump-header "$dir/headers" \
    --write-out '%{http_code}' \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    "$url" 2>"$dir/stderr")"
  rc=$?
  set -e

  echo "[$label] HTTP status: ${status:-000} (curl exit: $rc)"
  if [[ "$status" == "101" ]]; then
    echo "[$label] PASS: WebSocket Upgrade accepted."
    rm -rf "$dir"
    return 0
  fi

  echo "[$label] FAIL: expected HTTP 101."
  echo "--- response headers ---"
  sed -n '1,30p' "$dir/headers" 2>/dev/null || true
  echo "--- bounded response body ---"
  head -c 512 "$dir/body" 2>/dev/null || true
  echo
  echo "--- curl diagnostics ---"
  head -c 512 "$dir/stderr" 2>/dev/null || true
  rm -rf "$dir"
  return 1
}

direct_ok=0
proxy_ok=0
probe "direct-im-server" "http://127.0.0.1:9003/im" && direct_ok=1 || true
probe "tls-proxy" "https://127.0.0.1:8443/im" && proxy_ok=1 || true

if [[ "$direct_ok" != "1" || "$proxy_ok" != "1" ]]; then
  echo "WebSocket transport smoke failed (direct=$direct_ok proxy=$proxy_ok)." >&2
  docker compose logs --tail=120 im-server wss-proxy || true
  exit 1
fi

echo "TRANSPORT_SMOKE_PASS: direct and TLS-proxied /im upgrades both returned HTTP 101."
