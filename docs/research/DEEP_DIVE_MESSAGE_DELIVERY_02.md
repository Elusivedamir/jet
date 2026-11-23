# Deep dive 02 — message persistence, ordering and reconnect delivery

**Review date:** 2026-11-23  
**Scope:** selected implementation files in OpenIM Server, Matrix Synapse, Tinode and ejabberd. This is source-reading, not a formal audit or proof of end-to-end delivery guarantees. Exact commits and paths are listed so the review can be repeated.

## 1. OpenIM Server — queued transfer, batching and acknowledgements

Reviewed:
- `internal/msgtransfer/online_history_msg_handler.go`, blob `8af585ce33b1ca9661bfda1abd00e5277d46e944`, branch `main`.
- Official deployment guide: https://docs.openim.io/docs/guides/deployment/source

Observed in source:
- A consumer handler wraps messages with the original MQ message object.
- A batcher is configured with worker count, interval, data buffer, sharding and synchronous wait.
- Sharding hashes the message key, so messages sharing a key are routed to the same worker lane.
- The batcher's `OnComplete` callback calls `Mark()` and `Commit()` on the last raw message.
- The worker parses protobuf payloads, aggregates context and splits normal messages/notifications into storage and non-storage groups.
- Read-sequence notifications are grouped by conversation/user and written to the database; errors are logged.

Interpretation and questions:
- This is a concrete example of keyed batching and delayed queue acknowledgement. It is a useful pattern to study, not proof of exactly-once delivery.
- The critical correctness question is whether every side effect in the batch has durably completed before the last message is committed. The inspected slice shows the completion callback and processing path, but does not by itself establish all error propagation, retry and partial-batch behavior.
- A review must trace the underlying MQ implementation, batcher's error contract, consumer offset semantics, handler return paths, database idempotency keys and crash windows.
- Deployment documentation currently lists MongoDB, Redis, Kafka, MinIO and Etcd as backing components for its source-deployment guide. A different OpenIM README/version lists MySQL as well. Treat dependency lists as release/documentation-version-specific; reconcile the exact stable tag before costing a deployment.
- Official deployment guide explicitly instructs operators to replace default usernames/passwords, configure component credentials and use a stable release tag rather than main or prerelease.

What to test if this pattern is ever prototyped:
1. Kill the worker before persistence, after persistence, and before MQ commit.
2. Kill it after processing some messages in a batch but before all messages finish.
3. Replay a batch and verify duplicate suppression for message IDs and all side effects.
4. Deliver same-key and different-key messages concurrently; verify ordering and isolation.
5. Fail database, cache, push and RPC independently; verify retry/dead-letter behavior.
6. Confirm offset/ack semantics after process restart and rebalance.

## 2. Matrix Synapse — serialized persistence per room and event deduplication

Reviewed:
- `synapse/storage/controllers/persist_events.py`, blob `22cc946a6473f0eccdfdd01bee915a9bb0eb21ce`, branch `develop`.
- `synapse/handlers/message.py`, blob `a980678955639b635a91892701b07f342c43990c`.
- `tests/handlers/test_message.py`, blob `1160a66938efe712e998e17ed6ca48f0873801b5`.
- `tests/rest/client/test_rooms.py`, blob `313d5f546e012a4f412ba260d625620dd884a001`.

Observed in source:
- `persist_events` partitions incoming event/context pairs by room ID.
- Each room's work is submitted to an event-persistence queue.
- Its documented return path accounts for events deduplicated because an existing event matched the transaction ID; it returns the existing persisted event in that case.
- Single-event persistence returns the assigned stream ordering and current room stream token, and asserts that the stream ordering has been assigned.
- The repository has dedicated message-handler tests and a very large room REST test module.

Interpretation:
- Per-room serialization and transaction-ID-based deduplication are important patterns for concurrent chat systems.
- A global ordering counter is not the same as a user's delivery/read cursor. Model message identity, room ordering, per-device sync cursor and read receipts as distinct concepts.
- Matrix's event graph and federation semantics are specialized; copying its event model would effectively commit to Matrix-like semantics and should not happen by accident.
- Tests must be inspected for the exact guarantees they enforce; file size alone is not a quality score.

Questions for further review:
- How transaction IDs are scoped and persisted for every client API.
- How failed persistence and worker restarts affect stream tokens.
- How multi-writer workers coordinate ordering.
- What retention, redaction and backfill do to pagination.
- Which invariants are enforced by database constraints vs application code.

## 3. Tinode — storage abstraction and per-topic sequence numbers

Reviewed:
- `server/store/store.go`, blob `0a06b29288f92cd203b13d7573bf835a3e6cdda0`, branch `master`.
- `server/db/mysql/adapter.go`, blob `0629545528263194c3bed2734d92564056810cc6`.
- `server/cluster.go`, blob `55529789da1da352ff6919370350ca36205a1ca1`.

