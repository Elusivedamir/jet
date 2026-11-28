# Campaign dispatch — architecture and implementation status

**Status: internal Node.js/TypeScript PoC implemented; not production-ready.**
**Public API boundary: campaign drafts and audience preview only.** There is no public enqueue/send/schedule endpoint and no external delivery channel.

## Product and safety invariants

- A campaign belongs to exactly one business account. Every job is tenant-bound by a composite foreign key.
- One durable job represents one campaign/recipient pair.
- The master business-offer preference defaults off. Per-business consent and an accepted contact are also required.
- CRM customers marked archived are ineligible.
- A point-in-time audience preview is never send authorization.
- All campaign messages use the existing internal `business_offer` message path and the recipient-specific transactional outbox/inbox.
- No email, SMS, third-party transport or public outbound API is used.

## Implemented data model

- `business_campaigns` supports draft, queued, sending, completed and cancelled states.
- `business_entitlements` is fail-closed: `campaigns_enabled` defaults to false. There is no public billing, entitlement activation or admin endpoint.
- `business_campaign_jobs` stores campaign, business owner, recipient, conversation, status, deterministic operation key, attempt count, availability, lease/fencing token, linked message, skip reason and last error.
- Unique constraints prevent duplicate jobs for a campaign/recipient and duplicate operation keys. A composite foreign key prevents attaching a job to a campaign under another business owner.

## Enqueue transaction

The internal `CampaignStore.enqueueDraft` primitive:
1. Locks the campaign and validates ownership/state and the idempotency key.
2. Requires an enabled internal entitlement; missing entitlement fails closed.
3. Recomputes the audience from current CRM/contact/conversation data; preview results are not reused as authorization.
4. Excludes archived CRM customers, missing direct conversations, unaccepted contacts, master-preference opt-outs and missing per-business consent.
5. Locks eligibility in the established order: recipient preference -> per-business consent -> accepted contact -> CRM customer.
6. Inserts one durable job per eligible recipient and commits the campaign transition atomically.

Replaying the same enqueue key for an already queued/sending/completed campaign returns the existing result rather than creating duplicate jobs.

## Worker, idempotency and reconciliation

- The internal worker claims work with `FOR UPDATE SKIP LOCKED`, a 60-second lease and a per-job fencing token.
- Claims atomically reserve a token from a PostgreSQL-backed per-business token bucket shared across worker instances. Defaults are a burst capacity of 10 and refill of one dispatch per second; a depleted budget leaves jobs queued until tokens refill. Only one job is claimed per call, so a larger batch parameter cannot bypass the budget.
- It processes one job per iteration. Stale lease tokens cannot attach a message or mutate a reclaimed job.
- The worker calls the existing internal `Store.send` business-offer path using a stable campaign/recipient operation key. If the worker crashes after message commit but before attaching the message ID, retry returns the original message rather than creating a duplicate.
- Transient failures use bounded exponential retry, with a maximum of eight attempts. Eligibility failures are terminal skips. Infrastructure loop failures back off up to 15 seconds.
- Jobs in delivery-pending state reconcile against recipient-specific outbox state: completed -> sent, cancelled -> skipped, terminal failure -> failed.
- A campaign is completed only after all of its jobs are terminal.

## Revocation and archived-customer race protection

Eligibility is rechecked at multiple boundaries:
1. Enqueue time, while inserting durable jobs.
2. Message creation, inside the message/outbox transaction.
3. Final recipient delivery, immediately before inserting the recipient inbox row.

For campaign jobs, CRM archive state is locked and checked at message creation and again at final inbox delivery. If a customer is archived before either boundary, the job is skipped or the outbox item is cancelled and no recipient inbox row is created. The archive gate is scoped to campaign messages; ordinary one-to-one Business messages are not affected.

The same preference -> consent -> contact -> CRM lock order is used at the relevant campaign boundaries. A transaction that obtains the eligibility locks first establishes the ordering against a concurrent revocation. A delivered inbox item cannot be retroactively recalled.

## API boundary

Available over HTTP:
- Create/list campaign drafts; edit title/body only while status is `draft` (owner-scoped, atomic state guard).
- Preview a draft's audience and exclusion reasons.
- Read a tenant-scoped campaign status summary with durable per-job counts. This is read-only and cannot enqueue or retry jobs.
- Cancel an owned campaign with an idempotent DELETE operation. Queued jobs are cancelled immediately; leased jobs are checked before `Store.send`, and the send transaction takes a shared campaign-row lock before creating a new message. Cancellation takes the conflicting update lock. Whichever transaction obtains the lock first defines the boundary: a send already inside the transaction may commit and is reported in flight; if cancellation wins, a later send is rejected. Messages already attached to the delivery outbox may still complete; the API reports in-flight jobs. If a worker lease expired after message commit but before the job stored its message ID, cancellation recovers the message by its deterministic operation key and moves the job to `delivery_pending`; an expired lease with no committed message is fenced as cancelled.

Not available over HTTP:
- Enqueue, send, schedule or manually retry campaigns.
- Activate entitlements or manage billing.
- Change message classification to `business_offer`.

The internal queue primitive is not a user-facing send feature. Do not expose it until entitlement/billing activation, explicit confirmation UX, global platform-wide rate caps, abuse controls, campaign scheduling semantics and operational monitoring have been reviewed and tested.

## Known gaps / release blockers

- No public enqueue/confirmation endpoint or campaign UI.
- No production billing or entitlement activation workflow.
- The per-business database token bucket is implemented, but no global platform-wide rate ceiling, adaptive abuse detection, campaign content moderation or operator kill switch exists.
- Cancellation does not recall a message already committed to the transactional outbox or delivered to a recipient inbox. A separate retract/recall workflow is not implemented.
- No production-grade operational dashboard, alerting or sustained-load evidence.
- PoC migrations/rollback and production readiness remain incomplete.

## Acceptance coverage

Current Node tests cover fail-closed entitlement, recipient eligibility, missing direct conversations, archived-customer exclusion, enqueue idempotency, tenant ownership integrity, worker lease fencing, bounded retry, message-creation archive recheck, final-delivery archive cancellation, outbox reconciliation, per-business token-bucket exhaustion, owner-scoped campaign cancellation, transactionally fenced send-vs-cancel ordering, recovery of committed-but-unattached messages during cancellation and draft-edit state/ownership guards. Exact-head CI is required for every change; a passing Node/Go lane does not imply Kotlin license-policy approval.

## Decision

Keep PR changes in Draft. Do not merge or expose campaign dispatch publicly until the release blockers above are addressed and all required CI/security/license gates are green.
