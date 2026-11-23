# Jetson Messenger — greenfield architecture

**Date:** 2026-11-23  
**Status:** [НАПРАВЛЕНИЕ СОГЛАСОВАНО ЗАКАЗЧИКОМ] greenfield first-party server; detailed technology and security ADRs remain subject to evidence and acceptance gates.

## 1. Architectural reset

The owner has explicitly changed direction: Jetson Messenger is to be designed and built around its own first-party backend. JuggleIM/JuggleChat is no longer the architectural foundation or a required runtime dependency. No further engineering effort is to be spent fixing the previous JuggleIM E2EE/11013 integration unless the owner explicitly reopens that decision.

"Build from scratch" means Jetson owns its server-side product, data model, API, messaging domain, authorization, storage and operations. It does **not** mean inventing cryptographic algorithms, writing a new cryptographic primitive, or implementing every infrastructure component without mature libraries.

Existing JuggleIM work is retained as historical research/PoC only. It must not be silently deleted, and it must not constrain the new design.

## 2. Product scope is unchanged

This architecture change does not alter the approved product concept, pricing, trial, Jetson Business features, audience, release stages, or the approved product requirements. The existing product specification remains authoritative. This document changes the technical foundation only.

## 3. Target system boundaries

Jetson owns these first-party services and contracts:

- **Identity and sessions:** registration, login, device/session registry, refresh, revocation, recovery and account lifecycle.
- **User and social domain:** profiles, contacts, blocks, privacy settings and account discovery according to approved product rules.
- **Conversation domain:** direct conversations, group conversations, membership, roles, invitations, history and synchronization.
- **Messaging domain:** message envelope validation, idempotency, ordering policy, durable acceptance, delivery/read state, edits/deletes/reactions where approved, offline delivery and fan-out.
- **Realtime gateway:** authenticated client connections, event delivery, reconnect and backpressure. Transport is an implementation detail behind a versioned contract.
- **Media service:** upload authorization, size/type policy, object storage, download authorization, expiry and abuse scanning.
- **Push service:** APNs/FCM integration; push payloads must not disclose message plaintext.
- **Administration and abuse controls:** rate limits, reports, moderation, audit events and operator tools.
- **Business domain (later product stage):** subscription entitlements, CRM, consent evidence, campaigns, KPI and AI orchestration. Messaging authorization must not depend on client-provided business flags.

Clients never receive database credentials, signing secrets, service credentials or privileged administration tokens. Every server-side action independently authenticates and authorizes the actor and target resource.

## 4. Proposed implementation shape

[ПРЕДЛОЖЕНИЕ] Start with a **modular monolith**, not premature microservices:

- Go backend with explicit internal modules and versioned HTTP APIs.
- PostgreSQL as the durable source of truth for identity, conversations, message metadata, membership, delivery state and audit records.
- WebSocket realtime gateway initially deployed with the backend; preserve an interface that allows independent scaling later.
- Object storage using an S3-compatible API for media; database stores metadata and authorization state, not large media blobs.
- Redis/Valkey only when needed for ephemeral presence, distributed connection coordination, rate limits or queues. Do not make it the source of truth for messages.
- Background workers/outbox for push, fan-out, media processing and retryable side effects.
- OpenTelemetry-compatible logs, metrics and traces; secrets supplied by runtime secret management, never committed.
- Docker Compose for local reproducible development; production topology decided after capacity, availability, hosting region and budget are known.

These are the starting candidates, not permission to introduce paid infrastructure. Validate language/runtime versions, libraries, hosting cost, backup/restore and operational burden before locking them in an ADR.

## 5. Message lifecycle and reliability

The server must not acknowledge durable acceptance before the message transaction is committed. The initial contract must define:

1. Client-generated stable message ID / idempotency key.
2. Authenticated sender and server-verified conversation membership.
3. Payload/envelope validation and size limits.
4. Durable transaction for message metadata and outbox event.
5. Server acknowledgement with canonical server message ID and ordering metadata.
6. Asynchronous fan-out to connected recipients and offline queues.
7. Delivery/read receipts as separately defined events.
8. Retry semantics that cannot create duplicate visible messages.
9. Cursor-based history/sync so clients recover after disconnect or reinstall according to retention policy.
10. Explicit behavior for revoked devices, removed members, blocked users and deleted accounts.

