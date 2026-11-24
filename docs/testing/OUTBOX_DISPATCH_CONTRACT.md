# Outbox dispatch contract

Status: implementation-neutral engineering contract, not a product promise or production architecture decision.

## Purpose and boundary

An accepted message creates one durable dispatch intent per recipient. A dispatcher processes those intents independently of message acceptance. This contract separates:
- durable message acceptance;
- dispatch attempts to a recipient-facing transport;
- transport acknowledgement;
- recipient-device delivery, display and read receipts.

The outbox's `dispatched` state means only that the dispatcher recorded a successful transport handoff. It is not a device-delivery or read receipt.

## Identity and idempotency

Each outbox item is uniquely identified by `(message_id, recipient_id)`. The same key must be reused across retries. Enqueueing the same identity with the same conversation and sequence is idempotent; conflicting metadata is rejected.

A receiver that may observe retries must deduplicate by stable `message_id` (or an equivalent stable delivery key) before applying a non-idempotent side effect. Without receiver-side deduplication, a crash after the side effect but before outbox acknowledgement can produce a duplicate side effect. The system must not claim exactly-once network delivery.

## States

- `pending`: eligible now or at `next_attempt_at`.
- `leased`: temporarily owned by a worker with a unique claim token and expiry.
- `dispatched`: transport handoff was acknowledged and recorded.
- `dead_letter`: the bounded attempt policy was exhausted. It blocks later messages to the same recipient in the same conversation until an explicit operator replay/skip policy is defined.

## Claim and fencing

A claim atomically:
1. selects an eligible item whose retry time is due, or whose previous lease expired;
2. checks that no earlier message for the same recipient in the same conversation remains undispatched;
3. increments the attempt count;
4. records worker identity, unique claim token and lease expiry.

Only the current, unexpired claim token may acknowledge or release the item. A stale worker must not overwrite a newer worker's result. Acknowledgement at or after lease expiry is rejected.

## Retry and dead-letter policy

Retryable failure releases the claim and supplies a future `next_attempt_at`. A deterministic capped exponential policy is:

`delay(attempt) = min(base_seconds * 2^(attempt - 1), max_seconds)`

Production systems normally add jitter and persist their scheduling policy. The adapter experiment uses caller-supplied logical timestamps; it does not own a scheduler.

Attempts are bounded. If the final attempt fails or its lease expires, the item becomes dead-lettered. A dead-lettered earlier item blocks later messages for that recipient to preserve order. Operator replay, skip, alerting and retention policy are separate requirements and are not implemented here.

The configured maximum-attempt policy must remain stable for a queue item across workers and restarts. A lower limit supplied later must not be treated as a safe production policy change without an explicit migration.

## Ordering and isolation

Ordering is per recipient within a conversation, not global across all recipients or conversations. A slow or dead-lettered item for recipient B must not block recipient C or an unrelated conversation. A later item for B must not overtake an earlier non-dispatched item for B.

## Time assumptions

The contract uses an authoritative server/database clock or a monotonic logical clock. Worker-local wall clocks must not independently decide lease validity. The SQLite experiment passes explicit integer timestamps to make boundaries deterministic; clock-skew behavior is not proven.

## Required failure scenarios

1. Worker crashes before transport side effect: lease expires and item is retried.
2. Worker performs transport side effect, then crashes before acknowledgement: same delivery key is retried; receiver dedup prevents a duplicate side effect.
3. Old worker returns after lease reclamation: stale token is rejected.
4. Retry time is in the future: item is not claimable early.
5. Final attempt fails or expires: item is dead-lettered.
6. Earlier item is dead-lettered: later item for the same recipient remains blocked.
7. Other recipients and conversations continue independently.

## Acceptance criteria

- No dispatch intent is lost when the message transaction commits.
- Claims are exclusive for a given item at a point in time and fenced by a unique token.
- Retry scheduling is durable and bounded.
- A stale worker cannot acknowledge or release a newer claim.
- Receiver-side idempotency is explicit and testable.
- Per-recipient conversation order is preserved.
- Dispatch acknowledgement remains distinct from device delivery/read.
- Dead-letter operations are visible and do not silently reorder a conversation.

## Non-goals

This contract does not choose SQLite, PostgreSQL, Redis, a broker, a transport, a deployment topology or an E2EE model. It does not guarantee exactly-once network delivery, device delivery, host power-loss durability, throughput, availability or production operations.
