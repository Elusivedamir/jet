# Agent task 01 — message delivery and data correctness

**Mode:** research only. Do not implement or select a technology.

## Authority and constraints
Read `README.md`, `docs/governance/MASTER_PROMPT.md`, `docs/governance/BRANCHING_STRATEGY.md`, `docs/product/BUSINESS_PLAN_BASELINE.md`, `docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md`, and `docs/research/JETSON_REPOSITORY_EVALUATION_CRITERIA.md` first. The verified business-plan baseline and requirements are binding. Ignore stale notes in older reports if they conflict with those files.

Jetson is greenfield. Existing projects are learning references only. Do not recommend copying a whole stack or selecting a final backend. Do not modify product scope. Do not edit application code. Do not run destructive tests or full Android E2E. No changes to `main`.

## Research assignment
Perform a source-level comparative review of message lifecycle and failure correctness in:
1. OpenIM `OpenIMSDK/Open-IM-Server`
2. Matrix Synapse `element-hq/synapse` (or canonical active upstream if repository moved; document exact repo)
3. Tinode `tinode/chat`
4. ejabberd `processone/ejabberd`

For each, trace one ordinary direct message through:
- API/ingress validation and authorization;
- durable persistence;
- sequence/order assignment;
- queue/event publication;
- online delivery and offline retrieval/sync;
- acknowledgements and read receipts (keep their semantics distinct);
- retry, duplicate suppression and idempotency;
- crash/restart and dependency outage behavior.

Inspect actual source files and tests, not README alone. Pin each reviewed repository to an exact commit SHA and include file paths plus line references or permalink URLs.

## Required failure matrix
Analyze at least:
- DB write fails;
- broker/MQ publish fails after DB write;
- cache write fails;
- consumer crashes before/after ack or commit;
- duplicate event delivery;
- timeout with unknown client outcome;
- reconnect after offline period;
- two concurrent messages in same conversation;
- partial downstream side effects (push/cache/history);
- storage or broker unavailable during restart/recovery.

For every scenario label evidence as:
- **Verified in code/test**
- **Documented claim**
- **Inference / unverified**
Never call a potential issue a confirmed bug without a reproducible test or direct proof.

## Deliverable
Create `docs/research/AGENT_REPORT_MESSAGE_RELIABILITY.md` with:
- executive comparison;
- per-project architecture and lifecycle sequence;
- failure matrix;
- exact source paths/commit SHAs/test names;
- what tests exist and whether you actually ran them (do not claim tests ran if not);
- strengths, risks and unknowns;
- Jetson requirement IDs addressed (CORE-003/004, reliability cross-cutting requirements);
- patterns worth learning and patterns to avoid;
- a prioritized list of further experiments.

Do not write code. A concise report with verifiable evidence is more valuable than broad claims.