Ordering guarantees, retention, edit/delete semantics and multi-device conflict rules must be written as protocol contracts before implementation.


### 5.1 LansetSpBot-derived delivery and workflow invariants

The reliability patterns reviewed in LansetSpBot are part of the Jetson messaging foundation, not a Business-only feature. Apply them to ordinary chat delivery and all asynchronous side effects:

- A client message, the server's durable message record, a delivery job, each recipient/device delivery attempt, and a delivery/read receipt are distinct concepts. Do not collapse them into one status.
- The server may acknowledge durable acceptance only after the message and its outbox intent commit. A socket write or queue enqueue alone is not proof of recipient delivery.
- Every mutating client request carries a stable idempotency identity. Duplicate requests/events must not create duplicate visible messages or repeat side effects.
- A timeout after dispatch is an unknown remote outcome. Preserve an explicit `UNCERTAIN` state and reconcile against durable receipts/events before retrying; never convert uncertainty into assumed failure.
- State transitions are validated at the authoritative persistence boundary. Use transactions, compare-and-set/version checks and worker leases to protect concurrent delivery, cancellation, membership changes and retries.
- Normalize transient, deferred/rate-limited, terminal, authorization/configuration, invalid-input and uncertain failures behind adapters. Retries are bounded and only permitted when safe.
- Startup phases, migrations and readiness fail closed. Diagnostics and telemetry use correlation IDs and centralized redaction; message plaintext, credentials and private keys are excluded.
- Integration tests must exercise the actual production composition path, including worker-to-storage-to-gateway delivery and crash/restart reconciliation. Unit tests of isolated helpers are not production evidence.

These are architectural invariants. Exact tables, state names, queue/broker and retry values are not selected here; decide them in ADRs. The LansetSpBot audit documents the source patterns and limitations. In particular, its architecture scaffolds were marked experimental where not wired into real production paths, and its reviewed dependency audit was red. Reuse the lessons, not an unverified claim of production readiness.

## 6. End-to-end encryption and key management

E2EE remains a mandatory security objective; it must not be disabled to make transport or CI tests pass.

- Do not invent cryptographic algorithms or bespoke key exchange.
- Evaluate maintained, independently reviewed protocol implementations and platform SDKs.
- Keep private identity keys and session/group keys on user devices; the server must not have a plaintext-decryption capability for E2EE conversations.
- The server may store and route opaque ciphertext, public device/key material and the minimum metadata required for delivery.
- Define multi-device enrollment, device verification, key rotation, device revocation, recovery, backup and group membership-change behavior.
- Decide direct-message and group-encryption protocols in a dedicated ADR after checking library maturity, Android compatibility, licensing, interoperability, audit history and migration path.
- Threat-model push notifications, local databases, backups, attachment encryption, logs, crash reports and metadata separately.
- Security review and protocol test vectors are release gates. A successful handshake or encrypted demo is not proof of a secure implementation.

## 7. Client strategy

Android APK remains the first delivery target. The first client may remain native Kotlin if repository inspection confirms that this is the most maintainable path. The client communicates only through Jetson-owned versioned APIs and realtime events; it must not import JuggleIM SDKs or depend on JuggleIM server identifiers.

Web, Windows and iOS are future clients. They share server contracts and domain behavior, not necessarily a single UI codebase. Framework selection for each platform is deferred until the Android architecture and API contracts are stable.

## 8. Architecture options: what remains useful

- **JuggleIM/JuggleChat:** historical comparison and source of ideas only. Not a production dependency, not the source of truth, and not a blocker.
- **Matrix/Synapse:** reference implementation and protocol comparison candidate. Matrix offers standardized client/server APIs and E2EE ecosystem, but adopting it would make Jetson a Matrix-based product with its own compatibility and operational constraints. Do not adopt it implicitly.
- **Own Jetson backend:** selected direction. Jetson owns its API, domain model, authorization, message lifecycle and operational control.
- **Third-party infrastructure:** PostgreSQL, object storage, push providers and reviewed crypto libraries may be used behind Jetson-owned interfaces. "Own backend" does not prohibit mature commodity infrastructure.

