# Jetson Messenger Architecture Synthesis

Review date: 2026-11-23. Status: [ПРЕДЛОЖЕНИЕ]; research only.

## Executive summary

Jetson remains a free personal messenger with optional Business on the same account. Business-plan sequence: Stage 1 is the free messenger core; Stage 2 is Jetson Business subscription/trial, CRM, business profile and basic internal campaigns; Stage 3 is KPI analytics and rollout of the AI assistant; Stage 4 is measured scale and deferred API/developer documentation. AI remains included in the base Business subscription and is not a separate tariff. This preserves the distinction between subscription entitlement and rollout stage. The reports support explicit durable state transitions, account isolation, dispatch-time consent checks, idempotency and reconciliation. They do not prove exactly-once delivery, capacity, E2EE scope, legal compliance or any final technology.

Three implementation-neutral options were compared. Option A is a modular monolith with strict domain boundaries and durable campaign workers. Option B independently deploys messaging/sync and supporting Business services. Option C broadly decomposes identity, messaging, CRM, billing, campaigns, analytics and AI. Provisional recommendation: Option A, with extraction contracts and worker isolation. This is reversible and does not choose a language, framework, database, transport, cloud, cryptographic library, AI provider or topology.

## Evidence reconciliation and traceability

All mandatory inputs were present, including the three reports and upstream-sources/MANIFEST.txt. The reports are static source/test inventories. No upstream test, build, load, fault-injection or security audit ran.

| Requirements | Static source observations in the reports and pinned revisions | Jetson consequence and evidence gap |
|---|---|---|
| CORE-003..005 | Tinode server/topic.go saves before acceptance/broadcast; Synapse synapse/handlers/message.py and synapse/storage/databases/main/events.py provide persistence paths; OpenIM internal/rpc/msg/sync_msg.go provides sequence pull; ejabberd src/mod_offline.erl and src/mod_stream_mgmt.erl provide offline/resume paths. SHAs: OpenIM a101d85ec16cc21bec60005169725adc1ae5649a; Synapse 0c287237cbb96814282f1bc207e5e6c4407fb8a0; Tinode fd8801cdea3f2984008b0cdf38a253060515ce04; ejabberd afe6393701939f0baf45a1580a30a41bb91700bf. | Durable message before fan-out, cursor recovery and separate read/delivery states are useful patterns. Crash, dedupe and ordering behavior remain unverified. |
| CRM-001..004 | Chatwoot app/models/contact.rb, conversation.rb, note.rb; Twenty workspace repositories and permission services. SHAs 576e4f88cd3e5e312ce8fff73b04643e44726ffd and 8218d05450b1329e439136d8d3ef99ea0547dfc4. | Canonical personal identity plus Business CRM projection; account-scoped authorization and explainable segments. |
| CAM-001..008 | Listmonk queries/campaigns.sql and models/subscribers.go; Mautic Campaign/Segment/Lead bundles. SHAs 47a24dfe8a889b0c7fe8730b0bb7ac24ab571e87 and 838c9c772ec7813d31bd135d22668481e644dcc7. | Preview, schedule and dispatch-time consent checks; suppression, dedupe, rate limits and unknown-outcome reconciliation. Email behavior is not Jetson semantics; external channels remain out of v1. |
| CORE-001/002/006; UX-001/002 | The reviewed repositories do not validate Jetson registration, profile fields, free-use boundary or approved visual direction. | These remain Jetson product acceptance work; preserve a free path without Business setup and keep exact identity/profile decisions open. |
| BIZ-001..005; PROFILE-001 | The CRM/campaign references provide partial patterns, not proof of Jetson account-level subscription, trial, billing disclosures, demo isolation, real-test safeguards or premium profile. | Implement only against approved user journeys; demo-to-live isolation and explicit billing consent are release gates. |
| KPI-001..006; AI-001..003 | Reference event/counter patterns are not Jetson metric definitions or an AI privacy/cost boundary. | Keep analytics/AI rollout in Stage 3; define event semantics, attribution, data permissions and spend controls before claims. AI remains included in base Business. |
| SCALE-001..004; FUT-001/002; NG-001 | No inspected source establishes Jetson capacity or numerical SLOs; API and external channels are deferred. | Preserve independent scaling capability, measure before claims, and do not introduce email/SMS/other-messenger campaigns in v1. |
| Security/operations | SimpleX, Zulip, Mattermost, Rocket.Chat, Signal Server, Fluxer, OpenIM and Tinode license/security/deploy/test paths were inspected in the security report. | Root licenses do not clear nested editions, assets or dependencies. Restore, advisory and reproducibility gates remain unknown. |

