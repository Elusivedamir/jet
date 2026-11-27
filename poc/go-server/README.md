# Go durable-message core PoC

**Status:** isolated research prototype; not production code and not a production-stack selection.

## What this slice implements

- PostgreSQL schema for direct conversations, membership, ordered messages and durable per-recipient outbox intents.
- Sender-scoped idempotency key serialized with a PostgreSQL transaction advisory lock.
- Atomic transaction for message identity, conversation position and delivery intent.
- HTTP acceptance response only after commit.
- Conversation-membership checks on send and history access.
- Cursor-based history endpoint.
- Test-only identity header (X-Test-Account) to isolate the persistence contract.

## What it deliberately does not implement

- Real authentication, password/session management or authorization policy beyond test membership.
- WebSocket/SSE delivery, outbox worker/lease fencing, device acknowledgement or reconnect client.
- Production migrations, schema versioning, encryption/E2EE, rate limiting, abuse controls, observability or deployment.
- Group conversations; a send is rejected unless there is exactly one recipient besides the sender.

Do not expose this service to the public internet. The test identity header is trivially spoofable.

## Run locally

Requires Go 1.24+ and PostgreSQL 17 (or compatible PostgreSQL).

```sh
export DATABASE_URL='postgres://jetson:jetson_test_only@localhost:5432/jetson_poc?sslmode=disable'
go mod tidy
go test ./...
go run .
```

The service applies the PoC schema at startup. This is intentionally a disposable prototype convenience, not a production migration strategy.

Send:

```sh
curl -i -X POST http://localhost:8080/v1/conversations/room-a/messages \
  -H 'X-Test-Account: alice' -H 'Content-Type: application/json' \
  -d '{"operation_key":"op-001","payload":"hello"}'
```

History:

```sh
curl -H 'X-Test-Account: bob' \
  'http://localhost:8080/v1/conversations/room-a/messages?after=0&limit=50'
```

Test fixtures must create the conversation and membership rows first. The integration suite does this automatically.

## Reliability boundaries

An HTTP 202 is emitted only after the transaction commits message + sequence + outbox rows. If the connection drops after commit but before the response, retrying the same sender/key/payload/conversation returns the original message. Reusing the same sender/key with another payload or conversation conflicts. Different senders have independent key scopes.

The outbox is durable but not yet consumed. This prototype therefore proves persistence and recoverable delivery intent, **not recipient delivery**.
