#!/usr/bin/env bash
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$ROOT/.secrets"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"
umask 077

ADMIN_BASE_URL="${ADMIN_BASE_URL:-http://127.0.0.1:8090/admingateway}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:9001/apigateway}"
ADMIN_ACCOUNT="${ADMIN_ACCOUNT:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
APP_KEY="jetsonpoc$(openssl rand -hex 4)"
ALICE_ID="alice_$(openssl rand -hex 4)"
BOB_ID="bob_$(openssl rand -hex 4)"
WSS_URL="${JUGGLE_WSS_URL:-wss://10.0.2.2:8443}"

require_code_zero() {
  local response="$1"
  local code
  code="$(jq -r '.code // empty' <<<"$response")"
  if [[ "$code" != "0" ]]; then
    echo "JuggleIM provisioning request failed (response code: ${code:-missing})." >&2
    exit 1
  fi
}

admin_response="$(curl --fail --silent --show-error \
  --request POST "$ADMIN_BASE_URL/login" \
  --header 'Content-Type: application/json' \
  --data "$(jq -nc --arg account "$ADMIN_ACCOUNT" --arg password "$ADMIN_PASSWORD" \
    '{account:$account,password:$password}')")"
require_code_zero "$admin_response"
ADMIN_TOKEN="$(jq -er '.data.authorization' <<<"$admin_response")"

app_response="$(curl --fail --silent --show-error \
  --request POST "$ADMIN_BASE_URL/apps/create" \
  --header 'Content-Type: application/json' \
  --header "Authorization: $ADMIN_TOKEN" \
  --data "$(jq -nc --arg key "$APP_KEY" '{app_key:$key,app_name:"Jetson Android PoC"}')")"
require_code_zero "$app_response"
APP_SECRET="$(jq -er '.data.app_secret' <<<"$app_response")"

signed_post() {
  local endpoint="$1"
  local body="$2"
  local nonce timestamp signature
  nonce="$(openssl rand -hex 16)"
  timestamp="$(date +%s%3N)"
  signature="$(printf '%s' "${APP_SECRET}${nonce}${timestamp}" | openssl dgst -sha1 | awk '{print $NF}')"
  curl --fail --silent --show-error \
    --request POST "${API_BASE_URL}${endpoint}" \
    --header 'Content-Type: application/json' \
    --header "appkey: $APP_KEY" \
    --header "nonce: $nonce" \
    --header "timestamp: $timestamp" \
    --header "signature: $signature" \
    --data "$body"
}

alice_response="$(signed_post '/users/register' "$(jq -nc --arg id "$ALICE_ID" '{user_id:$id,nickname:"Jetson PoC Alice"}')")"
require_code_zero "$alice_response"
ALICE_TOKEN="$(jq -er '.data.token' <<<"$alice_response")"

bob_response="$(signed_post '/users/register' "$(jq -nc --arg id "$BOB_ID" '{user_id:$id,nickname:"Jetson PoC Bob"}')")"
require_code_zero "$bob_response"
BOB_TOKEN="$(jq -er '.data.token' <<<"$bob_response")"

cat > "$SECRETS_DIR/test-users.env" <<EOF
JUGGLE_APP_KEY=$APP_KEY
JUGGLE_WSS_URL=$WSS_URL
ALICE_USER_ID=$ALICE_ID
ALICE_TOKEN=$ALICE_TOKEN
BOB_USER_ID=$BOB_ID
BOB_TOKEN=$BOB_TOKEN
EOF
chmod 600 "$SECRETS_DIR/test-users.env"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "::add-mask::$APP_SECRET"
  echo "::add-mask::$ALICE_TOKEN"
  echo "::add-mask::$BOB_TOKEN"
  {
    echo "JUGGLE_APP_KEY=$APP_KEY"
    echo "JUGGLE_WSS_URL=$WSS_URL"
    echo "ALICE_USER_ID=$ALICE_ID"
    echo "ALICE_TOKEN=$ALICE_TOKEN"
    echo "BOB_USER_ID=$BOB_ID"
    echo "BOB_TOKEN=$BOB_TOKEN"
  } >> "$GITHUB_ENV"
fi

unset ADMIN_TOKEN ADMIN_PASSWORD APP_SECRET ALICE_TOKEN BOB_TOKEN
echo "Provisioned two synthetic users. Credentials saved in deploy/juggleim-poc/.secrets/test-users.env (mode 0600)."
