# Jetson Messenger Architecture Synthesis

Review date: 2026-11-23. Status: [ПРЕДЛОЖЕНИЕ]; research only.

## Executive summary

Jetson remains a free personal messenger with optional Business on the same account. Approved order is messenger core, Business CRM/subscription/trial/internal consent-aware campaigns, analytics and included AI, then measured scale and deferred API work. The reports support explicit durable state transitions, account isolation, dispatch-time consent checks, idempotency and reconciliation. They do not prove exactly-once delivery, capacity, E2EE scope, legal compliance or any final technology.

Three implementation-neutral options were compared. Option A is a modular monolith with strict domain boundaries and durable campaign workers. Option B independently deploys messaging/sync and supporting Business services. Option C broadly decomposes identity, messaging, CRM, billing, campaigns, analytics and AI. Provisional recommendation: Option A, with extraction contracts and worker isolation. This is reversible and does not choose a language, framework, database, transport, cloud, cryptographic library, AI provider or topology.

## Evidence reconciliation and traceability

All mandatory inputs were present, including the three reports and upstream-sources/MANIFEST.txt. The reports are static source/test inventories. No upstream test, build, load, fault-injection or security audit ran.

| Requirements | Verified evidence and pinned revisions | Consequence and gap |
|---|---|---|
| CORE-003..005 | Tinode server/topic.go saves before acceptance/broadcast; Synapse synapse/handlers/message.py and synapse/storage/databases/main/events.py provide persistence paths; OpenIM internal/rpc/msg/sync_msg.go provides sequence pull; ejabberd src/mod_offline.erl and src/mod_stream_mgmt.erl provide offline/resume paths. SHAs: OpenIM a101d85ec16cc21bec60005169725adc1ae5649a; Synapse 0c287237cbb96814282f1bc207e5e6c4407fb8a0; Tinode fd8801cdea3f2984008b0cdf38a253060515ce04; ejabberd afe6393701939f0baf45a1580a30a41bb91700bf. | Durable message before fan-out, cursor recovery and separate read/delivery states are useful patterns. Crash, dedupe and ordering behavior remain unverified. |
| CRM-001..004 | Chatwoot app/models/contact.rb, conversation.rb, note.rb; Twenty workspace repositories and permission services. SHAs 576e4f88cd3e5e312ce8fff73b04643e44726ffd and 8218d05450b1329e439136d8d3ef99ea0547dfc4. | Canonical personal identity plus Business CRM projection; account-scoped authorization and explainable segments. |
| CAM-001..008 | Listmonk queries/campaigns.sql and models/subscribers.go; Mautic Campaign/Segment/Lead bundles. SHAs 47a24dfe8a889b0c7fe8730b0bb7ac24ab571e87 and 838c9c772ec7813d31bd135d22668481e644dcc7. | Preview, schedule and dispatch-time consent checks; suppression, dedupe, rate limits and unknown-outcome reconciliation. Email behavior is not Jetson semantics; external channels remain out of v1. |
| Security/operations | SimpleX, Zulip, Mattermost, Rocket.Chat, Signal Server, Fluxer, OpenIM and Tinode license/security/deploy/test paths were inspected in the security report. | Root licenses do not clear nested editions, assets or dependencies. Restore, advisory and reproducibility gates remain unknown. |
| KPI/AI | Reports found event/counter patterns, but no Jetson-native definitions or AI boundary. | Define formulas, limitations, data permissions and cost controls before launch claims. |

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

Message states: accepted -> durably stored -> queued -> dispatch attempt -> delivered event -> read event. Timeout or crash after a side effect is Unknown, requiring reconciliation before retry; terminal rejection stops retry. Accepted is not delivered. Ordering is scoped per conversation/device, not global. Required controls are stable client operation keys, durable queue progress, idempotent handlers, cursor-based reconnect and explicit receipt semantics.

Campaign flow: draft -> preview eligibility -> immutable audience snapshot and recipient idempotency keys -> schedule -> dispatch-time consent/suppression recheck -> internal Jetson message -> accepted/failed/unknown -> retry or reconcile -> report. Synthetic demo recipients cannot enter the real queue. Real tests require explicit relevant consent and visible audience/content/volume. Service and marketing messages remain distinct. Email/SMS/other messenger delivery is excluded from first release.

Failure matrix: duplicate request returns the prior result; storage success with fan-out failure preserves the message and retries independently; worker crash requires redelivery plus idempotency; unknown outcomes require reconciliation; reconnect uses cursors and bounded replay. These are design requirements, not executed evidence.

## Security, licensing and operations

Trust boundaries are client/edge, account authorization, Business data, campaign worker, messaging delivery, AI provider, operators and backup/export. Require least privilege, account isolation, encryption in transit/at rest, secret isolation, privacy-safe telemetry, audit, export/deletion, backup and incident response. E2EE scope and key lifecycle are open product/security decisions.

Manifest SHAs: SimpleX 2aed5f082c95a3c9eaeb14308aa03b852e484809; Zulip a7af4399c1943eb4778789de95f09f6d14911e94; Mattermost 4a38cfa4164d01db704464b62f0ee516f5f3a933; Rocket.Chat 77df90cdbcc2e37be2febe5ff668273564b0d543; Signal Server 398888f224289f2e52baa78e2df285ae179eaad0; Fluxer 7bdee9e9cfc7f8321d1578f9e4e76691c073e4b0; OpenIM a101d85ec16cc21bec60005169725adc1ae5649a; Tinode fd8801cdea3f2984008b0cdf38a253060515ce04. No repository is cleared for reuse. Review every nested license, dependency, asset and generated artifact.

## Cost, scorecard and recommendation

Monthly cost model: fixed operations + active users times connections/message storage/egress + attachment bytes and egress + campaign recipients and retries + analytics events/retention + AI requests/tokens + payment fees + backup/observability/support. Benchmark p50/p95/p99 latency, queue lag, errors, duplicates, recovery, restore and consent races under low/base/high workloads before capacity claims.

Provisional 100-point planning scores (not measurements): A 365/500, B 330/500, C 265/500. Messaging correctness, security, product fit, campaign integrity, operations, tests, maintenance and documentation were considered; test evidence is Unknown and was not converted to a pass. All reuse gates are Unknown: license clearance, critical security response, reproducibility, product invariants and portability.

Recommend A conditionally on message/campaign harnesses, worker isolation, idempotency/reconciliation, authorization, restore rehearsal and extraction triggers. Switch toward B if campaign load harms chat SLOs or independent scaling is measured necessary. Do not use C without team and operational evidence.

## Decision register and next experiments

Proposed: modular monolith; one owning domain per write; recipient snapshots with dispatch-time consent checks. Open: extraction threshold, idempotency semantics, E2EE, launch legal basis/retention, payments, AI boundary, RPO/RTO/SLO and capacity. Blocked for reuse: no upstream platform candidate.

Top experiments: duplicate retry; crash before/after write and acknowledgement; ordering/reconnect; consent revocation race; unknown-outcome reconciliation; rate fairness and chat isolation; backup/restore/export/deletion; cross-account authorization fuzzing; KPI event truth; AI data-minimization and spend limits.

Tests actually run: none upstream; no load, fault injection, security audit or Android E2E. Markdown checks and git diff --check are run. Changed files are this synthesis and JETSON_ARCHITECTURE_DECISION_LOG.md. Complete for the bounded task with explicit evidence gaps.
