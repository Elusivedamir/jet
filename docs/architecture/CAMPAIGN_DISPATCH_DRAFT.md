# Campaign dispatch — architecture draft

**Draft — internal worker implementation exists; no public enqueue/send endpoint is authorized.**

**Status:** partial implementation in Node.js/TypeScript PoC; not production-ready.  
**Primary implementation target:** Node.js + TypeScript with PostgreSQL.  
**Current product/API boundary:** drafts and audience preview are public; enqueue and dispatch are internal primitives only. No public mass-send endpoint exists.

## 1. Goals

Design an internal Jetson Business campaign pipeline that:
- creates one durable work item per eligible recipient;
- respects recipient-controlled master preference and per-business consent;
- never trusts a point-in-time audience preview as send authorization;
- is idempotent across worker crashes and retries;
- uses the existing message transaction/outbox/inbox delivery path;
- cancels a queued offer if consent or contact eligibility is revoked before actual recipient delivery;
- remains internal-only (no email, SMS, third-party channels or public outbound API).

## 2. Non-goals for this draft

- Public campaign enqueue/send endpoints or external delivery channels.
- Defining subscription prices, trial terms or billing integration.
- Legal advice or a claim of jurisdiction-specific consent compliance.
- External marketing integrations.
- Promising delivery to a device; a durable inbox row is the current delivery boundary.

## 3. Proposed data model

### Campaign state

Extend the current draft-only campaign state only when dispatch is implemented:

`draft -> queued -> sending -> completed`

Optional terminal state: `cancelled`. The current `business_campaigns` table permits only `draft`; this proposal does not change it.

Campaign fields to consider:
- `status`, `enqueued_at`, `completed_at`;
- `enqueue_idempotency_key` scoped to the owning business account;
- aggregate counters for eligible, queued, delivered, skipped and failed recipients.

Counters are derived/repairable projections, not the source of truth. Recipient-job rows remain authoritative.

### Per-recipient job

Proposed table: `business_campaign_jobs`.

| Field | Purpose |
|---|---|
| `id` | Stable job ID |
| `campaign_id` | Owning campaign |
| `business_account_id` | Tenant scope and sender |
| `recipient_id` | Exactly one recipient |
| `status` | `queued`, `processing`, `delivery_pending`, `sent`, `skipped`, `retry_wait`, `failed`, `cancelled` |
| `attempt_count` | Bounded attempts |
| `available_at` | Next eligible claim time |
| `lease_until`, `lease_token` | Expiring worker lease and fencing |
| `operation_key` | Stable message idempotency key |
| `message_id` | Message created by the existing message send path |
| `skip_reason`, `last_error` | Safe operational outcome |
| timestamps | Created, updated, submitted and completed times |

Constraints:
- unique `(campaign_id, recipient_id)`;
- unique operation key;
- recipient and campaign foreign keys;
- indexes for claimable jobs by `status, available_at, lease_until, id`;
- tenant ownership enforced in every read/write query.

One job represents one recipient. Do not model a whole audience as one opaque send task.

## 4. Enqueue transaction

A future explicit enqueue action must be a separate user action from preview.

Inside one PostgreSQL transaction:

1. Authenticate the business account and verify campaign ownership.
2. Enforce Business entitlement and campaign/send limits. These are not implemented today and must be prerequisites, not assumed.
3. Require explicit confirmation and a campaign-level idempotency key.
4. Lock the campaign row and require `status='draft'`.
5. Recompute the audience from current CRM relationships; never reuse preview results as authorization.
6. For each candidate in deterministic recipient-ID order:
   - verify the accepted-contact relationship;
   - verify the stable direct-conversation mapping;
   - lock rows in the established order: recipient master preference -> per-business consent -> contact;
   - insert one job only if all gates pass.
7. Record excluded counts/reasons without exposing another user's preference state to an unaccepted business.
8. Change campaign state to `queued` and commit.

