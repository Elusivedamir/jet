# Jetson Messenger — Message Delivery Failure Risk Register

**Review date:** 2026-11-27  
**Status:** Source-derived hypotheses requiring fault injection; not confirmed defects in upstream products.  
**Purpose:** carry high-risk persistence/queue findings into Jetson architecture gates without copying an upstream implementation.

## Severity and evidence vocabulary

- **High-priority hypothesis:** source shape could permit message loss, duplicate side effects, inconsistent history or sequence gaps if the relevant failure/ack semantics behave as feared.
- **Confirmed source behavior:** exact code path was retrieved at the pinned blob and inspected.
- **Unconfirmed system outcome:** depends on MQ implementation, batcher callback semantics, adapter transaction behavior, consumer offsets, retries and recovery paths not fully traced here.
- No upstream runtime fault-injection or integration tests were run in this review.

## Risk register

| ID | Candidate/path | Confirmed source behavior | Potential consequence | Status |
|---|---|---|---|---|
| MDR-001 | OpenIM consumer acknowledgement | OnComplete marks and commits the last raw MQ message; worker do has no returned error; HandlerRedisMessage logs batcher.Put error then returns nil | Source message could be acknowledged despite enqueue/processing failure if surrounding batcher/consumer semantics allow it | High-priority hypothesis; offset semantics unverified |
| MDR-002 | OpenIM cache and persistence queue | BatchInsertChat2Cache allocates conversation sequence before SetMessageBySeqs; handler then separately publishes to Mongo MQ; Mongo-MQ error is logged in handler | Sequence gaps, Redis-only message state or delayed/lost DB persistence if downstream retry/replay is absent | High-priority hypothesis; recovery path unverified |
| MDR-003 | OpenIM non-storage push path | handleMsg invokes toPushTopic for notStorageList before the storage-list cache operation; stored messages are pushed after cache insertion and Mongo-MQ publish attempt | The handler has distinct paths and ordering; incorrect classification or partial batch handling could create side effects inconsistent with history | Requires classification/batch fault tests; no same-message loss claim |
| MDR-004 | Tinode mapper sequence + message save | Mapper calls TopicUpdateOnMessage and then MessageSave as separate adapter interface calls; sender read-state update is best-effort | Failure between sequence update and message insert may leave a gap; backend-specific transaction behavior may mitigate it | Potential sequence-gap risk; adapter transaction behavior unverified |
| MDR-005 | Queue/batch completion semantics | OpenIM OnComplete commits the last raw message after batcher completion; exact batcher's handling of processing errors and partial batch success was not traced in this check | A committed offset may cover work that did not durably complete | Blocked pending batcher source and MQ offset semantics |

## Exact evidence

### OpenIM

- [online_history_msg_handler.go blob](https://github.com/OpenIMSDK/Open-IM-Server/blob/8af585ce33b1ca9661bfda1abd00e5277d46e944/internal/msgtransfer/online_history_msg_handler.go)
- [msg_transfer.go blob](https://github.com/OpenIMSDK/Open-IM-Server/blob/8a8d9e7d26cf51a117826e7728b9f92ff5d3861f)

Inspected details:
- OnComplete calls Mark() and Commit() on the last raw message.
- HandlerRedisMessage logs a Put error and returns nil.
- do returns no error to the batcher callback.
- handleMsg returns early after a Redis cache insertion error, logging it.
- BatchInsertChat2Cache calls seqConversation.Malloc before msgCache.SetMessageBySeqs.
- MsgToMongoMQ and MsgToPushMQ can return errors; the inspected handler logs these errors rather than returning them to the batcher callback.

These are code-shape observations. Whether a source offset is actually committed after each failure depends on the external batcher/MQ contracts and surrounding lifecycle. The report's risk is deliberately classified as a hypothesis, not a confirmed message-loss bug.

### Tinode

- [store.go blob](https://github.com/tinode/chat/blob/0a06b29288f92cd203b13d7573bf835a3e6cdda0/server/store/store.go)

Inspected details:
- Mapper assigns a UID, calls TopicUpdateOnMessage, returns on error, then calls MessageSave.
- Sender read-state update happens after save and is explicitly best-effort in the inspected code.

This does not prove a sequence gap occurs: a specific database adapter may provide transactional behavior internally. The mapper-level separation makes adapter-specific transaction inspection and fault injection necessary.

## Required experiments before borrowing these patterns

### OpenIM-like MQ/batcher path

1. Force batcher.Put to fail; inspect whether the source MQ message is acknowledged or redelivered.
2. Force Redis SetMessageBySeqs to fail after sequence allocation; restart and inspect offsets, sequence gaps and replay behavior.
3. Force Mongo MQ publish to fail after Redis cache insertion; verify durable retry/reconciliation after process restart.
4. Force push MQ publish to fail; verify independent retry without losing history or duplicating user-visible delivery.
5. Kill the worker between Mark and Commit, and during partial batch processing.
6. Confirm whether OnComplete can run after an error/early return and how a batch's last-message commit represents all preceding messages.
7. Trace producer durability, consumer-group offset semantics, rebalance and replay behavior for the exact release.

### Tinode-like sequence and persistence path

1. Force TopicUpdateOnMessage success followed by MessageSave failure for each supported adapter.
2. Determine whether sequence advancement and message insert share a database transaction/connection.
3. Retry the same logical operation after the injected failure; check duplicate identity, sequence gap and ordering.
4. Run concurrent sends and process restart at each adapter boundary.
5. Decide whether gaps are allowed; if so, verify sync cursors and pagination never skip committed messages.

## Jetson design implications

1. The Jetson accepted response must follow a durable atomic boundary for message identity, conversation position, idempotency record and recoverable delivery intent.
2. Do not acknowledge/commit source work merely because a callback completed if internal side effects failed; errors must be propagated or represented by durable retry state.
3. Sequence allocation and message persistence must be atomic, or the contract must explicitly permit gaps and sync must be gap-safe.
4. Push is a side effect/notification hint, not the source of truth for message history.
5. Every independently failing downstream action needs its own durable state, retry policy, idempotency identity and reconciliation.
6. A green reference-model/SQLite suite does not prove MQ semantics, network delivery, distributed transactions or production durability.

## Decision impact

- Do not use OpenIM's queue/handler pattern as a Jetson foundation without resolving MDR-001 through MDR-003.
- Do not assume Tinode's mapper sequence allocation is atomic with message insertion without checking each adapter.
- The current modular-monolith proposal remains provisional. The safe initial Jetson contract is still a transactionally committed message + idempotency + outbox, followed by independently retriable delivery workers.
- No upstream defect, vulnerability, legal violation or production failure is asserted by this register.