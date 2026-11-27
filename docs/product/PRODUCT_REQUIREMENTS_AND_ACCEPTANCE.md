# Jetson Messenger — product requirements and acceptance framework

**Status:** Working requirements derived from the owner's complete business plan supplied 2026-11-23. Product scope is approved by that plan; details explicitly left open remain open.  
**Authority:** `docs/product/BUSINESS_PLAN_BASELINE.md` and the preserved source PDF.  
**Scope:** Product behavior, stage boundaries and acceptance criteria. This document does not select implementation technologies.

## 1. Product definition

Jetson Messenger is a free personal messenger with an optional paid Jetson Business subscription attached to the same personal account. Business capabilities turn conversations into a customer-workflow system: CRM, internal campaigns, KPI analytics, premium business profile and an included AI assistant.

**Positioning:** «Свобода наконец-то и в бизнесе».

## 2. Requirement labels

- **MUST** — explicitly required by the business plan for the stated stage or capability.
- **SHOULD** — explicitly recommended in the plan, but details may be refined.
- **OPEN** — the business plan leaves the decision unresolved; no implementation assumption is approved.
- **FUTURE** — explicitly deferred to a later stage.
- **NON-GOAL** — explicitly outside the first release.

No requirement may silently move between these labels. Changes to product promises, pricing, stage order or scope require owner approval.

## 3. Product requirements by stage

### Stage 1 — free messenger core

| ID | Requirement | Acceptance condition | Trace |
|---|---|---|---|
| CORE-001 | Registration | A new person can create an account and enter the product; errors and retry states are understandable. | Plan §4.1, p.2 |
| CORE-002 | Personal profile | A user can view and manage the personal profile fields that are defined for launch. Exact fields are OPEN. | §4.1, p.2 |
| CORE-003 | Direct messages | Two users can start and continue a private conversation. Message persistence and recovery behavior must be tested. | §4.1, p.2 |
| CORE-004 | Basic chats | Users can create and participate in basic chats. Detailed group roles, sizes and moderation are OPEN. | §4.1, p.2 |
| CORE-005 | Chat/channel creation | The interface exposes clear actions to create a chat and a channel. Channel capabilities and publishing/participation rules are OPEN. | §4.1, §8, p.2,4 |
| CORE-006 | Business does not obstruct personal use | A person can use the free communication experience without configuring or buying Business. | §4.1, p.2 |
| UX-001 | Clear entry actions | The initial experience presents the intended actions: start communication, switch to Business, create channel, create chat. | §8, p.4 |
| UX-002 | Visual direction | Premium predominantly black visual direction, readable typography, sufficient contrast and clear status/action hierarchy. | §8, p.4 |

Stage 1 is not complete merely because screens exist. Registration, sending, receiving, persistence, failure states and recovery need demonstrable end-to-end tests.

### Stage 2 — Jetson Business

| ID | Requirement | Acceptance condition | Trace |
|---|---|---|---|
| BIZ-001 | Personal-account subscription | An existing personal account can activate Business without creating a separate corporate account. | §1, §4.2, p.1–3 |
| BIZ-002 | Subscription lifecycle | Price, billing period, first charge date and cancellation route are disclosed before opt-in. Auto-renewal charge is enabled only after explicit advance consent and payment method. | §6, p.3–4 |
| BIZ-003 | Trial | Trial can last up to 7 days; user can understand when it ends and how to cancel; a reminder is sent before expiry. | §6–7, p.3–4 |
| BIZ-004 | Demo data | A safe virtual customer base allows trying CRM, segmentation, campaign creation and KPI without messaging real people. | §7, p.4 |
| BIZ-005 | Limited real test | A real test campaign can target only recipients with explicit relevant consent; audience, content and expected volume are shown before send. | §7, p.4 |
| CRM-001 | Customer cards | Business user can maintain customer records. Exact fields are OPEN. | §4.2, p.2–3 |
| CRM-002 | Conversation history | Customer record can show the relevant interaction history available within Jetson. Exact linking rules are OPEN. | §4.2, p.2–3 |
| CRM-003 | Notes and statuses | Business user can add notes and assign customer statuses. Status vocabulary and permissions are OPEN. | §4.2, p.2–3 |
| CRM-004 | Basic segmentation | Business user can define/select customer segments for legitimate business workflows. Exact query builder and fields are OPEN. | §4.2, §5, p.2–3 |
| CAM-001 | Campaign creation | Business user can create a campaign for a selected eligible audience inside Jetson. | §4.2, p.2–3 |
| CAM-002 | Templates and scheduling | Campaigns support reusable templates and scheduling. | §4.2, p.2–3 |
| CAM-003 | Campaign report | Campaign results can be inspected after sending. Metrics must be based on recorded events, not fabricated UI values. | §4.2, p.2–3 |
| CAM-004 | Consent enforcement | Before dispatch, recipient eligibility is checked against consent, preferences and unsubscribe state. | §5, p.3 |
| CAM-005 | Unsubscribe/preferences | Recipients can unsubscribe and manage message-type preferences; unsubscribed recipients are suppressed from later applicable campaigns. | §5, p.3 |
| CAM-006 | Message classification | Service notifications and promotional campaigns are distinguishable and governed separately. | §5, p.3 |
| CAM-007 | Duplicate suppression | Retry/replay must not unintentionally send duplicate campaign messages. | §5, p.3 |
| CAM-008 | Abuse controls | Anomalies, complaints and abuse attempts are monitored; legitimate senders have transparent rules. | §5, p.3 |
| PROFILE-001 | Premium business profile | Business subscriber can use enhanced profile presentation, colors/themes and company card. Exact customization options are OPEN. | §4.2, §8, p.2–4 |

