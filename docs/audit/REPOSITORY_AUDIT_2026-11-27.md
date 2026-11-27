# Jetson Messenger — repository and engineering audit

**Audit date:** 2026-11-27  
**Audited repository:** \`Elusivedamir/jet\`  
**Audit base:** \`project/greenfield-reset\`  
**Audit branch:** \`docs/jet-audit-and-roadmap-2026-11-27\`  
**Status:** evidence-based snapshot; not a production-readiness certification.

## 1. Executive conclusion

Jetson has a useful, increasingly rigorous **message-persistence research and test foundation**, but it is not yet a working messenger and is not ready to select a production architecture from the evidence currently documented.

The repository has progressed through:
- product/business-plan transcription and requirements;
- user-journey definition;
- message state-machine and outbox contracts;
- an in-memory reference model;
- SQLite and PostgreSQL persistence prototypes;
- adapter conformance, migration/backup, pool and serial benchmark experiments;
- process/concurrency/recovery tests.

These are valuable engineering assets. They must now be consolidated into an architecture decision process and then into a first vertical product slice. Continuing to add isolated persistence experiments without an agreed decision gate would have diminishing value.

**Recommended direction:** close the evidence gaps that can change the architecture, produce a documented ADR with explicit unknowns, then implement the smallest end-to-end free-messenger journey behind the approved technical baseline. Do not start CRM/campaigns before the core message journey works.

## 2. Product authority and non-negotiable constraints

The preserved business-plan PDF remains the authoritative product source. The structured baseline says it reflects all 15 sections and seven pages of owner-supplied text dated 2026-11-23; it also explicitly records that a page-by-page/binary PDF text verification has not yet been performed. The PDF itself must remain unmodified.

Product constraints carried into this audit:
- Free personal messenger first: registration, personal profile, direct messages, basic chats, and chat/channel creation as staged.
- Jetson Business attaches to the same personal account; it is not a separate corporate identity.
- Business scope includes CRM, internal campaigns, KPI/analytics, premium business profile and included AI assistant.
- Reference price is approximately USD 5/month and remains a hypothesis, not a final approved price.
- Trial is up to seven days; recurring billing requires explicit advance auto-renewal consent and a payment method, with clear price/date/cancellation disclosure and a reminder.
- First-release business messaging is inside Jetson only; email, SMS and other messenger channels are out of scope.
- Consent, unsubscribe/preferences, suppression, service-vs-marketing separation, duplicate suppression and anti-abuse controls are mandatory for campaigns.
- High throughput is a goal to validate, not a measured promise. No claim of unlimited delivery or immunity from blocking.
- Developer portal, public API and developer documentation are deferred until after launch.
- Stage order remains: (1) messenger core; (2) Business, trial, CRM, business profile and basic campaigns; (3) analytics and AI; (4) scaling, extended segmentation, API and developer documentation.
- Premium predominantly black visual direction; detailed UI remains iterative.

No technical finding in this audit changes product scope, price, roadmap, billing promises, security promises or release stages.

## 3. Repository state and pull-request inventory

Snapshot retrieved from GitHub on 2026-11-27. The recent-PR endpoint returned 38 PRs (#1–#38); the table below groups all returned PRs by current status. "Closed, not merged" is not equivalent to accepted work.

### 3.1 Open PRs

| PR | Title / branch | Base | Audit assessment |
|---:|---|---|---|
| #38 | PostgreSQL independent-process outbox claim test; \`engineering/postgres-multiprocess-claim-fencing\` | \`project/greenfield-reset\` | Relevant test-only increment. Mergeable flag true, but no commit status checks were returned for head SHA. The associated workflow run surfaced by the connector is named "Message reliability and SQLite adapter tests"; it does not establish that the new PostgreSQL multiprocessing test ran. Require explicit PostgreSQL workflow evidence before approval. |
| #26 | PostgreSQL outbox adapter comparison; \`engineering/postgres-adapter-poc\` | \`project/greenfield-reset\` | Draft experiment. Valuable candidate evidence, not a production database decision. No commit status checks were returned for head SHA. |
| #13 | Architecture synthesis task brief; \`research/architecture-synthesis-task\` | \`research/repository-landscape\` | Task staging only. It is not the architecture synthesis result. The expected synthesis output was not found at the checked path on the research branch. |
| #9 | Security, licensing and operations report; \`agent/klinch-45263308927\` | \`research/repository-landscape\` | Incomplete diligence report. Its own body says live upstream revisions, full license trees, advisories and upstream tests were not verified because network access failed. Do not treat security/license gates as passed. |
| #8 | Harden KLINCH research workflow; \`fix/klinch-agent-workflow-hardening\` | \`research/repository-landscape\` | Workflow maintenance change on a research branch; review separately from product/architecture work. |
| #1 | Android JuggleIM PoC; \`project/foundation-and-juggleim-poc\` | \`main\` | Historical/isolated PoC, explicitly not the MVP or approved production stack. Keep out of the greenfield product path; do not merge to main. |

### 3.2 Closed and merged PRs

| PRs | Merged into / increment |
|---|---|
| #37–#33 | \`project/greenfield-reset\`: PostgreSQL hard-process recovery, multi-conversation concurrency, persistence stress, pooled/unpooled comparison and repeated serial benchmark. |
| #31, #30, #29, #28 | \`project/greenfield-reset\`: SQLite/PostgreSQL workload baseline, schema registry/backup-restore, shared adapter conformance and PostgreSQL adapter harness. |
| #25, #21, #20, #19 | \`project/greenfield-reset\`: outbox contract, bounded retry/dedup, reliability CI and narrow integration of message-reliability work. |
| #18, #17, #16, #15, #14 | Stacked research/engineering branches: architecture research correction, reliability contracts, reference model, SQLite experiment and consolidation. |
| #6, #5, #3 | \`main\`: earlier KLINCH workflow/secret-name/manual-dispatch changes. These do not validate the current greenfield workflow copies. |
| #2 | \`project/foundation-and-juggleim-poc\`: guarded AI-engineer foundation on the historical PoC branch. |

### 3.3 Closed, not merged PRs

#32, #27, #24, #23, #22, #7 and #4 are closed without merge. Some are superseded stacked CI/documentation attempts; #7 is the earlier LansetSpBot/first-party alignment proposal and is superseded by the later technology-neutral reset. Their closure must not be reported as a successful merge.

### 3.4 Branch and automation hygiene

The existing \`docs/governance/REPOSITORY_INVENTORY.md\` is a historical snapshot, not a current inventory: it lists only a small subset of branches and predates much of the #15–#38 engineering sequence. Refresh it before relying on its branch counts or ancestry statements.

The inventory documents workflow defaults that still require direct verification/fix:
- copied KLINCH workflow defaults to obsolete \`feature/ai-engineer-foundation\`;
- branch allowlist does not include the current \`research/*\` / \`work/*\` scheme;
- manual workflow defaults to obsolete \`project/foundation-and-juggleim-poc\`;
- workflow dispatch uses the workflow definition on the default branch, so editing only the greenfield copy does not change the active workflow on \`main\`;
- existing automation has contents/PR write permissions and must be narrowly scoped.

Before enabling autonomous coding again, verify the default-branch workflow, branch validation, token permissions, provider budget limits, secret naming, concurrency and artifact/report behavior. Never print secrets into logs.

## 4. Engineering evidence: what is proven

### 4.1 Reliability contracts and reference model

The repository contains:
- message reliability test plan;
- message state-machine contract;
- outbox dispatch contract;
- in-memory reference model;
- SQLite and PostgreSQL adapters used only as experiments.

The contracts make useful distinctions:
- accepted means durable logical message plus recoverable delivery intent;
- outbox dispatch acknowledgement is not device delivery, display or read;
- ordering is per recipient within a conversation, not global;
- idempotency keys and receiver deduplication are required for retry safety;
- exactly-once network delivery is not claimed;
- lease tokens fence stale workers; retries are bounded and dead-letter behavior is explicit.

### 4.2 CI evidence recorded in the validation log

The current engineering validation log records:
- 51 tests passed in the integrated reference-model + SQLite suite on runs #70 and #74;
- 60 tests passed in a later combined run including PostgreSQL 16 integration tests;
- 78 tests passed after shared adapter conformance scenarios;
- 81 tests passed after PostgreSQL schema registry and logical backup/restore;
- 90 tests passed in the pooled PostgreSQL increment, consisting of 26 reference-model, 34 SQLite and 30 PostgreSQL tests.

These are historical, scoped test results from the commits/runs identified in the validation log. They do not prove the current branch tip passes all tests, nor do they prove production message delivery, mobile sync, real network transport, E2EE, production operations, security, availability or load capacity.

### 4.3 Persistence benchmark evidence

Five-trial serial workload results recorded in \`docs/testing/ENGINEERING_VALIDATION_LOG.md\` and \`docs/testing/PERSISTENCE_WORKLOAD_BASELINE.md\`:

| Metric (median) | SQLite local file | PostgreSQL fresh connection | PostgreSQL pool 1–4 |
|---|---:|---:|---:|
| Acceptance throughput | 895.00 ops/s | 94.48 ops/s | 443.39 ops/s |
| Acceptance p50 / p95 | 1.061 / 1.319 ms | 10.565 / 10.994 ms | 2.112 / 2.775 ms |
| Outbox claim + ack throughput | 289.69 ops/s | 34.36 ops/s | 73.94 ops/s |
| Outbox claim + ack p50 / p95 | 3.586 / 4.515 ms | 30.589 / 34.475 ms | 14.780 / 18.790 ms |

Interpretation:
- pooling materially improves the tested PostgreSQL prototype versus opening a new connection per operation;
- the benchmark is serial and small (100 messages / 200 recipient intents per trial);
- SQLite is a local file; PostgreSQL is a service container over the runner network;
- no concurrent sender/dispatcher workload, production hardware, transport/device traffic, production-like data volume, controlled cache regime or statistically strong capacity test is represented.

**Conclusion:** these results do not select SQLite or PostgreSQL for production. The next useful comparison is controlled concurrency (1, 4 and 16 workers), plus resource/lock/pool-wait measurements and operational-cost modeling.

### 4.4 Latest PR #38 verification gap

PR #38 adds a multiprocessing contention test to \`tests/postgres_adapter\`. The fetched head SHA is \`49b6370b18a4c21f2ba3f6c5365c6c991c4b3037\`. The commit-status query returned no status checks. The workflow run associated by the available commit-workflow endpoint was run #45349515731, named "Message reliability and SQLite adapter tests", conclusion success. That name is not evidence that the new PostgreSQL multiprocessing test executed. Treat #38 as **not fully validated** until the PostgreSQL 16 workflow explicitly runs the new test and its job log/artifact is inspected.

PR #26 head SHA \`c5eaab55a8e4fe38bd48ea270133fa8beb99fc04\` also returned no commit status checks in the audit. Do not label its latest head green without a specific run.

## 5. Material gaps before architecture selection

1. **Current reproducibility:** rerun the documented suites on the current project branch tip and record exact commit SHA, workflow run, test counts and artifacts.
2. **Multiprocess PostgreSQL:** prove PR #38's new test actually ran against PostgreSQL 16; add cleanup/timeout/failure-path assertions if review finds gaps.
3. **Concurrency benchmark:** run 1/4/16 sender and dispatcher workers against SQLite, PostgreSQL unpooled and PostgreSQL pooled; preserve ordering and no-loss assertions.
4. **Database operations:** complete versioned migration chain and test upgrades from supported prior schemas; test backup/restore from a clean environment; document recovery objectives as open until measured.
5. **Architecture comparison:** compare credible complete shapes, not just databases: monolith/modular monolith vs service split; direct database outbox vs broker-backed dispatch; sync/realtime protocol options; identity/session and multi-device model; mobile/web client implications.
6. **Security and privacy:** current pinned upstream source/license review, dependency provenance/SBOM, threat model, authorization boundaries, secrets, abuse controls, data retention and privacy-safe observability. No security audit is complete.
7. **Transport and client:** no production transport, real client/server integration, push, offline sync, multi-device behavior or E2E journey is demonstrated by the persistence experiments.
8. **Business-plan traceability:** verify the preserved PDF against the structured transcription page by page and trace each MVP requirement to tests/acceptance evidence.
9. **Workflow governance:** repair/verify stale workflow defaults and ensure agent cannot target main or obsolete PoC branches.
10. **Product decisions still open:** registration method, identity/handle discovery, group/channel permissions, message edit/delete, attachments, read receipts, E2EE scope, data region, launch countries, moderation policy and service-level targets. These must be surfaced as owner decisions, not silently guessed.

## 6. Recommended gate sequence

- **Gate A — clean baseline:** current branch inventory, current CI rerun, PR #38 PostgreSQL test verified, obsolete PRs clearly classified.
- **Gate B — architecture evidence:** concurrent persistence workload, migration/restore evidence, repository/security/license diligence and system-shape comparison.
- **Gate C — architecture decision:** publish ADR with chosen baseline, rejected alternatives, evidence, assumptions, costs, risks, reversibility and unresolved owner decisions. No production selection before this gate.
- **Gate D — first vertical slice:** implement one complete personal-user journey (registration/authentication, open/create direct conversation, send/receive, persist, reconnect/sync, visible failure/retry) with integration tests and a thin client. This is the first actual product implementation.
- **Gate E — core MVP expansion:** basic chats and channel creation, permissions, abuse controls, observability, backup/restore and release acceptance.
- **Gate F — Business:** only after core is stable, implement subscription/trial lifecycle, CRM, consent-based internal campaigns, KPI, business profile and AI in the approved stage order.

## 7. Explicit non-decisions

This audit does **not** approve:
- SQLite or PostgreSQL as the production database;
- a broker, realtime transport, protocol, backend language/framework, mobile framework or hosting provider;
- JuggleIM, Matrix, LansetSpBot, Chatwoot or any other repository as the foundation;
- an E2EE design or a claim that E2EE is delivered;
- a throughput, uptime, availability, scale or delivery guarantee;
- any change to business plan, pricing, trial, product scope or roadmap.

## 8. Source documents reviewed

- \`README.md\`
- \`docs/product/BUSINESS_PLAN_BASELINE.md\`
- \`docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md\`
- \`docs/product/USER_JOURNEYS.md\`
- \`docs/governance/MASTER_PROMPT.md\`
- \`docs/governance/BRANCHING_STRATEGY.md\`
- \`docs/governance/REPOSITORY_INVENTORY.md\` (identified as stale snapshot)
- \`docs/testing/MESSAGE_RELIABILITY_TEST_PLAN.md\`
- \`docs/testing/MESSAGE_STATE_MACHINE_CONTRACT.md\`
- \`docs/testing/OUTBOX_DISPATCH_CONTRACT.md\`
- \`docs/testing/ENGINEERING_VALIDATION_LOG.md\`
- \`docs/testing/PERSISTENCE_WORKLOAD_BASELINE.md\`
- \`tests/reference_model/README.md\`
- \`tests/sqlite_adapter/README.md\`
- PR metadata/diffs for #1–#38 as returned by the repository PR listing, with detailed review of #1, #8, #9, #13, #26 and #38.

This is a repository-state audit, not a complete source-code security review or an exhaustive re-review of every historical PR diff.