The enqueue transaction must use the same lock order as consent mutations, direct business-offer send and dispatch. A master opt-out that wins the preference lock must prevent a new job from being authorized.

## 5. Worker and idempotency

A worker claims jobs using `FOR UPDATE SKIP LOCKED`, a lease expiry and a fencing token. Expired jobs can be reclaimed. Every state-changing write must verify the current lease token and unexpired lease.

For each claimed job:

1. Check that the campaign is still eligible to run.
2. Call the existing internal `Store.send(..., "business_offer")` path with the campaign business account, direct conversation, one recipient and stable operation key.
3. That send path performs the authoritative preference/consent/contact checks again inside the message + outbox transaction.
4. If eligibility has been revoked, mark the job `skipped`; do not retry as a transient error.
5. If message creation commits, store its `message_id` and move the job to `delivery_pending`.
6. A reconciliation worker (or equivalent transactional completion path) observes the corresponding `delivery_outbox` row:
   - `completed` -> job `sent`;
   - `cancelled` -> job `skipped` with the safe cancellation reason;
   - `terminal_failure` -> job `failed`;
   - pending/retry/processing -> remain `delivery_pending`.

The campaign job must not be counted as sent merely because a message row was created. Actual delivery is represented by the recipient inbox row, and the outbox state must be reconciled.

### Stable idempotency

Derive the message operation key deterministically from campaign ID and recipient ID (for example, a namespaced SHA-256 digest). Do not use a fresh random key per attempt.

If a worker crashes after `Store.send` commits but before the campaign job is updated, the next attempt calls `Store.send` with the same operation key. The existing sender-scoped idempotency check returns the original message and does not create a duplicate message or outbox intent. The job can then resume tracking that message's delivery state.

### Retry policy

- Retry only transient database/worker failures.
- Use bounded exponential backoff and the existing maximum-attempt policy as a starting point.
- Eligibility failures are terminal `skipped`, not retryable.
- Exhausted transient failures become `failed` and remain observable for support/reconciliation.
- All worker state transitions are fenced by the lease token.

## 6. Revocation and delivery race

There are two independent checks:

**At message creation:** `Store.send` locks preference -> consent -> contact and commits the message/outbox only if the recipient is currently eligible.

**At recipient delivery:** the delivery worker repeats the check under the same lock order immediately before inserting the recipient inbox row. If consent, master preference or contact eligibility is revoked after message creation but before delivery, the outbox item becomes `cancelled`; no recipient inbox row is created.

The recipient-visibility predicate also requires a durable inbox row for `business_offer` messages. A cancelled offer must not leak through history, search, conversation preview, reactions, pins, forwards/replies or event feeds.

Race rule: whichever transaction obtains the permission locks first defines the order. A delivery may complete before a later opt-out; if the opt-out commits first, delivery must cancel. The system cannot retroactively retract an offer already durably delivered.

## 7. Campaign cancellation semantics

Campaign cancellation is not yet designed as a user-facing feature. Before adding it, define and test how to handle each job state:
- queued/retry_wait: safe to cancel without creating a message;
- processing: require lease fencing and a final campaign-state check;
- delivery_pending: requires a defined way to cancel the linked message/outbox before inbox insertion;
- sent: cannot be recalled by changing campaign state.

Do not expose a campaign-cancel button until delivery-pending cancellation has a transactional design. Consent revocation remains independently enforced by the existing dispatch boundary.

## 8. Required API shape (proposal only)

Possible future endpoint:
- `POST /v1/business/campaigns/{campaign_id}/enqueue` with explicit `confirm: true` and a caller-supplied idempotency key.

The response should return a durable enqueue receipt and aggregate counts, not claim that messages have already been delivered. Do not add `send` as a public generic message-class parameter. The public message endpoint must continue to reject client-controlled `business_offer` classification.

No endpoint is approved by this draft. Authentication, entitlement, rate caps and abuse controls must be specified before implementation.

## 9. Acceptance tests before any send endpoint

