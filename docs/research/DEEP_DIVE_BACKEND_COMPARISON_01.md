# Deep-dive comparison — six messaging backends

**Snapshot:** 2026-11-23  
**Evidence:** repository README, deployment guide, security policy, license file, GitHub metadata, recent releases and recursive file-tree structure. This is not a source-code audit, penetration test, cryptographic review, reproducible build or independent benchmark.

## Executive comparison

| Project | Role | License signal | Deployment footprint | Test / CI signals | Immediate concern |
|---|---|---|---|---|---|
| [Tinode](https://github.com/tinode/chat) | Full-stack IM server and Android/iOS/web/CLI clients | GPL-3.0 | Compose single instance and 3-node cluster; MySQL, PostgreSQL, MongoDB, RethinkDB examples | Load tests, monitoring docs, server tests, SECURITY.md | SECURITY.md explicitly accepts weak TLS 1.0 cipher suites on its public domains; anti-pattern |
| [OpenIM Server](https://github.com/OpenIMSDK/Open-IM-Server) | Dedicated IM server with API, gateway, transfer, push and RPC processes | Apache-2.0 root LICENSE | Kubernetes guide requires Redis, MongoDB, Kafka and MinIO; described server request 2 CPU / 4 GiB / 20 GiB | Go build/test, CodeQL, Docker and release workflows | Dependency and operations footprint; review secrets and network policies |
| [Signal Server](https://github.com/signalapp/Signal-Server) | Backend for Signal clients | AGPL-3.0 | FoundationDB client library required on host | Maven verify, service and integration tests, CI | Tied to Signal product/protocol ecosystem and FoundationDB |
| [Matrix Synapse](https://github.com/element-hq/synapse) | Matrix homeserver | AGPL-3.0 or separate Element commercial license | Standalone docs; official Element Server Suite; reverse proxy, federation and workers | Federation/complement integration tests, Docker test infrastructure, schema CI | Commercial license/edition boundaries; Matrix is a major protocol commitment |
| [ejabberd](https://github.com/processone/ejabberd) | XMPP server plus MQTT broker and SIP service | GitHub API NOASSERTION; verify root license manually | Source, installers, containers, OS packages; x64 and ARM64 | CI, runtime and installer workflows; broad Erlang/Common Test suite | Must map required XMPP extensions and modules; license still needs verification |
| [Wire Server](https://github.com/wireapp/wire-server) | Backend services for Wire | AGPL-3.0 metadata; review root and third-party notices | Many services, Helm charts and Kubernetes ecosystem | Build/release workflows and Helm integration tests | README says internal services assume private network without dedicated auth/encryption; federation is long-term roadmap |

## Tinode

Evidence:
- README describes a multi-client IM platform.
- docker-compose documentation describes single-instance and three-node cluster setups, with MySQL, PostgreSQL, MongoDB and RethinkDB examples.
- Repository contains load tests, monitoring docs, server tests and SECURITY.md.
- Latest observed release: v0.25.5, published 2026-11-22; latest commit observed 2026-11-22.
- Root license: GPL-3.0.

Implications:
- Useful for product breadth, API/data model, client/server split, observability and cluster testing.
- SECURITY.md explicitly says weak TLS 1.0 cipher suites on its own public domains are known and not considered serious. Do not adopt this security posture.
- Multi-database support expands the compatibility and testing burden; it is not automatically a benefit.

## OpenIM Server

Evidence:
- Root LICENSE contains Apache License 2.0.
- Kubernetes deployment guide names Redis, MongoDB, Kafka and MinIO as preconditions.
- The same guide gives resource requests of 2 CPU, 4 GiB memory and 20 GiB disk for the described deployment.
- Manifests show separate API, gateway, message transfer, push, cron and RPC deployments.
- Workflow tree includes Go build/test, CodeQL, Docker build/release and release automation.
- Latest observed release: v3.8.3-patch.18 (2026-10-13); latest commit observed 2026-11-10.

Implications:
- Valuable decomposition reference for message ingress, transfer, push, RPC and storage/queue responsibilities.
- The stated server resource request is not the total platform bill: MongoDB, Kafka, Redis, MinIO, ingress, monitoring, backups and HA add resources and maintenance.
- Inspect secret handling, default credentials, network policies, service authentication, data retention, backup and upgrade procedures before using as a deployment template.

## Signal Server

Evidence:
- README requires FoundationDB client library before build/test.
- TESTING.md documents ./mvnw verify and a feature-limited test-server profile.
- Tree contains service tests and integration tests for registration, accounts and messaging, plus CI test workflows.
- Root license: AGPLv3.
- Latest commit observed 2026-11-20; no GitHub release objects were returned by the queried endpoint.

Implications:
- High-value reference for integration-test rigor and boundaries between registration, account state, delivery and cryptographic protocol.
- Lifting the server alone does not produce a complete secure messenger: clients, protocol, key lifecycle, abuse controls and deployment are part of the system.
- FoundationDB is a substantial operational dependency that must be evaluated against hosting and skills constraints.

## Matrix Synapse

Evidence:
- Correct active repository is element-hq/synapse. The older matrix-org/synapse reference returned an old 2023 commit and must not be used as current upstream.
- README says source is available under AGPL or a commercial license from Element.
- README describes Element Server Suite editions: Community, Pro and TI-M.
- Repository contains LICENSE-AGPL-3.0 and LICENSE-COMMERCIAL.
- Tree contains federation/complement tests, Docker test infrastructure, worker configuration and schema CI.
- Latest active branch commit observed 2026-11-23.

Implications:
- Valuable for federation, protocol compatibility, room state, interoperability and integration testing.
- Commercial license and edition segmentation are material business/legal facts. Review before any reuse.
- Choosing Matrix brings protocol, federation, interoperability, room semantics and ecosystem commitments.

## ejabberd

Evidence:
- README describes XMPP, MQTT and SIP services implemented with Erlang/OTP.
- README lists source compilation, installers, containers, OS packages and Homebrew; x64 and ARM64 builds.
- Tree contains CI, installer, container and runtime workflows and a broad Common Test suite.
- SECURITY.md recommends latest releases, offers private vulnerability reporting and states an acknowledgement target within 72 hours.
- Latest observed release: 26.09, published 2026-09-30; latest commit observed 2026-11-23.
- GitHub API license field was NOASSERTION. Follow-up inspection of root COPYING found GNU GPL version 2 text with an OpenSSL linking exception; source modules state GPL version 2 or later. Verify all applicable notices and dependencies before reuse.

Implications:
- Strong reference for long-running server operations, protocol extensibility, multi-platform packaging and mature tests. Source-level delivery review is documented separately in DEEP_DIVE_MESSAGE_DELIVERY_02.md.
- Build a capability-by-capability XMPP extension matrix: archive, receipts, reactions, edits, push, multi-device, calls, file transfers, moderation, offline delivery and group semantics.
- XMPP is a protocol choice with long-term client/server interoperability consequences.

## Wire Server

Evidence:
- README lists separate services for API reverse proxy, conversations/teams, accounts, push hub, WebSocket push, asset storage, third-party integrations and SSO.
- README explicitly says internal component communication is not protected by dedicated authentication or encryption and assumes a private network.
- README says federation is on the long-term roadmap.
- Repository includes extensive Helm charts and chart integration test templates.
- README points to third-party license notices outside the repository.
- Latest release observed 2026-10-26; latest commit observed 2026-11-23.

Implications:
- Useful decomposition reference for accounts, conversations, push, WebSocket notification and assets.
- Private-network trust assumption is a major deployment risk. Any adaptation must explicitly define service identity, authentication, authorization, transport encryption, secrets and network segmentation.
- Large service/chart footprint may be too operationally expensive for an early MVP.

## Preliminary scoring rubric — not yet scored

Do not rank until the same evidence is collected for each:
1. Product fit against the business plan.
2. License and commercial-use compatibility.
3. Message correctness: ordering, idempotency, retries, offline delivery, multi-device sync.
4. Security: identity, sessions, key lifecycle, E2EE scope, backups, metadata, abuse prevention and vulnerability handling.
5. Client coverage and SDK quality.
6. Deployment complexity, infrastructure cost, observability, backup/restore and disaster recovery.
7. Test depth: unit, integration, federation, load, failure injection and upgrade tests.
8. Maintenance health: releases, contributor concentration, response times and security patch cadence.
9. Extension points and migration/exit cost.
10. Total cost of ownership at realistic user and traffic scenarios.

## Decisions

- No repository is adopted as a base.
- No protocol, language, database, queue, hosting provider or architecture is selected.
- Tinode's weak-TLS exception and Wire's internal trust assumption are explicit anti-patterns.
- OpenIM's deployment dependency footprint, Signal's FoundationDB coupling and Synapse's licensing boundary are mandatory cost/risk inputs.
- Product prioritization remains blocked on page-level reconciliation of the canonical business-plan PDF. Technical research can continue independently.
