# Jetson Architecture Decision Log

Review date: 2026-11-23. Research only; no technology or product scope is approved.

| ID | Status and decision | Evidence needed to close | Reversal cost |
|---|---|---|---|
| ADR-001 | Proposed: modular monolith with strict domains and durable campaign workers | Message/campaign harness, crash, load and restore tests | Medium |
| ADR-002 | Open: extract messaging/campaign workers when measured isolation requires it | Queue lag, chat SLO, burst and cost benchmarks | Medium |
| ADR-003 | Proposed: one owning domain per write; explicit event/projection boundaries | Contract/replay, export/import and authorization tests | Medium |
| ADR-004 | Open: idempotency and unknown-outcome reconciliation | Duplicate, timeout and crash-after-acceptance experiments | High |
| ADR-005 | Proposed: audience snapshots, dispatch consent checks, suppression, dedupe and rate control | Consent race, worker crash and abuse tests | Medium |
| ADR-006 | Open: E2EE scope, keys and Business compatibility | Threat model, device/recovery and product/legal review | High |
| ADR-007 | Open: launch countries, legal basis, retention and residency | Counsel review and lifecycle prototype | High |
| ADR-008 | Open: payment failure, trial, grace, refund and cancellation | Payment sandbox and acceptance tests | Medium |
| ADR-009 | Open: AI provider boundary, data, retention, limits and fallback | Privacy/redaction and unit-economics tests | Medium |
| ADR-010 | Open: numerical SLO, RPO/RTO and scale targets | Reproducible workload, fault injection and restore evidence | Medium |
| ADR-011 | Blocked for reuse: no upstream repository is Jetson foundation | Component legal/provenance review and focused POCs | N/A |

Pinned manifest revisions used: OpenIM a101d85ec16cc21bec60005169725adc1ae5649a; Synapse 0c287237cbb96814282f1bc207e5e6c4407fb8a0; Tinode fd8801cdea3f2984008b0cdf38a253060515ce04; ejabberd afe6393701939f0baf45a1580a30a41bb91700bf; Chatwoot 576e4f88cd3e5e312ce8fff73b04643e44726ffd; Twenty 8218d05450b1329e439136d8d3ef99ea0547dfc4; Listmonk 47a24dfe8a889b0c7fe8730b0bb7ac24ab571e87; Mautic 838c9c772ec7813d31bd135d22668481e644dcc7; SimpleX 2aed5f082c95a3c9eaeb14308aa03b852e484809; Zulip a7af4399c1943eb4778789de95f09f6d14911e94; Mattermost 4a38cfa4164d01db704464b62f0ee516f5f3a933; Rocket.Chat 77df90cdbcc2e37be2febe5ff668273564b0d543; Signal Server 398888f224289f2e52baa78e2df285ae179eaad0; Fluxer 7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0.

The source reports contain direct GitHub permalinks and inspected paths. Evidence is static inspection and test inventory. No upstream test, build, load, fault-injection, security audit or Android E2E run is claimed. The synthesis's former 365/500-style architecture totals are withdrawn because no dimension-level evidence score or coverage calculation supported them; empirical architecture scores remain Unknown until experiments are run. The business-plan sequence remains Stage 1 messenger, Stage 2 Business CRM/profile/basic campaigns, Stage 3 KPI analytics and AI rollout (AI remains included in Business), Stage 4 measured scale and deferred API/docs. Status: bounded research synthesis complete; implementation decisions remain open.


## Independent review correction

- Fluxer revision discrepancy: the security report's Fluxer paths cite `1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d`, while the synthesis/decision log cite `7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0`. Do not treat the security report's Fluxer observations as verified at the manifest SHA; re-run that source review against one explicitly pinned revision before relying on it.
- Architecture option totals are withdrawn, not rescaled. The three options are hypotheses without implementation-level tests or operational evidence; the 100-point repository rubric cannot yield a defensible weighted score for them yet.
- No decision in this log is an owner-approved technology or product decision. The modular-monolith direction remains a reversible proposal subject to the experiments listed in the synthesis.


The AI rollout stage discrepancy is **resolved on 2026-11-27**: AI-001 and AI-002 were moved from Stage 2 to Stage 3 in the derivative requirements framework to match the canonical business-plan baseline and user journeys. AI remains included in the base Business subscription. No scope or business-plan text changed.


## Independent verification update — 2026-11-27

- **ADR-011 remains Blocked.** The referenced `upstream-sources/MANIFEST.txt` could not be fetched from the staged task branch during the second-pass review (GitHub returned 404). This is an evidence-access limitation, not proof that the original local snapshots did not exist.
- Until the manifest and snapshot files are restored and SHA-verified, report-level source citations remain report-attributed rather than independently reproduced in this branch.
- Fluxer has a pinned-revision discrepancy: security report `1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d` vs synthesis/decision log `7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0`. Keep Fluxer-specific reuse/security conclusions excluded until re-reviewed at one revision.
- No new upstream tests, builds, load/fault tests, legal review, security audit or restore drill were run on 2026-11-27.
- No technology decision is approved by this update; modular monolith remains a reversible proposal.

**Required closure:** restore manifest/snapshot provenance, verify all pinned SHAs, reconcile Fluxer, then update ADR-011 with exact evidence and review results.


### ADR-011 — Partial source-path verification update (2026-11-27)

Five report-cited raw source files were independently retrieved at their pinned upstream revisions (Tinode, Synapse, OpenIM, ejabberd and Listmonk). See `INDEPENDENT_SOURCE_CHECK_2026-11-27.md` for exact paths, observed behavior and limits. This improves confidence in those five narrow source observations only. The source manifest and shallow snapshot directory are still absent from both Jet research branches; remaining citations, complete dependency trees, nested licenses/assets, current advisories and legal reuse clearance are not verified. **ADR-011 remains Blocked.** No upstream code reuse is approved.


### ADR-004/005 — Upstream failure-path validation update (2026-11-27)

The extended delivery source trace identifies high-priority, unconfirmed failure hypotheses in OpenIM's MQ/batcher/cache/Mongo-publish path and a potential sequence-gap window in Tinode's mapper sequence-update/message-save calls. Exact evidence and required fault-injection tests are in `MESSAGE_DELIVERY_FAILURE_RISK_REGISTER.md`. These are not confirmed upstream defects; the outcomes depend on unverified batcher/MQ offset and adapter transaction semantics.

Before Jetson accepts a message, the initial implementation must prove one atomic durable boundary for message identity, conversation position, sender-scoped idempotency and recoverable outbox intent. Fault tests must include enqueue failure, cache/store failure, downstream publish failure, partial batch processing, process death around source acknowledgement, and sequence-allocation/message-insert failure. The safe design remains a proposal until a real adapter passes those tests.
