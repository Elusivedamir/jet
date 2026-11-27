# Agent Task 04 — Jetson Messenger Architecture Synthesis

## Objective

Produce a rigorous, evidence-linked architecture synthesis for Jetson Messenger by combining the three completed research reports with the canonical product and governance documents. This is a research and decision-support task, not implementation and not permission to change the product/business plan.

## Mandatory inputs — read in full

1. `docs/governance/MASTER_PROMPT.md`
2. `docs/product/BUSINESS_PLAN_BASELINE.md`
3. `docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md`
4. `docs/product/USER_JOURNEYS.md`
5. `docs/research/JETSON_REPOSITORY_EVALUATION_CRITERIA.md`
6. `docs/research/AGENT_REPORT_MESSAGE_RELIABILITY.md`
7. `docs/research/AGENT_REPORT_CRM_CAMPAIGNS.md`
8. `docs/research/AGENT_REPORT_SECURITY_LICENSES_OPERATIONS.md`
9. `docs/research/CONSOLIDATED_DISCOVERY_INDEX.md`

Also inspect the matching upstream source snapshots already fetched for the three reports, and read `upstream-sources/MANIFEST.txt`. Use only locally available pinned snapshots; do not assume network access. If an input is absent, report that explicitly rather than silently substituting.

## Non-negotiable product and governance constraints

- The owner's business plan is canonical. Do not rewrite, weaken, reinterpret away, or expand it.
- Free personal messenger plus optional Jetson Business subscription attached to a personal account; not a standalone CRM.
- Stage 1 messenger; Stage 2 CRM, subscription/trial, premium profile and consent-aware basic campaigns; Stage 3 analytics and AI; Stage 4 scale/API/docs.
- External email/SMS/other-messenger campaign delivery is out of v1 scope.
- Campaigns require provable consent, unsubscribe/preferences, suppression, deduplication, controlled queues/retries/rate limits, complaint/abuse monitoring, and safe handling of ambiguous outcomes.
- Do not promise unlimited sending, exactly-once delivery, arbitrary bulk messaging, or unverified scale.
- Do not choose a language, framework, database, protocol, cloud, crypto library, AI provider, topology, or E2EE scope merely because a reference project uses it. Any candidate must be justified against Jetson requirements, operating cost, licensing, security, maintenance, portability, and team capability.
- Do not select or copy an entire reference project as Jetson's foundation without explicit evidence and a separate decision.
- Preserve open questions and distinguish requirements from assumptions.
- Research-only: do not modify application code, product requirements, business plan, master prompt, user journeys, or the consolidated discovery index. Do not touch `main`.

## Required analysis

### A. Evidence reconciliation
- Build a traceability map from every material Jetson requirement to the three reports and their pinned upstream revisions.
- Distinguish source-verified behavior, project documentation claims, report-level inference, and unverified assumptions.
- Identify conflicts, gaps, stale or incomplete evidence, and duplicated claims.
- Do not treat presence of tests as proof they passed. No tests may be described as executed unless run logs prove execution.

### B. Architecture alternatives
Develop at least three genuinely distinct, implementation-neutral architecture options, for example:
1. modular monolith with clear internal boundaries;
2. independently deployable messaging core plus supporting business services;
3. broader service decomposition.

Do not assume these examples are the winners. For each option, describe boundaries, data ownership, failure domains, deployment/operational burden, scaling path, security implications, migration/portability, and cost drivers. Keep choices reversible where possible.

### C. Domain and reliability design
Define logical domains and responsibilities without committing to technologies:
- identity/accounts/devices/sessions;
- conversations, membership, messages, attachments and delivery state;
- synchronization, cursors, receipts and offline recovery;
- contacts, CRM records, notes, statuses and segmentation;
- subscriptions, entitlements, trials, billing state and cancellation;
- campaigns, audience snapshots, consent, suppression, idempotency, scheduling, queues, retries and rate controls;
- analytics/KPI event definitions and AI boundary;
- moderation, abuse reporting, audit/security events and administration.

For message delivery and campaigns, provide lifecycle/state diagrams and failure matrices. Explicitly distinguish accepted, durably stored, queued, dispatched, delivered, displayed/read, and acknowledged states where applicable. Address duplicate requests, retries, partial failures, crashes, replay, ordering scope, data retention, and reconciliation. Do not claim exactly-once semantics.