No final crypto library, realtime wire format, database schema, hosting provider or microservice topology is approved by this document.

## 9. Required ADRs before production implementation

Create separate Architecture Decision Records for:

1. Backend language/runtime and repository layout.
2. HTTP API format, versioning and authentication/session model.
3. Realtime transport, event schema, reconnect and ordering guarantees.
4. Direct and group E2EE protocol, libraries and key lifecycle.
5. PostgreSQL schema, message durability, outbox and retention.
6. Media encryption, object storage and download authorization.
7. Push delivery and privacy.
8. Presence and multi-device synchronization.
9. Abuse prevention, moderation, rate limits and audit.
10. Deployment, backups, disaster recovery, observability and cost.

Each ADR must state context, options, evidence, decision, consequences, risks and rollback/migration strategy.

## 10. Mandatory implementation sequence

### Phase 0 — reset and audit
- Freeze JuggleIM integration work.
- Inventory the repository and classify each existing file as reusable client work, diagnostic tooling, JuggleIM-specific PoC, or obsolete scaffolding.
- Preserve history; do not mass-delete.
- Reconcile the approved product specification and all prior owner-approved requirements.
- Produce system context, threat model, domain glossary and architecture ADR backlog.

### Phase 1 — backend foundation
- Establish build, lint, test, migration and local environment.
- Implement health/readiness, configuration, structured logs and secret handling.
- Implement identity, sessions and device registry.
- Add API contract tests and database migration tests.

### Phase 2 — messaging vertical slice
- Implement a real two-account direct-message flow end-to-end.
- Persist messages transactionally; support idempotency, reconnect, history cursor and offline delivery.
- Add authorization-negative tests and cross-account isolation tests.
- Integrate Android client through Jetson APIs, not a third-party IM SDK.

### Phase 3 — E2EE
- Complete protocol ADR and threat model before implementation.
- Implement device keys, direct messaging, key verification and revocation using vetted libraries.
- Add group encryption only after direct-message security and lifecycle tests pass.
- Never claim E2EE is production-ready without independent review and test evidence.

### Phase 4 — product expansion
- Groups, channels and media according to approved scope and semantics.
- Push, presence, moderation and administration.
- Then Jetson Business according to the product roadmap.

## 11. Release gates

No production or public release until all applicable gates pass:

- Unit, integration, contract, migration and Android end-to-end tests.
- Two-user and multi-device tests, reconnect/offline recovery, duplicate suppression and history consistency.
- Cross-user authorization tests for every resource and operation.
- E2EE protocol conformance, key lifecycle, device revocation and security review.
- Attachment access-control, content validation and encrypted-media tests.
- Load tests with documented hardware, concurrency, payload sizes, latency percentiles and error rates.
- Backup restore and disaster-recovery drill.
- Dependency/SBOM/license and vulnerability review.
- Monitoring, alerting, incident and rollback runbooks.
- No unresolved critical/high security findings without explicit documented risk acceptance.

## 12. Open decisions — do not guess

The following still require evidence or owner input: exact first-release feature matrix from the canonical product spec; registration and identity policy; username/phone/email discovery; account recovery; group/channel semantics; message retention and deletion; multi-device limits; E2EE recovery and backup UX; geography/data residency; expected DAU/concurrency/throughput; hosting budget; operational support model; and platform roadmap.

## 13. Current status

- [СОГЛАСОВАНО] Greenfield first-party Jetson backend direction; JuggleIM is not the foundation.
- [СОГЛАСОВАНО] Preserve E2EE as a mandatory objective; do not weaken it to pass tests.
- [ВЫВОД] Existing JuggleIM PoC and related diagnostics are historical assets, not the future production architecture.
- [ПРЕДЛОЖЕНИЕ] Go modular monolith + PostgreSQL + WebSocket gateway + S3-compatible media storage, with Redis/Valkey only when justified.
- [НЕ СОГЛАСОВАНО] Exact crypto protocol/library, schema, wire protocol, deployment topology, providers, hosting and capacity targets.