Observed in source:
- Message persistence is behind a `MessagesPersistenceInterface` with Save, DeleteList, GetAll and GetDeleted methods.
- The mapper initializes timestamps, assigns a UID, updates the topic sequence, then calls the adapter's MessageSave.
- The MySQL schema defines per-topic message sequence IDs and a unique index on `(topic, seqid)`.
- The cluster implementation has explicit proxy/master request types, bounded buffers, network timeouts and reconnect intervals.

Interpretation:
- Storage abstraction makes database implementations swappable at a boundary, but the complete transaction boundary must be verified: topic sequence update and message insert are separate calls in the mapper excerpt. Check whether the adapter wraps them in one transaction or how gaps/retries are handled.
- A unique per-topic sequence constraint is a useful invariant to study.
- The mapper excerpt ignores a sender read-state update error after saving the message. That may be an intentional best-effort behavior, but it demonstrates why side effects need explicit criticality classification.
- Cluster code exposes bounded queues and timeouts; inspect overload behavior and backpressure before using it as a pattern.

## 4. ejabberd — XEP-0198 stream management and session resumption

Reviewed:
- `src/mod_stream_mgmt.erl`, blob `046b6529e3a701ddf0b46ccb76efe3763ea737dc`, branch `master`.
- `src/mod_offline.erl`, blob `715c9a13be930b2fa9dada23ba1601d0590cc614`.
- `src/mod_mam.erl`, blob `b4aa7686eb822d8be568e6140098915742d627f5`.
- Root `COPYING` contains GNU GPL version 2 text with an OpenSSL linking exception. This corrects the earlier metadata-only `NOASSERTION` caveat; verify the complete license terms and all dependencies before any reuse.

Observed in source:
- Stream management advertises XEP-0198 and tracks inbound/outbound stanza counters.
- It maintains an unacknowledged stanza queue and configurable acknowledgement and resumption timeouts.
- On acknowledgement timeout, the session transitions to pending; on a valid resume request, queued state is restored.
- On session termination, unacknowledged stanzas are routed again; the code also handles late resume responses and expired pending sessions.
- Offline message storage and Message Archive Management are separate modules, not one combined mechanism.

Interpretation:
- Transport acknowledgement, server persistence, recipient delivery and user read receipts are four different events. They must never be conflated.
- Session resumption with unacknowledged queues is a mature reconnect pattern, but it does not by itself guarantee durable offline storage.
- Separate offline storage and archive modules are a useful separation of concerns.
- ejabberd is GPL-2.0-or-later with an OpenSSL linking exception based on the inspected root license text; legal review remains necessary for source reuse or distribution.

## 5. Cross-project lessons — patterns worth testing, not copying

| Concern | Pattern observed | Required independent test |
|---|---|---|
| Message order | Per-topic sequence (Tinode); per-room persistence queue (Synapse) | Concurrent sends, retry, duplicate transaction and worker crash |
| Queue processing | Key-sharded batches and explicit commit callback (OpenIM) | Crash at every boundary before/after durable effects and commit |
| Idempotency | Transaction-ID deduplication (Synapse); unique topic+sequence index (Tinode) | Duplicate client request and duplicate broker delivery |
| Reconnect | Unacknowledged stanza queue and resume (ejabberd) | Disconnect during send, ack loss, resume timeout, late ack |
| Offline/history | Separate offline store and archive modules (ejabberd); message DB interfaces (Tinode) | Retention, pagination, delete/redact, archive recovery |
| Side effects | Push/read-state processing may be separate from primary persistence | Push failure must not corrupt durable message state; retry safely |
| Backpressure | Bounded cluster and batch buffers (Tinode/OpenIM) | Saturation, overload shedding, queue growth and recovery |

## 6. Architecture-neutral invariants to carry into future requirements

These are engineering invariants to evaluate against the business plan, not product requirements or a chosen architecture:

1. Every accepted message needs a stable identity independent of its display order.
2. Retry of the same client operation must not create duplicate durable messages.
3. Ordering scope must be explicit (conversation, room, topic or another defined unit).
4. Acknowledgement must name what is acknowledged: received by server, durably stored, handed to recipient transport, delivered to device, or read by user.
5. Per-device synchronization cursors must be separate from conversation read state.
6. Queue acknowledgement must not advance past effects that are not durably completed unless the system has a documented replay/idempotency strategy.
7. Push is a notification hint, not the source of truth for message delivery.
8. Reconnect must define replay boundaries, duplicate suppression and expiry.
9. Every queue and buffer needs bounded capacity, backpressure behavior and observable lag.
10. Message deletion, retention, archive and backup/restore must preserve the explicitly promised semantics.