### Stage 3 — analytics and AI

| ID | Requirement | Acceptance condition | Trace |
|---|---|---|---|
| KPI-001 | Delivery metric | Reports distinguish queued/attempted/sent/delivered states according to verified delivery semantics. Exact definitions are OPEN. | §4.2, p.2–3 |
| KPI-002 | Read metric | Read events are counted only where the product can reliably observe them; semantics and privacy rules are OPEN. | §4.2, p.2–3 |
| KPI-003 | Reply metric | Replies are attributable to the relevant campaign under a documented rule. | §4.2, p.2–3 |
| KPI-004 | Link transitions | Link clicks are measured where applicable and permitted. | §4.2, p.2–3 |
| KPI-005 | Conversion | Conversion definition and attribution window are documented before a conversion metric is advertised. | §4.2, p.2–3 |
| KPI-006 | Trends and reports | Business user can compare campaign performance over time. | §4.2, p.2–3 |
| AI-001 | Included AI assistant | AI assistant is accessible within Business for writing, customer replies, campaign ideas, result analysis and routine business tasks. | §4.2, p.2–3 |
| AI-002 | AI cost controls | Usage limits are determined from measured costs and real usage; the AI feature remains included in base Business, not a mandatory separate tariff. | §1, §4.2, p.1–3 |
| AI-003 | AI analysis | AI assistant can help interpret campaign results within its disclosed capabilities and data permissions. | §4.2, p.2–3 |

### Stage 4 — scale and post-launch expansion

| ID | Requirement | Acceptance condition | Trace |
|---|---|---|---|
| SCALE-001 | Independent scaling capability | Architecture and operations can scale message storage, campaign queues, audience segmentation, delivery, analytics and AI workload independently where evidence justifies it. | §11, p.5 |
| SCALE-002 | Large audiences | Capacity grows through measured load testing; hundreds of thousands/millions are long-term goals, not launch guarantees. | §5, §11, p.3,5 |
| SCALE-003 | Campaign rate control | Sender can configure campaign rate and see a defensible estimated completion time. | §5, p.3 |
| SCALE-004 | Load testing | Capacity claims are published only after reproducible tests with workload, success criteria and reliability level stated. | §5, §11, p.3,5 |
| FUT-001 | Public API/developer documentation | Deferred until after launch. | §10, p.5 |
| FUT-002 | Extended segmentation | Later expansion beyond the basic first business workflows. | §10, p.5 |
| NG-001 | External campaigns | Email, SMS and campaigns through other messengers are not in the first release. | §4.2, §10, p.2,5 |

## 4. Cross-cutting quality requirements

These are product/engineering outcomes, not a predetermined stack.

### Reliability and correctness
- A sent message or campaign item must not silently disappear after an acknowledged success.
- Duplicate processing, retries and process restarts must not create unintended duplicate user-visible messages.
- Message ordering expectations must be specified by conversation/workflow; do not assume global ordering.
- Persisted messages and campaign state must survive the documented failure/restart scenarios.
- Distinguish accepted, queued, attempted, provider/server accepted, delivered, read and replied states. Do not conflate them.
- Campaigns need durable state, progress visibility, retry policy, terminal failure handling and reconciliation.

