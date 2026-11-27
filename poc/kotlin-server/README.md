# Kotlin / Spring Boot durable-message PoC

**Status:** isolated research prototype; not production code and not a production-stack selection.

## Contract

- Spring Boot 3.4.4 / Kotlin 2.0.21 / JDK 21 / PostgreSQL.
- TransactionTemplate covers sender-scoped idempotency, conversation sequence, message row and one recipient outbox intent.
- HTTP acceptance follows successful commit.
- Scheduled worker claims with FOR UPDATE SKIP LOCKED, expiring lease and fencing token.
- Dispatch atomically creates recipient inbox row and completes the outbox item.
- SSE endpoint resumes from the after cursor; recipient acknowledgement is persisted separately.
- Retry uses bounded exponential delay and terminal failure after eight attempts.

## Run

Requires JDK 21+, Maven 3.9+ and PostgreSQL 17+.

    export SPRING_DATASOURCE_URL='jdbc:postgresql://localhost:5432/jetson_poc'
    export SPRING_DATASOURCE_USERNAME='jetson'
    export SPRING_DATASOURCE_PASSWORD='jetson_test_only'
    mvn -B test
    mvn spring-boot:run

The schema is initialized from classpath SQL at startup. Tests disable the scheduled worker for deterministic fixtures. Test identity is supplied with X-Test-Account and is trivially spoofable. Never expose this service publicly.

## Endpoints

- POST /v1/conversations/{id}/messages — JSON operation_key, payload.
- GET /v1/conversations/{id}/messages?after=0 — history.
- GET /v1/conversations/{id}/events?after=0 — SSE stream.
- POST /v1/messages/{id}/ack — recipient acknowledgement.

Exactly one recipient besides the sender is supported. No production auth, migrations, E2EE, abuse controls, load benchmark or release readiness is claimed. Maven dependency/license inventory and reproducibility review remain open.
