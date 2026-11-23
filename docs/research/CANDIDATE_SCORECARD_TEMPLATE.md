# Candidate scorecard template

This scorecard is deliberately unweighted until the canonical business-plan PDF is reconciled. Do not invent weights or mark unknowns as neutral scores.

## Candidate identity

- Repository URL:
- Exact commit SHA / tag reviewed:
- Review date:
- Reviewer:
- Project category: full messenger / server / client / SDK / protocol / infrastructure / adjacent business tool
- Upstream status: active / maintenance-only / archived / unclear

## Evidence matrix

For each row record: status (verified / partial / absent / unknown), source path or URL, exact version/commit, evidence summary, unresolved question, confidence.

| Area | Evidence to collect | Status | Evidence link / commit | Notes / risk |
|---|---|---|---|---|
| Product fit | Business-plan requirement IDs and page references | Unknown | | Cannot score before PDF reconciliation |
| License | Root license, per-directory licenses, third-party notices, commercial/hosted restrictions | Unknown | | Legal review where needed |
| Identity | Registration, authentication, account recovery, device/session management | Unknown | | |
| Messaging correctness | Ordering, idempotency, retries, deduplication, offline delivery | Unknown | | |
| Sync | Multi-device state, cursors, history, edits, deletes, receipts | Unknown | | |
| Groups | Membership, roles, invites, moderation, history semantics | Unknown | | |
| E2EE | Protocol, threat model, key lifecycle, multi-device, backups, group changes | Unknown | | Never infer from marketing claims |
| Media | Upload/download, encryption, limits, scanning, retention, object storage | Unknown | | |
| Push | Provider integration, token lifecycle, retry, collapse, privacy | Unknown | | |
| Abuse controls | Rate limits, spam, reporting, blocking, moderation, account bans | Unknown | | |
| Business functions | Only those explicitly required by reconciled business plan | Unknown | | |
| Client coverage | Android, iOS, web, desktop, SDKs, accessibility | Unknown | | |
| Operations | Deployment, monitoring, logs, backups, restore, upgrades, HA/DR | Unknown | | |
| Security engineering | SECURITY.md, advisories, dependency scanning, secret handling, release response | Unknown | | |
| Tests | Unit, integration, E2E, load, chaos/failure, migration tests | Unknown | | |
| Maintenance | Release cadence, contributor concentration, issue response, bus factor | Unknown | | |
| Cost | Compute, database, queue, storage, bandwidth, observability, support and labor | Unknown | | |
| Exit / migration | Export formats, APIs, data portability, protocol lock-in, migration tools | Unknown | | |

## Decision states

- **Reject**: disqualifying evidence (license, security, maintenance, product mismatch).
- **Keep for learning**: useful pattern, not a candidate for reuse.
- **Deep audit**: enough evidence to justify code/security/operations review.
- **Potential component**: a separable capability worth testing independently.
- **Candidate for prototype**: only after product-plan traceability and owner approval.

A score is not a decision. Every recommendation must state evidence, uncertainty, trade-offs and exit cost.
