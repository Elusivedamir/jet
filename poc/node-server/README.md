# Node.js / TypeScript durable-message PoC

**Status:** isolated research PoC for the owner-approved Node.js + TypeScript backend direction; not production code or production-ready.

## Durable messaging contract

- PostgreSQL transaction covers sender-scoped idempotency, conversation sequence, message row and one outbox intent per recipient other than the sender.
- HTTP acceptance occurs after commit.
- Worker claims with FOR UPDATE SKIP LOCKED, expiring lease and fencing token.
- Dispatch atomically creates recipient inbox row and completes the outbox item.
- SSE endpoint resumes from Last-Event-ID or after; recipient acknowledgement is persisted separately.
- Retry uses bounded exponential delay and terminal failure after eight attempts.

## Account and session PoC

- Registration: `POST /v1/auth/register` with `username`, `password`, `display_name`.
- Login: `POST /v1/auth/login` with `username`, `password`.
- Current account: `GET /v1/me` with `Authorization: Bearer <access_token>`.
- Logout: `POST /v1/auth/logout` with the same Bearer token.
- Usernames are normalized to lowercase and restricted to 3–24 ASCII letters, digits or underscore. Passwords must be 12–128 characters; display names 1–48 characters.
- Passwords are salted and hashed with Node.js scrypt; plaintext passwords are never persisted. Sessions use 256-bit random opaque tokens; only SHA-256 token digests are stored. Sessions expire after 30 days and logout revokes the token.
- Access tokens are returned only at registration/login and must be treated as secrets by clients. This PoC uses Bearer tokens; it does not yet implement refresh tokens, device/session management, login throttling, password reset, email/phone verification, MFA or account recovery.

## Run

Requires Node.js 22.23.5, PostgreSQL 17+. The exact Node patch is pinned in `.nvmrc` and consumed by CI.

    export DATABASE_URL='postgres://jetson:jetson_test_only@localhost:5432/jetson_poc?sslmode=disable'
    npm ci
    npm test
    npm run build
    npm start

The service applies the PoC schema at startup. The legacy `X-Test-Account` identity shim is disabled by default and cannot be enabled when `NODE_ENV=production`. The isolated CI crash/contract harness opts in with `NODE_ENV=test` and `JETSON_ALLOW_TEST_IDENTITY=true`. This shim is not authentication and must never be enabled in a deployed environment.

## Messaging endpoints

- POST /v1/conversations/{id}/messages — JSON operation_key, payload.
- GET /v1/conversations/{id}/messages?after=0 — history.
- GET /v1/conversations/{id}/events?after=0 — SSE stream.
- POST /v1/messages/{id}/ack — recipient acknowledgement.

Direct and multi-recipient conversation fan-out are supported by this PoC. Request bodies are JSON-only, size-limited and validated; malformed JSON and invalid cursors return 400. No production rate limiting, versioned migrations, E2EE, sustained-load evidence or release readiness is claimed. Committed npm v3 `package-lock.json`; CI installs with `npm ci` and checks that package manifests remain unchanged. Dependency vulnerability/license review is generated in CI and must still be reviewed.

## Contacts and personal conversations

- Search users by username or display-name prefix: `GET /v1/users/search?q=bo` (minimum two characters; results are limited to 20 and exclude the current account).
- Send a contact request by username: `POST /v1/contacts/requests` with `{"username":"bob"}`.
- List pending requests: `GET /v1/contacts/requests` returns separate `incoming` and `outgoing` arrays.
- Accept an incoming request: `POST /v1/contacts/requests/{request_id}/accept`. Only its recipient may accept it.\n- Decline an incoming request: `POST /v1/contacts/requests/{request_id}/decline`. Only its recipient may decline it.
- List accepted contacts: `GET /v1/contacts`.
- Get the existing personal conversation with an accepted contact: `POST /v1/conversations/direct` with `{"username":"bob"}`.
- Accepting a request atomically creates the normalized contact pair and a single stable direct-conversation ID with both participants as members. Repeated direct-conversation lookup returns the same conversation.
- Self-add, unknown users, duplicate accepted contacts and attempts to accept another person's request are rejected. A reverse pending request is surfaced instead of creating a confusing duplicate.
- Search exposes only public username/display-name fields; contact and request endpoints require an authenticated account.

These endpoints are still part of the isolated PoC. Blocking/reporting, declined-request notifications and history UX, privacy controls, discovery ranking, abuse throttling and production migrations remain future work.
