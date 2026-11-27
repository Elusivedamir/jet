# Message State Machine — Contract for Tests

**Status:** Proposed observable contract; implementation-neutral.
**Trace:** `CORE-003`, `CORE-004`, Gate A and cross-cutting reliability requirements in `docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md`.
**Authority:** Business plan and product acceptance framework. This document does not choose storage, broker, protocol or client technology.

## 1. Separate the message from its delivery attempts

A logical message and its delivery to one or more recipient devices are different entities.

### Logical message

- `operation_key`: stable identity for one client submission, scoped to the authenticated sender/account.
- `message_id`: stable server identity for the committed logical message.
- `conversation_id`: conversation scope.
- `conversation_position`: unique committed position within that conversation.
- `sender_id`, `created_at`, payload reference/content and policy metadata.
- `commit_state`: not_committed | committed. Rejected submissions are not logical messages.

The exact fields and representation remain implementation decisions. The identifiers above describe required concepts, not a mandated schema.

### Per-recipient delivery

- `recipient_id` and, where applicable, `device_id`.
- `delivery_intent_state`: pending | processing | retry_wait | terminal_failure | completed.
- `attempt_count`, `next_attempt_at`, last error class and attempt correlation.
- `device_delivered_at`: nullable; set only on defined recipient-device acknowledgement.
- `read_at`: nullable and separate; set only on a valid read event if read receipts are enabled.

A single message may be persisted while one recipient is delivered and another is pending. Never collapse these facts into one boolean `sent`.

## 2. Allowed logical transitions

```text
RECEIVED
  ├── validation/auth/policy fails ──> REJECTED (no message commit)
  └── valid ──> COMMITTING
                  ├── transaction fails ──> NOT_COMMITTED / retryable or terminal error
                  └── durable commit ──> PERSISTED
                                           └── ACCEPTED response may now be emitted
```

The commit must include enough durable information to recover both the message and the intent to continue delivery. This may be one transaction or a proven equivalent; the test contract does not prescribe the mechanism.

## 3. Allowed delivery transitions

```text
PENDING -> PROCESSING -> COMPLETED
                ├── transient error -> RETRY_WAIT -> PENDING
                ├── worker crash/lease expiry -> PENDING
                └── permanent/policy error -> TERMINAL_FAILURE
```

- Internal processing is allowed to run more than once.
- Every attempt carries the same logical message identity and a recipient-specific delivery identity.
- A worker crash after external send but before recording completion is an ambiguous outcome. Retry/reconciliation must not create an unintended second visible copy.
- Backoff, maximum attempts and manual recovery policy must be explicit before release.

## 4. Idempotency behavior

| Input | Required outcome |
|---|---|
| Same sender/account + same operation key + same canonical payload + same conversation | Resolve to the same message ID and conversation position. |
| Same sender/account + same operation key + different payload | Conflict; do not mutate the original or create a second message. |
| Same sender/account + same operation key reused in a different conversation | Conflict; one operation key identifies one logical submission and cannot resolve to a message in another conversation. |
| Same operation key from a different sender/account | Separate scope; no cross-account lookup or disclosure. |
| Duplicate delivery-work event for same message/recipient | No second logical delivery effect; record/reconcile duplicate processing. |
| Client retries after unknown timeout | Query/retry by the same operation key; do not mint a new logical operation. |

The operation-key retention period must be at least as long as the supported client retry/reconciliation window. The actual duration is OPEN and must be selected before integration testing.

## 5. Ordering and sync

- Conversation position is authoritative for ordering within one conversation.
- Position allocation must be unique and monotonic for committed messages in that conversation.
- No global ordering is promised across conversations.
- A sync cursor identifies a documented position/snapshot boundary. The server must not advance a cursor past an omitted committed message.
- A page replay may repeat a message; clients deduplicate by stable message ID before presenting it.
- Read state and device delivery state do not change conversation ordering.

## 6. Receipt semantics

- **Accepted:** server has durably committed the logical message and recoverable delivery intent.
- **Attempted:** delivery worker began an attempt.
- **Device delivered:** the defined recipient device/service acknowledgement was observed.
- **Read:** a separate, policy-controlled read event was observed.
- **Replied:** a separate new message/reply relationship is recorded by a documented attribution rule.

No state may be inferred from a weaker event. In particular, queue insertion is not device delivery, device delivery is not read, and read is not reply.

## 7. Required invariants

1. Accepted implies durable logical message plus recoverable delivery intent.
2. Rejected implies no logical message commit.
3. One operation key cannot produce two logical messages for the same sender scope.
4. One committed message has one stable conversation position.
5. A pending delivery remains discoverable after worker/server restart.
6. Duplicate internal execution does not create an unintended duplicate visible message.
7. A recipient cannot read/sync another account's messages without authorization.
8. Cursor advancement never silently skips a committed message.
9. Device-delivered and read timestamps are independent nullable facts.
10. All state changes are auditable without logging message body or secrets.

## 8. Deliberately unresolved

This contract does not decide:
- exact id format or database uniqueness constraints;
- whether payload is encrypted client-side or server-side;
- E2EE and multi-device key synchronization;
- retention and deletion semantics;
- membership changes, blocking and dispatch-time policy;
- delivery acknowledgement protocol;
- read-receipt availability/privacy;
- group fan-out semantics;
- retry count, backoff and dead-letter policy;
- RPO/RTO, latency or throughput targets.

Resolve these before turning the affected test cases into release acceptance criteria.
