# Jetson Messenger — implementation readiness and next-step plan

**Date:** 2026-11-27  
**Planning baseline:** `project/greenfield-reset`  
**Status:** proposed execution sequence; technical choices remain open.

## Objective

Move from research-only persistence experiments to a defensible architecture decision and then to a demonstrable end-to-end Jetson core. Do not continue adding experiments unless they close a decision-critical gap.

## Workstream 0 — governance and reproducibility

**Deliverables**
- Refresh branch/PR inventory and classify merged, closed-unmerged, historical and active work.
- Re-run current reference-model, SQLite and PostgreSQL suites on exact current commits.
- Verify PR #38 test runs in PostgreSQL 16; capture job log and artifact.
- Correct stale workflow defaults/allowlists and verify the workflow actually used by default-branch dispatch.
- Confirm agent branch guardrails, least-privilege GitHub permissions, provider spend caps, secret naming and safe artifact handling.

**Exit criteria**
- Current baseline SHA recorded.
- CI checks map to the actual changed test packages.
- No workflow can silently target `main` or the obsolete JuggleIM PoC.
- Audit and inventory documents match the repository state.

## Workstream 1 — close persistence evidence gaps

**Deliverables**
- Run reproducible sender/dispatcher concurrency at 1, 4 and 16 workers for SQLite, PostgreSQL fresh-connection and PostgreSQL pooled variants.
- Use identical logical workloads, dataset sizes and correctness assertions.
- Record throughput, p50/p95/p99 latency, CPU, memory, DB connections, pool wait, lock wait, retries and error rate.
- Include contention across one hot conversation and many independent conversations.
- Test lease expiry, stale-worker fencing, process termination and recovery under concurrent load.
- Finish a versioned PostgreSQL migration path and upgrade tests.
- Exercise backup/restore from a clean environment and document measured recovery steps.

**Exit criteria**
- All candidates pass the same contract suite.
- Raw results and scripts are retained as CI artifacts.
- Methodology and environmental differences are disclosed.
- No production database choice is made solely from serial CI numbers.

## Workstream 2 — architecture synthesis and ADR

Compare complete architecture shapes, not isolated technology popularity:
- modular monolith versus early service decomposition;
- direct database outbox versus broker-backed dispatch;
- candidate realtime protocols and client synchronization patterns;
- authentication/session lifecycle and multi-device model;
- client platform options and deployment/operations model;
- encryption/privacy boundaries and moderation/abuse controls.

For each candidate, document requirement fit, maturity, license, maintenance, security, operational burden, expected cost, scaling path, failure modes, lock-in and migration/reversibility.

**Deliverables**
- evidence-linked architecture comparison;
- threat-model outline and trust boundaries;
- explicit open owner decisions;
- ADR with selected baseline only after Gates 0–1 evidence is sufficient.

**Exit criteria**
- Every major choice has an evidence-backed rationale and rejected alternatives.
- Unknowns remain labelled unknown.
- The ADR does not change product scope or business-plan commitments.
- Owner review/approval is obtained before the selected stack becomes binding.

## Workstream 3 — first product vertical slice

After architecture approval, implement a thin, end-to-end slice of the free messenger:

1. Registration/sign-in with the approved identity and session model.
2. Create/open a direct conversation.
3. Send a text message with client operation/idempotency key.
4. Persist message and recoverable recipient delivery intent atomically.
5. Deliver to a second real test client over the selected transport.
6. Reconnect and synchronize missed messages without loss or unintended duplicates.
7. Show accurate sending/sent/failed/retrying states.
8. Enforce server-side authorization on every operation.
9. Record privacy-safe operational events and error traces.

**Acceptance**
- automated server integration tests;
- two-client end-to-end test in CI or reproducible test environment;
- restart/reconnect test;
- duplicate/retry/unknown-outcome test;
- authorization-negative tests;
- no false claim that outbox acknowledgement equals device delivery or read.

This is the first milestone that should be described as actual messenger functionality. Persistence adapters alone are not a messenger.

## Workstream 4 — complete free-core MVP

Only after the vertical slice is stable:
- personal profile and settings;
- basic chats;
- chat/channel creation with approved visibility and permissions;
- participant roles and moderation baseline;
- contact discovery policy;
- abuse reporting, blocking/rate controls and account recovery;
- attachments and push only when their scope/security/storage implications are decided;
- backup/restore, observability, deployment, migrations and operational runbooks;
- accessibility, responsive layouts, localization and black premium design implementation.

**Exit criteria**
- all Stage 1 product requirements trace to automated/manual acceptance evidence;
- security, reliability, privacy and operational release gates pass;
- free users can complete core communication without Business or payment setup.

## Workstream 5 — Business stages (do not pull forward)

Implement only after the free core release gate:
- subscription and trial consent/billing lifecycle;
- safe demo dataset and limited consented test campaign;
- CRM customer cards/history/notes/status/segmentation;
- internal campaign templates, scheduling and reporting;
- consent/preferences/unsubscribe/suppression and anti-abuse;
- KPI event semantics;
- premium business profile;
- AI assistant with measured cost controls.

Do not implement external email/SMS channels or developer API ahead of the approved roadmap.

## Suggested immediate task order

| Order | Task | Why now | Output |
|---:|---|---|---|
| 1 | Record verified #38 PostgreSQL CI and rerun current test baseline | #38's 33-test PostgreSQL job is now confirmed; branch-tip suites still need a fresh run | Evidence update in validation log |
| 2 | Refresh repository/branch/PR inventory | Current inventory is stale | Updated inventory |
| 3 | Run 1/4/16-worker persistence tests | Closes major database/outbox evidence gap | Benchmark report + raw artifacts |
| 4 | Complete migration/restore and failure testing | Operational readiness gap | Migration/restore report |
| 5 | Complete architecture comparison and ADR | Stops endless unstructured research | Owner-reviewable decision |
| 6 | Build first real two-client message slice | Turns research into product | Running end-to-end core |

## Explicitly not authorized by this plan

- merging any PR;
- changing `main`;
- deploying production infrastructure;
- selecting a paid provider or incurring cloud/API spend;
- changing the business plan, pricing, product stages or user promises;
- adopting a historical JuggleIM/LansetSpBot/Chatwoot base;
- claiming production readiness from prototype tests.
