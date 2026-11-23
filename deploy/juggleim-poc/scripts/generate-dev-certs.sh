#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT/certs"
mkdir -p "$CERT_DIR"

if [[ -s "$CERT_DIR/ca.crt" && -s "$CERT_DIR/server.crt" && -s "$CERT_DIR/server.key" ]]; then
  echo "Local PoC certificates already exist."
  exit 0
fi

umask 077
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 7 \
  -keyout "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.crt" \
  -subj "/CN=Jetson JuggleIM PoC Local CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -new -newkey rsa:2048 -nodes -sha256 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -subj "/CN=10.0.2.2"

cat > "$CERT_DIR/server.ext" <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:10.0.2.2,IP:127.0.0.1,DNS:localhost
EXT

openssl x509 -req -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/server.crt" -days 7 -sha256 -extfile "$CERT_DIR/server.ext"

chmod 600 "$CERT_DIR/"*.key
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/server.crt"
echo "Generated seven-day local-only TLS certificates."
