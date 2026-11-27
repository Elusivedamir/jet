# Jetson Messenger — decision log

**Last updated:** 2026-11-27  
**Authority:** preserved business-plan PDF, owner-approved product decisions and evidence linked below.

This log separates approved product decisions from technical recommendations and unresolved questions. A technical experiment does not become an architecture decision merely because its tests pass.

## Decision status vocabulary

- **APPROVED** — explicitly fixed by the owner/business plan.
- **OBSERVED** — verified repository or CI fact, not a product decision.
- **PROVISIONAL** — recommendation for the next work phase; not a production selection.
- **OPEN** — requires evidence or explicit owner decision.
- **REJECTED / SUPERSEDED** — must not be treated as current direction.

## Product decisions

| ID | Status | Decision | Authority / notes |
|---|---|---|---|
| P-001 | APPROVED | Preserve the original business-plan PDF as canonical source; do not edit it. | Business plan and master prompt. |
| P-002 | APPROVED | Free personal messenger core precedes Business. | Plan stages 1–4; requirements document. |
| P-003 | APPROVED | Jetson Business is attached to the existing personal account, not a separate corporate account. | Plan and requirements. |
| P-004 | APPROVED | Business scope includes CRM, internal campaigns, KPI/analytics, premium business profile and included AI assistant. | Plan; implementation is staged. |
| P-005 | APPROVED | Reference price about USD 5/month is a hypothesis, not a final price. | Business-plan baseline. |
| P-006 | APPROVED | Trial up to 7 days; auto-renewal only with explicit advance consent and payment method; disclose billing/cancellation and send reminder. | Plan and acceptance framework. |
| P-007 | APPROVED | First-release business campaigns operate only inside Jetson; no email/SMS/external messenger channels. | Plan and master prompt. |
| P-008 | APPROVED | Campaigns enforce consent, preferences/unsubscribe, suppression, duplicate control and abuse safeguards. | Plan and requirements. |
| P-009 | APPROVED | Product stage order is messenger core → Business/CRM/basic campaigns → analytics/AI → scaling/API/developer docs. | Plan and master prompt. |
| P-010 | APPROVED | Predominantly black premium visual direction; detailed UI remains iterative. | Plan. |
| P-011 | APPROVED | No technical project (JuggleIM, Matrix, LansetSpBot, Chatwoot or another repo) is preselected as the foundation. | Master prompt and greenfield README. |

## Technical evidence and decisions

| ID | Status | Decision / finding | Evidence and limitation |
|---|---|---|---|
| T-001 | OBSERVED | Message state-machine and outbox contracts exist, with an in-memory reference model and SQLite/PostgreSQL experiments. | Engineering validation log and tests. Not production code. |
| T-002 | OBSERVED | Historical combined CI increments recorded 51, 60, 78, 81 and 90 passing tests at their respective commits. | `docs/testing/ENGINEERING_VALIDATION_LOG.md`. These counts are not a current-tip CI guarantee. |
| T-003 | OBSERVED | PostgreSQL connection pooling materially improved the tested serial POC compared with opening a fresh connection per operation. | Five-trial median: acceptance 94.48 → 443.39 ops/s; outbox claim+ack 34.36 → 73.94 ops/s. Small serial CI benchmark only. |
| T-004 | OPEN | Production database is not selected. | Need controlled concurrency, operational model, migration/restore, workload and cost evidence. |
| T-005 | OPEN | Production broker/queue and realtime transport are not selected. | Need architecture/system-shape comparison and end-to-end client/server requirements. |
| T-006 | OPEN | Backend language/framework, client framework, hosting and deployment topology are not selected. | Must compare complete viable options against requirements and team/operations constraints. |
| T-007 | OPEN | Authentication/identity, multi-device, sync cursor, push and E2EE scope are not approved. | Explicit product/security decisions required. |
| T-008 | OPEN | Launch-region, privacy/retention, moderation and operational SLOs are not finalized. | Requires owner/product/legal/security review. |
| T-009 | PROVISIONAL | Prefer a small, modular first-party core and a single end-to-end vertical slice before splitting into services. | Recommendation to reduce integration risk; not an approved stack or architecture. Validate against scale/security requirements in ADR. |
| T-010 | PROVISIONAL | Continue comparing SQLite, PostgreSQL unpooled and pooled only as test candidates until concurrency and operational evidence exists. | No database is selected by current benchmarks. |
| T-011 | OBSERVED | PR #38's independent-process claim test passed in PostgreSQL 16 CI. | Run #45349515731; PostgreSQL job passed 33 tests and log explicitly records `test_independent_processes_cannot_claim_same_item_twice ... ok`. PR remains open; no merge performed. |
| T-012 | OPEN | Security/license diligence is incomplete. | PR #9 report explicitly says live upstream revisions, full license trees and current advisories were not verified. |
| T-013 | OBSERVED | PR #26 PostgreSQL adapter experiment passed its PostgreSQL 16 integration workflow. | Run #45335827757; 10 tests, 0 failures. PR remains draft and does not select a production database. |
| T-014 | OBSERVED | A first concurrent persistence smoke run covers 1/4/16 workers, hot-room and four-room cases across SQLite and both PostgreSQL variants. | Run #45349515731, artifact #14900045788; 40 messages and 80 outbox items per scenario; all integrity checks passed. Short CI smoke only; not a capacity test. |

## Superseded or non-binding work

| Item | Status | Treatment |
|---|---|---|
| JuggleIM Android PoC / PR #1 | SUPERSEDED for product foundation | Retain as isolated historical research; not MVP implementation and not production approval. |
| Earlier LansetSpBot alignment PR #7 | SUPERSEDED | Preserve history; greenfield baseline is current. |
| Old KLINCH agent branch defaults | SUPERSEDED / unsafe until verified | Must not be used for new autonomous work. |
| SQLite and PostgreSQL adapters | EXPERIMENTS | Keep as evidence/test fixtures; neither is production-selected. |
| Serial benchmark figures | OBSERVATIONS | Do not convert into capacity, cost or production-performance claims. |

## Change control

Any new technical decision must include:
1. the requirement(s) it satisfies;
2. alternatives considered;
3. evidence and exact revisions/runs;
4. security, license, privacy and operational implications;
5. cost and scaling assumptions;
6. migration/reversibility strategy;
7. unresolved risks and owner decisions;
8. explicit status: approved, provisional or open.

Changes to product scope, price, roadmap, user promises or canonical business plan require explicit owner approval.