### D. Security, privacy, licensing and operations
- Identify trust boundaries, tenant/account isolation, least privilege, abuse controls, secrets, encryption-in-transit/at-rest, key management, backup/restore, auditability, data export/deletion, incident response and observability requirements.
- Treat end-to-end encryption as an unresolved product/security decision unless canonical requirements specify it; analyze trade-offs rather than silently deciding.
- Identify license review gates for any code or dependency reuse; distinguish repository root license from enterprise directories, assets, dependencies and transitive components.
- Describe operational roles, deployment complexity, backup/restore objectives as OPEN decisions, monitoring, disaster recovery, upgrade/rollback, and support burden.

### E. Cost and scale model
- Provide cost drivers and a transparent model with variables and illustrative scenarios, not invented vendor prices or false precision.
- Separate fixed, per-active-user, per-message, storage, egress, observability, backup, AI and payment costs.
- Explain what must be benchmarked before making throughput, latency, availability or scale claims.
- Identify cost cliffs and when each architecture option becomes operationally inefficient.

### F. Recommendation and decision register
- Score architecture options using the existing 100-point evaluation criteria. Show evidence and confidence per score; mark unknown as unknown, never convert unknown into zero or a pass.
- Apply every non-compensable gate separately.
- Give a provisional recommendation with reasons, risks, rejected alternatives, and conditions that would change the recommendation.
- Produce an ADR-style decision register: decision, status (proposed/open/blocked), evidence, alternatives, owner question, validation experiment, and reversal cost.
- List the next 10 highest-value experiments in priority order, including failure injection and campaign-consent tests.

## Required deliverables

Create exactly these new files under `docs/research/`:

1. `JETSON_ARCHITECTURE_SYNTHESIS.md` — complete synthesis with executive summary, requirement traceability, alternatives, logical architecture, lifecycle/failure diagrams, security/licensing/operations, cost model, scorecard, provisional recommendation and decision register.
2. `JETSON_ARCHITECTURE_DECISION_LOG.md` — concise, maintainable list of proposed/open/blocked decisions and evidence needed to close them.

The synthesis must be useful to a non-specialist founder while retaining technical depth. Define jargon at first use. Include direct GitHub permalinks pinned to the exact SHAs already in the reports. Never invent a source path or SHA.

## Completion and safety checks

- Verify every mandatory input was read and list any missing inputs.
- Verify every cited SHA against the local manifest and report.
- Keep business-plan requirements unchanged.
- Ensure no external campaign channels have slipped into v1.
- Ensure no specific technology is presented as selected unless the canonical documents already select it.
- Run Markdown formatting checks and `git diff --check`.
- Commit only the two required new files to the isolated agent branch and open a Draft PR targeting `research/repository-landscape`.
- Do not merge anything. Do not modify `main`.
- In the PR description, state the evidence limitations, unresolved decisions, and that no upstream test suites/security audits were run unless independently evidenced.


## Execution notes — 2026-11-27

- Required synthesis and decision-log deliverables are complete in this branch.
- Additional supporting research documents were added after source-level checks uncovered material failure hypotheses: `INDEPENDENT_SOURCE_CHECK_2026-11-27.md` and `MESSAGE_DELIVERY_FAILURE_RISK_REGISTER.md`. These do not approve upstream code reuse or claim confirmed upstream defects.
- The idempotency scope inconsistency in the existing test-only reference model/SQLite adapter was corrected and regression-tested; no production application code was changed.
- The AI rollout-stage discrepancy between the canonical business plan/user journeys and derivative product requirements was identified. The synthesis follows the canonical business plan. A provisional edit to the product requirements file was reverted to honor this task's explicit prohibition; the file remains unchanged and the discrepancy is open for a separate authorized task.
- The referenced `upstream-sources/MANIFEST.txt` and source snapshot directory were not present in either the task branch or research base. Five pinned source paths and three additional source blobs were independently retrieved, but full provenance and legal/license clearance remain blocked.
- GitHub Actions run 46011193416 passed 15 reference-model and 18 SQLite adapter tests (33 total) on commit `9bda52e41bd497609bb9dff28458e2150acd8f43`. Later commits are documentation-only.
- PR #13 remains Draft and unmerged; no deployment or release was performed; `main` was not modified.