## 7. Review limits

- This review inspected selected source ranges, not every call path or backend adapter.
- No runtime tests, load tests, fault injection or security tests were executed.
- No guarantee is claimed for exactly-once delivery, end-to-end delivery, cryptographic safety or production readiness.
- No code was copied into Jetson; no architecture or technology was selected.
- Product prioritization remains blocked on verified transcription and page-by-page reconciliation of the canonical business-plan PDF.


## 8. Additional critical-path findings from extended source trace

### OpenIM: queue acknowledgement and persistence failure need a dedicated fault-injection audit

Additional exact source:
- `internal/msgtransfer/online_history_msg_handler.go`, lines 100–140, 250–360, blob `8af585ce33b1ca9661bfda1abd00e5277d46e944`.
- `pkg/common/storage/controller/msg_transfer.go`, blob `8a8d9e7d26cf51a117826e7728b9f92ff5d3861f`.

Observed:
- The batcher's `OnComplete` callback calls `Mark()` and `Commit()` on the last raw MQ message.
- The worker's `do` callback has no returned error value.
- `handleMsg` logs a failure from `BatchInsertChat2Cache` and returns from that helper; the outer `do` function does not receive an error.
- `MsgToMongoMQ` and `MsgToPushMQ` failures are logged in the inspected handler paths rather than returned to the batcher callback.
- `HandlerRedisMessage` logs an error from `Put`, then returns nil.
- The storage controller allocates conversation sequence numbers, writes messages into Redis cache, and exposes a separate method for sending the Mongo persistence queue message. The handler invokes the Mongo queue step after cache insertion.
- In `handleMsg`, the non-storage push path is invoked before the cache batch insert. A later cache insertion failure therefore occurs after that push attempt.

Risk assessment:
- These are **high-priority potential message-loss / inconsistent-side-effect paths**, not a confirmed exploitable defect. The exact behavior depends on the batcher implementation, underlying MQ's Mark/Commit semantics, producer durability and consumer-group offset behavior.
- Because the handler's processing callback does not propagate errors to the acknowledgement callback, the code shape makes it essential to verify whether failed processing can still reach `OnComplete` and commit the batch.
- If a message is pushed before its durable history record exists, a recipient could be notified before the durable record is safely stored. If cache insertion fails and the source offset is nevertheless committed, recovery may be impossible without another replay path.
- If publishing to Mongo or push fails but the batch is still committed, verify whether a durable retry/outbox mechanism exists elsewhere. Logging alone is not a recovery strategy.

Required tests before this design could be considered safe:
1. Force Redis cache write to fail; inspect source MQ offset after handler completion and restart.
2. Force Mongo-queue publish to fail after Redis cache write; verify durable retry/reconciliation.
3. Force push-queue publish to fail; verify independent retry and no message loss.
4. Force `batcher.Put` to fail; verify the caller does not silently acknowledge the source message.
5. Kill process between `Mark` and `Commit`, and between cache write and downstream queue publish.
6. Verify that committing the last message in a batch cannot acknowledge earlier messages whose effects failed.
7. Confirm the exact MQ producer delivery guarantees and consumer offset semantics for the pinned release.

### Tinode: sequence allocation and message insert are separate adapter calls in the mapper

Additional exact source:
- `server/store/store.go`, lines 681–710, blob `0a06b29288f92cd203b13d7573bf835a3e6cdda0`.
- `server/db/mysql/adapter.go` and `server/db/postgres/adapter.go` implement `TopicUpdateOnMessage` and `MessageSave` separately.
- PostgreSQL `MessageSave` inserts the message with the already-assigned sequence ID and returns the database row ID.

Observed:
- The mapper calls `TopicUpdateOnMessage` first, then `MessageSave`.
- They are separate adapter interface calls. The inspected mapper does not wrap both in one explicit transaction.
- The schema has a unique `(topic, seqid)` index, which protects uniqueness but does not by itself prove atomicity between sequence advancement and message insert.

Risk / question:
- A failure between sequence advancement and message insert may leave a sequence gap or require retry handling. Gaps may be acceptable, but that must be an explicit invariant and clients must not assume contiguous sequence numbers.
- Verify per-adapter behavior, concurrency under simultaneous sends, duplicate retries and recovery from insert failure. Do not infer atomicity from the unique index.

### License correction for ejabberd

The root `COPYING` file was inspected after the earlier GitHub metadata returned `NOASSERTION`. It contains GNU GPL version 2 text and an OpenSSL linking exception. Source modules also state GPL version 2 or later. The repository's actual licensing terms therefore need to be read from the root file and applicable notices; metadata alone was insufficient.
