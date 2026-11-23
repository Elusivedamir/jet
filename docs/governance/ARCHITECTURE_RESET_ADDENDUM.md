# Architecture reset — owner direction

**Date:** 2026-11-23  
**Status:** Owner-approved direction change. This addendum supersedes earlier assistant-proposed JuggleIM-first architecture recommendations.

## Binding direction

The owner explicitly instructed: change the project documents and build Jetson Messenger from scratch after reconsidering whether JuggleIM was the wrong foundation.

1. Jetson Messenger is to have a first-party Jetson backend designed for the product.
2. JuggleIM/JuggleChat is not the selected backend, transport foundation or mandatory dependency.
3. Stop spending engineering cycles on the previous JuggleIM integration blocker (including error 11013) unless the owner explicitly reopens that investigation.
4. Preserve existing work and history. Do not delete the JuggleIM PoC, SDK audits, deployment files or diagnostic logs in this reset. Mark them as historical/superseded and prevent agents from treating them as current implementation requirements.
5. Do not weaken or remove E2EE. Build the security architecture around vetted, maintained cryptographic protocol implementations; never invent cryptographic primitives.
6. Keep the approved product concept, feature scope, commercial terms and owner-approved requirements unchanged. This is a technical architecture reset, not a product reset.
7. Do not merge to main or deploy as part of this documentation change.

## Implementation principle

Build Jetson-owned identity, authorization, conversation and messaging domains, durable message lifecycle, sync, media authorization, push integration, moderation and administration. Start with a modular monolith and split services only when measurements justify it. A candidate Go + PostgreSQL backend, WebSocket gateway, S3-compatible object storage and optional Redis/Valkey is documented in `docs/architecture/GREENFIELD_ARCHITECTURE.md`; this stack is a proposal pending ADRs, not a hidden irreversible decision.

## Agent instructions

- Do not use JuggleIM SDKs, APIs, server identifiers or deployment stack in new Jetson production code.
- Do not run or fix JuggleIM integration workflows as the next project milestone.
- Do not silently migrate to Matrix. Matrix may be evaluated as a reference/alternative, but the owner's selected direction is a first-party Jetson backend.
- First inventory and classify existing files. Retain reusable Android UI/configuration and generic CI/testing assets; isolate JuggleIM-only PoC assets as legacy.
- Before implementation, create ADRs for API/auth, realtime protocol, E2EE, data model/durability, media, push and deployment.
- Implement one vertical slice: two accounts → authenticated connection → authorized direct message → durable storage → recipient delivery → history/sync → Android UI.
- Every stage requires real tests and evidence. Do not claim completion based on documentation or a green workflow that did not exercise the relevant behavior.

## What this does not authorize

This direction does not authorize changing approved product requirements, adding paid providers, purchasing infrastructure, exposing secrets, merging branches, deploying, or releasing. It does authorize updating project documentation and preparing a greenfield implementation plan on a separate branch.


## LansetSpBot carry-forward — mandatory reliability baseline

The owner explicitly instructed that Jetson must retain and apply the valuable engineering work accumulated in LansetSpBot. The reviewed source is `Elusivedamir/LansetSpBot_Windows`; the detailed static review is `docs/research/LANSETSPBOT_REUSE_AUDIT.md`.

Carry forward the **engineering patterns**, not Telegram or Windows implementation details:

- Distinct business-operation, execution-job and individual-delivery records/state machines; terminal-state protection and explicit legal transitions.
- Durable intent/outbox and receipt/inbox patterns; idempotency keys; duplicate suppression; explicit `UNCERTAIN` outcomes when dispatch may have happened but acknowledgement is missing.
- Reconciliation before retry; provider-neutral error classification; bounded backoff/jitter; retry-after handling; dead-letter/manual review and replay safety.
- Atomic database reservation/enqueue/finalization; compare-and-set or row-version checks; worker leases; deterministic tests for concurrency, cancellation races, stale events and restart recovery.
- Ordered fail-closed startup phases and truthful readiness; privacy-safe structured observability, centralized redaction and consent-based diagnostic export.
- Recoverable migrations, integrity checks, backup/restore tests, dependency/license/security audits, SBOM, pinned CI actions and release provenance.

These controls apply to **the messenger core as well as Jetson Business**: message acceptance, fan-out, per-device delivery, read receipts, push dispatch, media processing, synchronization, AI and payment side effects where applicable. They are not limited to bulk campaigns.

Do not transplant Telethon/Telegram RPCs, Telegram rate-limit rules, PySide6 UI, Windows DPAPI/ACL code, SQLCipher desktop-profile layout, local account identifiers, dependency pins or experimental scaffolds. Reimplement each invariant using Jetson-owned contracts and the approved platform's secure primitives. A pattern in LansetSpBot is a design reference, not proof that a Jetson implementation is production-ready.

The source audit found a red dependency-audit result at the reviewed source revision. No LansetSpBot dependency lockfile or third-party package set is approved for Jetson. Verify current source ownership/provenance and every third-party license before any source-code or asset reuse.

**Status:** [СОГЛАСОВАНО] reuse and application of the above engineering patterns; [НЕ СОГЛАСОВАНО] bulk copying or direct adoption of LansetSpBot modules; [ВОПРОС] Jetson-specific schemas, queue technology, state names and provider capabilities remain subject to ADRs and tests.
