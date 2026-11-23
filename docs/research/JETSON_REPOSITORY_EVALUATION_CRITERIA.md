# Jetson-specific repository evaluation criteria

**Status:** Research method derived from the owner's complete Jetson Messenger business plan (2026-11-23).  
**Purpose:** compare full products and separable components against actual Jetson requirements without selecting a stack or adopting any repository wholesale.

## 1. Evaluation unit

Every review must state what is being evaluated:
- **Full product/platform** — complete user-facing product and its operational model.
- **Server/backend** — identity, messaging, synchronization, storage, campaign delivery, APIs.
- **Client** — mobile, web, desktop user experience.
- **Protocol/standard** — interoperable behavior and ecosystem.
- **Component** — a separable function such as queue, search, analytics, AI gateway, billing or push.
- **Adjacent reference** — useful engineering or business workflow pattern, not a direct messenger candidate.

Do not compare an SDK, a server, and a full product as if they were interchangeable.

## 2. Requirement mapping

Each candidate must be mapped to relevant requirement IDs in `docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md`.

### Stage 1 — free messenger
- Registration, identity and recovery: CORE-001/002.
- Direct and group communication: CORE-003/004/005.
- Persistence, delivery correctness, sync and offline behavior.
- Client coverage and usability.
- Security/privacy and operational maturity.

### Stage 2 — Business
- Personal-account subscription and lifecycle: BIZ-001–004.
- CRM records, conversation context, notes, statuses and segments: CRM-001–004.
- Internal campaigns, templates, scheduling and reports: CAM-001–003.
- Consent, unsubscribe, classification, duplicate suppression and abuse: CAM-004–008.
- Premium profile and included AI: PROFILE-001, AI-001/002.

### Stage 3 — analytics and AI
- Truthful delivery/read/reply/click/conversion events: KPI-001–006.
- AI data boundaries, user confirmation and cost controls: AI-003 and AI-001/002.

### Stage 4 — scale
- Independent scaling, rate control, measured capacity and campaign recovery: SCALE-001–004.
- API/developer portal are future scope, not first-release requirements.

A candidate may be valuable for one capability without being suitable as the whole platform. Record the capability boundary explicitly.

## 3. Weighted evidence score (screening aid, not a decision)

Use 0–5 per dimension, with a short evidence note. Calculate a weighted score only when there is enough evidence. If a dimension is unknown, mark it **Unknown**, do not award a neutral 2.5 or silently score it zero. Show coverage and confidence next to any total.

| Dimension | Weight | What is being tested |
|---|---:|---|
| Messaging correctness and recovery | 20 | Persistence, ordering semantics, retries, deduplication, offline delivery, restart recovery, failure handling |
| Security, privacy and abuse resistance | 15 | Threat model, identity/session security, access control, privacy, consent enforcement, abuse controls, incident response |
| Jetson product capability fit | 15 | Relevant requirements: free chat, personal account, CRM, campaigns, analytics, AI, subscription; distinguish native vs custom work |
| Campaign delivery and data integrity | 15 | Durable queues, scheduling, rate control, suppression, consent recheck, idempotency, observability, reporting correctness |
| Operations, scale and unit economics | 12 | Deployment, monitoring, backups/restore, scaling evidence, resource profile, cost drivers and operational burden |
| Tests and reproducibility | 10 | Integration/E2E, load, fault injection, migration, repeatable builds and documented test evidence |
| Maintenance and release health | 8 | Recent releases, security response, maintainers, issue/PR health, dependency health, bus factor |
| Documentation and developer experience | 3 | Setup, architecture, operations, upgrade and troubleshooting documentation |
| **Total** | **100** | |

### Scoring scale

- **0 — absent or contradicted:** verified evidence shows the capability is missing or unsafe.
- **1 — weak:** only partial/manual capability, substantial gaps.
- **2 — limited:** basic support, important production gaps remain.
- **3 — credible:** implemented and documented; some limitations.
- **4 — strong:** broad implementation with tests and operational evidence.
- **5 — exceptional evidence:** mature, reproducible and independently corroborated evidence.
- **Unknown:** not reviewed or evidence inaccessible; never converted into a score.

A high score is not a recommendation by itself. State the exact capability being reused, integration cost, maintenance burden and exit path.

## 4. Non-compensable gates

A candidate cannot be recommended for reuse merely because its weighted score is high if any of these remain unresolved:
1. License or commercial terms prevent the intended use, or provenance cannot be established.
2. Known critical security issue has no acceptable mitigation or upstream response.
3. Abandoned/unmaintained critical dependency without a credible ownership/maintenance plan.
4. Critical behavior cannot be reproduced or tested.
5. Candidate requires violating Jetson's product invariants (for example, sending to recipients without consent, separate mandatory AI tariff, or external channels in first release).
6. Data export/migration or operational control is unacceptable for the role proposed.

Gate status: Pass / Fail / Unknown. Unknown is not Pass.

## 5. Popularity and third-party ratings — separate evidence axes

Record separately:
- GitHub stars and forks, with snapshot date;
- contributors and recent activity;
- release cadence and issue/PR health;
- external score provider, exact score, date, methodology and link;
- independent security/reliability evidence.

Stars are attention/popularity signals, not a quality rating. Third-party ratings are not directly comparable unless they share a methodology and date. Never blend RepoGrade, TrustOSS, RepoHealth, OpenSaurus, ToolVitals or similar scores into the internal weighted score. Verify individual project pages before recording a numerical external grade.

## 6. Required evidence for a deep review

For each shortlisted candidate capture:
- exact repository URL, commit/tag and review date;
- exact source paths and docs inspected;
- license files and third-party notices;
- architecture/data model and trust boundaries;
- message lifecycle and delivery-state semantics;
- failure paths: crash, timeout, retry, duplicate, partial write, broker/storage outage;
- campaign lifecycle and consent enforcement where applicable;
- security advisories and response process;
- tests actually run, environment and results; distinguish source inspection from execution;
- deployment, upgrade, backup/restore and observability;
- measured performance evidence and workload; label vendor claims vs independent measurements;
- strengths, weaknesses, missing features, integration/exit cost;
- Jetson requirement IDs served and those left unsatisfied.

No claim of runtime correctness, load capacity or security audit may be made from README/source inspection alone.

## 7. Research decision states

- **Reject:** failed gate or material mismatch.
- **Keep for learning:** valuable pattern, not a reuse candidate.
- **Deep audit:** sufficient relevance to justify deeper source/test/security/ops inspection.
- **Potential component:** separable capability worth a focused proof of concept.
- **Potential platform candidate:** complete product/backend deserves comparative prototype only after requirements and integration boundaries are clear.

Do not select a final platform from star count, external grade or a single benchmark.

## 8. Current priority order for research

1. Messaging core and identity/session lifecycle.
2. Persistence, ordering, offline sync, duplicate suppression and failure recovery.
3. Campaign queue/delivery, consent and unsubscribe enforcement.
4. CRM data model and conversation linkage.
5. Analytics event correctness and attribution.
6. Subscription/trial lifecycle.
7. AI privacy, cost and provider portability.
8. Operations, load testing and total cost.

This is a research order, not a decision to implement each as a separate microservice.