Important evidence conflict: the security report cites Fluxer 1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d, while the manifest pins 7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0. Fluxer SHA-specific evidence is excluded until corrected.

Pinned source links: [OpenIM transfer](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/internal/msgtransfer/online_history_msg_handler.go), [OpenIM sync](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/internal/rpc/msg/sync_msg.go), [Synapse persistence](https://github.com/element-hq/synapse/blob/0c287237cbb96814282f1bc207e5e6c4407fb8a0/synapse/handlers/message.py), [Tinode topic](https://github.com/tinode/chat/blob/fd8801cdea3f2984008b0cdf38a253060515ce04/server/topic.go), [ejabberd offline](https://github.com/processone/ejabberd/blob/afe6393701939f0baf45a1580a30a41bb91700bf/src/mod_offline.erl), [Chatwoot contact](https://github.com/chatwoot/chatwoot/blob/576e4f88cd3e5e312ce8fff73b04643e44726ffd/app/models/contact.rb), [Twenty permissions](https://github.com/twentyhq/twenty/tree/8218d05450b1329e439136d8d3ef99ea0547dfc4/packages/twenty-server/src/engine/permissions), [Listmonk campaign selection](https://github.com/knadh/listmonk/blob/47a24dfe8a889b0c7fe8730b0bb7ac24ab571e87/queries/campaigns.sql), and [Mautic Campaign bundle](https://github.com/mautic/mautic/tree/838c9c772ec7813d31bd135d22668481e644dcc7).

## Logical domains

Identity (account, devices, sessions, recovery); messaging (conversations, membership, messages, attachments, sequences, receipts); synchronization (cursors and gap repair); Business CRM (customer projection, notes, statuses, segments); subscription (entitlement, trial, billing and cancellation); campaigns (snapshot, consent, suppression, scheduling, queue, retry, rate and reconciliation); analytics (append-only events and projections); AI (user-requested assistive boundary, no autonomous send); trust/operations (abuse, audit, export, deletion, backup and administration). Each domain owns its writes; cross-domain views use explicit events or queries.

## Alternatives

| Option | Boundaries | Strengths | Risks and exit path |
|---|---|---|---|
| A modular monolith | One deployable, strict internal modules, durable campaign workers | Lowest early cost; simpler authorization and transactions | Shared resource contention; isolate workers and quotas, then extract messaging/campaign paths behind contracts |
| B messaging core plus Business services | Messaging/sync isolated from CRM, subscription, campaigns and analytics | Protects chat SLOs; independent campaign scaling | More network/auth/tracing/deployment work; collapse if measurements do not justify split |
| C broad decomposition | Separate service for each domain | Maximum independent scaling | Highest consistency, security and operations burden; expensive recombination; unsuitable before evidence |

## Lifecycles and failure handling

Message lifecycle must not acknowledge success before durable persistence. Model at least: client request received/validated -> durable message record and conversation sequence committed -> sender receives accepted/persisted acknowledgement -> fan-out/outbox work queued -> delivery attempt -> recipient-device delivery acknowledgement (if observable) -> read event (if observable). Keep rejected, failed and unknown-outcome states separate. A timeout after commit but before the sender sees the acknowledgement is unknown to the client, not proof of failure; reconcile by stable client operation key before retry. A crash after persistence but before fan-out must leave recoverable pending work (for example, a transactional outbox or an equivalently proven mechanism). 'Delivered' must mean the defined recipient-device/service event, not merely queue acceptance or server dispatch. Ordering is scoped by conversation and relevant device/sync cursor, not global. Specify whether group fan-out is per-recipient and how partial delivery is represented.

Campaign flow: draft -> preview eligibility -> immutable audience snapshot and recipient idempotency keys -> schedule -> dispatch-time consent/suppression recheck -> internal Jetson message -> accepted/failed/unknown -> retry or reconcile -> report. Synthetic demo recipients cannot enter the real queue. Real tests require explicit relevant consent and visible audience/content/volume. Service and marketing messages remain distinct. Email/SMS/other messenger delivery is excluded from first release.

Failure matrix: duplicate request returns the prior result; storage success with fan-out failure preserves the message and retries independently; worker crash requires redelivery plus idempotency; unknown outcomes require reconciliation; reconnect uses cursors and bounded replay. These are design requirements, not executed evidence.

## Security, licensing and operations

Trust boundaries are client/edge, account authorization, Business data, campaign worker, messaging delivery, AI provider, operators and backup/export. Require least privilege, account isolation, encryption in transit/at rest, secret isolation, privacy-safe telemetry, audit, export/deletion, backup and incident response. E2EE scope and key lifecycle are open product/security decisions.

Manifest SHAs: SimpleX 2aed5f082c95a3c9eaeb14308aa03b852e484809; Zulip a7af4399c1943eb4778789de95f09f6d14911e94; Mattermost 4a38cfa4164d01db704464b62f0ee516f5f3a933; Rocket.Chat 77df90cdbcc2e37be2febe5ff668273564b0d543; Signal Server 398888f224289f2e52baa78e2df285ae179eaad0; Fluxer 7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0; OpenIM a101d85ec16cc21bec60005169725adc1ae5649a; Tinode fd8801cdea3f2984008b0cdf38a253060515ce04. No repository is cleared for reuse. Review every nested license, dependency, asset and generated artifact.

## Cost, scorecard and recommendation

Monthly cost model: fixed operations + active users/connections + message writes, retention and egress + attachment bytes/requests/egress + campaign recipients, peak rate and retries + analytics ingest/retention/query + AI requests and token distribution + payment fees + backups/observability/support. No provider prices or workload volumes are assumed. Use three parameterized scenarios: (1) pilot — small active-user and Business-tenant cohorts, low concurrency, short retention, limited attachments and manually reviewed campaigns; (2) growth — rising daily active users, concurrent devices, group fan-out, CRM contacts, scheduled campaigns and analytics retention; (3) burst/high-volume — peak concurrency, large consenting audiences, campaign bursts, retry amplification, attachment egress and AI demand tested together. For each scenario record measured inputs, source/date, formulas, unit-price source/date, monthly subtotal and uncertainty; do not invent numeric capacity or cost. Benchmark p50/p95/p99 latency, queue lag, errors, duplicates, recovery, restore and consent races before capacity claims.

### Scorecard disposition

The previous numeric totals (A 365/500, B 330/500, C 265/500) are withdrawn. They had no dimension-level scores, evidence notes, coverage or confidence, and their denominator did not match the approved 100-point rubric. Rescaling those totals would preserve unsupported numbers.

The rubric is an evidence score for a concrete product/component candidate. A, B and C are unimplemented topology hypotheses, not evaluated repositories. No implementation, fault-injection, security review, reproducible build, load test, restore rehearsal or cost measurement exists for any option. Therefore weighted totals are **Not scoreable yet**; empirical dimensions remain **Unknown**, not zero or a neutral score. This follows the rubric's explicit rule that Unknown must not be converted into a numeric score.

Qualitative architecture comparison (not a weighted score):

| Dimension | A — modular monolith | B — isolated messaging + Business services | C — broad decomposition |
|---|---|---|---|
| Early product fit / delivery burden | Best initial fit; fewer deployables | Moderate; more integration and operations | Weakest before team and operating model exist |
| Failure/resource isolation | Requires worker/process/resource isolation | Stronger boundary between chat and Business workloads | Potentially strongest, but adds distributed failure modes |
| Data consistency / authorization complexity | Lowest initial cross-service complexity | Moderate; explicit contracts and ownership required | Highest; many network and consistency boundaries |
| Independent scaling potential | Achievable by isolating workers first; later extraction | Strong for messaging and Business workloads | Highest theoretical flexibility, highest operational cost |
| Evidence confidence | Low; hypothesis only | Low; hypothesis only | Low; hypothesis only |

Recommendation remains provisional: validate A's modular boundaries and durable worker isolation first. Move toward B only if measured chat-SLO interference, scaling needs or independent release requirements justify it. Do not choose C without demonstrated team and operational capacity. No non-compensable reuse gate is passed by this topology comparison; repository/component reuse gates remain Unknown.

Recommend A conditionally on message/campaign harnesses, worker isolation, idempotency/reconciliation, authorization, restore rehearsal and extraction triggers. Switch toward B if campaign load harms chat SLOs or independent scaling is measured necessary. Do not use C without team and operational evidence.

## Decision register and next experiments

Proposed: modular monolith; one owning domain per write; recipient snapshots with dispatch-time consent checks. Open: extraction threshold, idempotency semantics, E2EE, launch legal basis/retention, payments, AI boundary, RPO/RTO/SLO and capacity. Blocked for reuse: no upstream platform candidate.

Top experiments: duplicate retry; crash before/after durable write, outbox enqueue and sender acknowledgement; ordering/reconnect; consent revocation race; unknown-outcome reconciliation; rate fairness and chat isolation; backup/restore/export/deletion; cross-account authorization fuzzing; KPI event truth; AI data-minimization and spend limits. After each experiment, decide whether to preserve A, isolate workers further, or justify extraction to B from measured evidence.

Tests actually run: none upstream; no load, fault injection, security audit or Android E2E. Markdown checks and git diff --check are run. Changed files are this synthesis and JETSON_ARCHITECTURE_DECISION_LOG.md. Complete for the bounded task with explicit evidence gaps.


## Independent review correction note

This revision withdraws unsupported architecture totals, restores the business-plan stage sequence, expands requirement coverage to requirements not directly evidenced by the repository studies, and changes the message lifecycle so sender acceptance follows durable persistence. These are research-document corrections only. They do not approve a topology, implementation stack, E2EE scope, SLO, price, launch jurisdiction or product-scope change.


### Stage-boundary discrepancy to track

The derivative `PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md` currently lists AI-001/AI-002 under Stage 2, while the canonical business-plan baseline places the AI assistant rollout in Stage 3 and states that AI is included in the Business subscription. For this synthesis, the canonical business plan controls: entitlement remains part of Business; rollout is Stage 3. The derivative requirements document was not changed in this research-only correction and should be reconciled in a separate owner-visible documentation change before implementation planning.


## Independent verification update — 2026-11-27

A second-pass repository check found one provenance limitation that must remain visible:

- The security/operations report states that local shallow source snapshots were checked against `upstream-sources/MANIFEST.txt`.
- Fetching that exact path from the staged architecture task branch returned GitHub 404. The manifest could not be independently retrieved from this branch in this review.
- This does **not** prove the original local manifest or snapshots never existed. It means this synthesis cannot independently reproduce that verification from the repository branch currently available.
- Consequently, treat the pinned SHAs and source-path citations in the reports as report-attributed evidence until the manifest/snapshot inventory is restored and checked. Do not claim a fresh independent SHA-to-snapshot validation.
- The security report's Fluxer references use `1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d`, while the synthesis and decision log list `7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0`. The synthesis already excludes Fluxer SHA-specific claims pending reconciliation; this review preserves that exclusion.

No upstream code was executed during this second-pass review. No upstream build, test suite, load test, fault injection, security audit, legal review or restore drill is claimed. The architecture recommendation remains provisional and the technology stack remains open.

**Next evidence action:** restore the exact manifest and pinned source snapshots (or provide a repository-accessible immutable archive with checksums), verify every SHA, then reconcile the Fluxer revision discrepancy before any source reuse decision.


### 3.4 Independent pinned-source check (2026-11-27)

A bounded independent check retrieved five exact raw source files at the revisions cited in the reports: Tinode `server/topic.go`, Synapse `synapse/handlers/message.py`, OpenIM `internal/msgtransfer/online_history_msg_handler.go`, ejabberd `src/mod_offline.erl`, and Listmonk `queries/campaigns.sql`. The observations and limits are documented in [INDEPENDENT_SOURCE_CHECK_2026-11-27.md](INDEPENDENT_SOURCE_CHECK_2026-11-27.md). This confirms those five pinned paths are retrievable and supports only the specific source-level behavior described there.

The full `upstream-sources/MANIFEST.txt` and shallow source snapshot directory remain absent from both the task branch and its research base branch. This limited check does not restore full provenance, verify all report citations, run upstream tests, establish current maintainer/security posture, or provide license/legal clearance. ADR-011 remains Blocked for code reuse.


### 8.5 Upstream failure-path findings that constrain the design

The extended delivery deep dive identifies important failure hypotheses that were not visible from a high-level architecture diagram. They are documented in [MESSAGE_DELIVERY_FAILURE_RISK_REGISTER.md](MESSAGE_DELIVERY_FAILURE_RISK_REGISTER.md), with exact blob links and required fault tests.

- OpenIM's inspected batcher callback marks/commits the last raw MQ message; the handler's enqueue and processing paths do not consistently propagate failures; sequence allocation precedes Redis cache insertion; Mongo-MQ publication is a separate step. This is a high-priority potential message-loss/inconsistency path, **not a confirmed defect**. The exact outcome depends on batcher, producer and consumer-offset semantics that remain unverified.
- Tinode's mapper updates topic sequence and then calls message save through separate adapter calls. This is a potential sequence-gap window; whether an adapter transaction closes it remains unknown.
- These findings strengthen the Jetson requirement that message identity, conversation position, idempotency and recoverable outbox intent commit atomically before acceptance. Downstream queue/push work must be independently durable and retryable; callback completion alone is not proof of durable effects.
