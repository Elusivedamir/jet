# Node.js / TypeScript durable-message PoC

**Status:** isolated research PoC for the owner-approved Node.js + TypeScript backend direction; not production code or production-ready.

## Contract

- PostgreSQL transaction covers sender-scoped idempotency, conversation sequence, message row and one recipient outbox intent.
- HTTP acceptance occurs after commit.
- Worker claims with FOR UPDATE SKIP LOCKED, expiring lease and fencing token.
- Dispatch atomically creates recipient inbox row and completes the outbox item.
- SSE endpoint resumes from Last-Event-ID or after; recipient acknowledgement is persisted separately.
- Retry uses bounded exponential delay and terminal failure after eight attempts.

## Run

Requires Node.js 22.23.5, PostgreSQL 17+. The exact Node patch is pinned in `.nvmrc` and consumed by CI.

    export DATABASE_URL='postgres://jetson:jetson_test_only@localhost:5432/jetson_poc?sslmode=disable'
    npm ci
    npm test
    npm run build
    npm start

The service applies the PoC schema at startup. Test identity is supplied with X-Test-Account and is trivially spoofable. Never expose this service publicly.

## Endpoints

- POST /v1/conversations/{id}/messages — JSON operation_key, payload.
- GET /v1/conversations/{id}/messages?after=0 — history.
- GET /v1/conversations/{id}/events?after=0 — SSE stream.
- POST /v1/messages/{id}/ack — recipient acknowledgement.

Direct and multi-recipient conversation fan-out are supported by this PoC. The current identity header remains trivially spoofable. No production auth, versioned migrations, E2EE, abuse controls, sustained-load evidence or release readiness is claimed. Committed npm v3 `package-lock.json`; CI installs with `npm ci` and checks that package manifests remain unchanged. Dependency vulnerability/license review is generated in CI and must still be reviewed.