### Consent, privacy and security
- Consent and unsubscribe checks must be enforceable at dispatch time, not merely at campaign creation.
- Access to personal and business data must follow explicit authorization rules.
- Sensitive data must not leak through logs, metrics, support tooling or AI prompts.
- Backups, deletion/retention, employee access, audit events and account recovery need explicit policies.
- Exact legal requirements depend on launch countries and remain OPEN.
- End-to-end encryption scope is not defined by the business plan; it must not be silently assumed or claimed.

### Operations and economics
- Measure storage, delivery, queue, analytics and AI cost per active and paying user and per campaign.
- Monitor queue lag, delivery latency, error rates, retries, duplicate suppression, complaint/unsubscribe rates and AI spend.
- Backups and restore must be tested, not merely configured.
- Throughput/latency/availability targets remain OPEN until workload assumptions and business needs are validated.

## 5. Product analytics and launch metrics

Track at minimum:
- Acquisition: installs, registrations, acquisition cost.
- Activation: first message sent; Business CRM setup completed.
- Monetization: trial starts, trial-to-paid conversion, recurring payment success, cancellation.
- Retention: day-7 and day-30 activity, subscription renewal and churn.
- Campaigns: delivered, read, replies, clicks, conversions, complaints, unsubscribes, failures and delivery cost.
- Quality: stability, latency, support requests and security incidents.

Metric formulas, event definitions, attribution windows and privacy/consent treatment must be documented before dashboards are treated as authoritative.

## 6. Open decisions register

Do not silently fill these gaps:
1. Launch countries, legal review and data residency.
2. Supported client platforms and exact first-release platform scope.
3. Account identity, verification, recovery and device/session lifecycle.
4. Personal profile fields and business profile data.
5. Chat/channel types, group sizes, roles, moderation and admin capabilities.
6. Message types, attachments, edits/deletes, reactions, delivery/read semantics and offline sync.
7. E2EE scope, key lifecycle and multi-device behavior.
8. CRM schema, statuses, notes, segment filters and ownership/permissions.
9. Consent capture, evidence retention, preference granularity and legal basis by market.
10. Service-vs-marketing classification and templates.
11. Subscription provider, app-store/web payment routes, failed payment, grace period, refunds and cancellation.
12. AI provider, data sent to models, retention, usage limits and fallback behavior.
13. Exact KPI formulas and attribution.
14. Throughput, latency, availability, RPO/RTO and load profiles.
15. Team, budget, timeline, support and go-to-market plan.

## 7. Release gates

### Gate A — Messenger core
- Registration and profile journeys work end to end.
- Direct messaging and basic chat journeys work across two or more test accounts.
- Persistence, retry, duplicate, ordering, offline/reconnect and restart behavior are tested to the agreed scope.
- Security/privacy review and backup/restore evidence exist.
- No unresolved critical/high severity defect in the agreed release scope.

### Gate B — Jetson Business
- Subscription and trial disclosures/consent/cancellation are tested.
- Demo environment cannot contact real recipients.
- Real campaigns cannot bypass consent or unsubscribe suppression.
- Campaign progress, failure and duplicate behavior are observable and tested.
- CRM and business profile journeys pass acceptance tests.

### Gate C — Analytics and AI
- Each advertised metric has a defined event, formula and limitation.
- AI data access and spend controls are tested.
- AI remains part of the base Business subscription.

### Gate D — Scale
- Load tests document workload, environment, results, bottlenecks and failure behavior.
- No marketing throughput claim exceeds verified evidence.
- Operational alerts, incident response, restore and cost controls are in place.

## 8. Change control

Any change to product scope, pricing, trial, free/paid split, campaign consent principles, launch sequence, external channels or developer API timing requires explicit owner approval. Technical proposals may be researched independently but cannot redefine these requirements.


## Change log

- **2026-11-27:** Moved AI-001 and AI-002 from Stage 2 to Stage 3 to align the requirements framework with the canonical business-plan rollout in §11 (Stage 3 — analytics and AI) and the Stage 3 AI user journey. The AI feature remains included in the base Jetson Business subscription; this corrects rollout sequencing only and does not remove or add product scope.
