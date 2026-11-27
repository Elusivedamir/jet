# ADR-0003 — Node.js / TypeScript as the primary Jetson backend

**Date:** 2026-11-27  
**Status:** OWNER-APPROVED backend language/runtime direction; implementation and production architecture remain subject to release gates.

## Decision

The owner explicitly selected **Node.js with TypeScript** as the primary backend stack for Jetson Messenger. New first-party backend implementation should use this stack unless the owner changes the decision.

This decision supersedes the earlier Go + PostgreSQL recommendation in ADR-0002 **only with respect to the backend language/runtime direction**. The earlier comparative evidence and candidate implementations remain preserved as research; history is not rewritten.

## Scope and boundaries

This decision approves Node.js + TypeScript as the primary backend implementation direction. It does **not** by itself approve:
- PostgreSQL as the final production database;
- a broker, queue, realtime transport or protocol;
- authentication, identity/session design or account recovery;
- end-to-end encryption scope or cryptographic implementation;
- hosting provider, cloud, deployment topology or operational SLOs;
- production readiness, measured capacity or a release date.

The current Node/PostgreSQL message server remains a research PoC. Its test identity header is spoofable and must never be exposed publicly.

## Evidence available at decision time

- The Node TypeScript PoC implements sender-scoped idempotency, transactional message/sequence/outbox creation, leased outbox claims with fencing, recipient inbox persistence, SSE cursor replay and recipient acknowledgement.
- Exact earlier shared-head CI evidence is recorded in the engineering validation log, including TypeScript compilation, PostgreSQL integration tests and crash-recovery runs.
- The latest candidate run, [#46031707670](https://github.com/Elusivedamir/jet/actions/runs/46031707670), passed clean `npm ci`, TypeScript build and PostgreSQL integration tests but failed in the shared Python crash harness due to a harness namespace collision. The harness was corrected in commit `3a59e4a8cb1ecda6a3501992691414eb876de68b`; corrected-run verification is pending.
- Earlier benchmark results are CI microbenchmarks, not capacity/SLO evidence. They must not be used as production performance promises.

## Required next gates

1. Re-run the corrected shared crash/recovery harness and all fail-closed dependency, license and vulnerability checks on the exact new commit.
2. Complete the sustained-load/soak comparison relevant to the selected Node implementation, including resource metrics and failure recovery.
3. Harden the server boundary: replace spoofable test identity with an approved authenticated identity/session model before any public exposure.
4. Add versioned database migrations and repeatable backup/restore procedures before production use.
5. Complete threat modelling, authorization-negative tests, rate/abuse controls, privacy-safe observability and operational runbooks.
6. Build the first user-facing vertical slice: registration/sign-in, direct conversation, send, recipient delivery, reconnect/sync and accurate message states.

## Product invariants

The approved business plan remains the product source of truth. This technical decision does not change the free-core-first roadmap, Jetson Business scope, pricing hypothesis, trial/consent requirements, campaign safeguards or deferred external channels/public API.

## Change control

Any later change of primary backend stack requires an explicit owner decision and a new ADR. Do not silently revert to Go, Kotlin, JuggleIM, Chatwoot or a third-party messenger base.