- Cross-business tenant isolation for campaigns and jobs.
- Preview results cannot authorize enqueue after consent changes.
- Master preference off by default; master-on without per-business grant still excludes.
- Accepted-contact and direct-conversation requirement.
- Group conversations are never eligible.
- Duplicate enqueue request creates no duplicate jobs.
- Unique job per campaign/recipient.
- Concurrent workers never own the same active lease.
- Expired lease and stale fencing token cannot update a reclaimed job.
- Worker crash after message commit but before job update produces one message/outbox intent only.
- Opt-out before enqueue excludes the recipient.
- Opt-out after enqueue but before message creation marks job skipped.
- Opt-out after message creation but before recipient delivery cancels the outbox and creates no inbox row.
- Cancelled offers remain invisible in history, search, preview, events, reactions, pins and forwarding.
- Outbox completion, cancellation and terminal failure reconcile to the correct campaign-job state.
- Transient failures retry with bounded backoff; eligibility failures do not.
- Business entitlement and send caps fail closed.
- No external transport or public outbound API is called.

## 10. Decision gates

This is a draft, not an accepted ADR. Implementation begins only after:
1. the job/outbox state reconciliation is reviewed;
2. campaign cancellation semantics are settled or explicitly excluded from v1;
3. entitlement and send-limit enforcement are defined;
4. migrations and rollback are designed;
5. the full acceptance test matrix is implemented;
6. exact-head CI is green.

Until then, campaigns remain draft-only and preview-only.


## Implementation progress — internal queue foundation

The Node PoC now has a fail-closed internal queue foundation:
- business_entitlements defaults to no campaign entitlement; no public activation endpoint exists.
- business_campaign_jobs stores one durable row per campaign/recipient with a unique pair and stable operation key.
- enqueueDraft locks the campaign, requires an active internal entitlement, recomputes CRM candidates and locks recipient preference -> per-business consent -> contact before inserting jobs.
- Enqueue is idempotent for the same campaign key.
- claimJobs uses FOR UPDATE SKIP LOCKED, expiring per-job fencing tokens and marks campaigns as sending when work is claimed.
- attachMessage rejects stale leases; reconcileDelivery maps outbox completion/cancellation/terminal failure to sent/skipped/failed.

This is not yet a usable campaign-send feature. At that stage there was no HTTP enqueue route, entitlement activation/billing path, campaign sender or bounded retry loop. The later implementation section supersedes those historical notes: an internal worker now calls the message store and uses bounded retries. Public enqueue, entitlement activation/billing, cancellation UI, rate caps and abuse controls remain release blockers. The existing delivery worker still owns the final consent re-check and inbox insertion. These are explicit release blockers.

New tests cover fail-closed entitlement, recipient-level job creation, idempotent enqueue, lease fencing and delivery reconciliation.


## 7. Implemented PoC boundary (2026-11-28)

Implemented in the Node TypeScript branch:
- Durable per-recipient queue and fail-closed business entitlement gate.
- Idempotent enqueue and per-job lease/fencing token.
- Internal campaign worker calls the existing Store.send business_offer path with a stable campaign/recipient operation key. If the worker crashes after message commit, the same operation key returns the original message on retry.
- Consent/contact is checked in the message transaction and again by the delivery worker immediately before recipient inbox insertion. Ineligible jobs are skipped; cancelled outbox deliveries reconcile as skipped.
- Transient campaign-worker errors use bounded exponential retry, terminal after eight attempts. The worker processes one job per iteration, uses a 60-second lease and backs off up to 15 seconds after infrastructure errors. Delivery-pending jobs reconcile against recipient-specific outbox state; a campaign completes only when all jobs are terminal.
- The server starts the internal campaign worker alongside the message delivery worker. There is still no public enqueue route, no billing/entitlement activation path, no campaign cancellation UI, no rate-cap/abuse-control layer and no production readiness claim.

Audience preview and enqueue now explicitly classify CRM contacts without a direct conversation as excluded, with the reason direct_conversation_missing; they are included in excluded counts and never silently omitted.
