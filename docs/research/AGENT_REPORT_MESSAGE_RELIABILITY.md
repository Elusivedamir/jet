# Agent Report 01 — Message Reliability and Data Correctness

**Review date:** 2026-11-23
**Scope:** source-level research only; no application code or product scope changes.
**Evidence convention:** **Verified in code/test**, **Documented claim**, and **Inference / unverified** are kept distinct.

## Executive comparison

The four systems use materially different reliability boundaries. OpenIM separates ingress, Redis/cache sequencing, push publication and Mongo persistence through MQ consumers; its source visibly commits a consumed batch after handler completion, but several downstream errors are logged and processing continues or returns without a demonstrated replay policy. Synapse persists Matrix events through a writer path and exposes durable room-stream synchronization; the inspected code and tests provide the clearest transaction/replication model, although this review did not execute its suites. Tinode assigns a topic sequence, saves the message before acknowledging and broadcasting, and exposes separate receive/read sequence state; broadcast and push are downstream side effects after storage. ejabberd combines an offline spool with XMPP stream-management queues: offline messages are stored and later routed, while unacknowledged stanzas can be resent after resume or timeout.

None of the snapshots is evidence for a complete Jetson solution. In particular, this review did not establish a universal idempotency key, exactly-once delivery, or a tested atomic transaction spanning storage, broker, cache, push and client acknowledgement.

## Pinned sources

| Project | Repository and exact commit | Role reviewed |
|---|---|---|
| OpenIM | `https://github.com/OpenIMSDK/Open-IM-Server/tree/a101d85ec16cc21bec60005169725adc1ae5649a` | server/backend |
| Synapse | `https://github.com/element-hq/synapse/tree/0c287237cbb96814282f1bc207e5f6c4407fb8a0` | homeserver/backend |
| Tinode | `https://github.com/tinode/chat/tree/fd8801cdea3f2984008b0cdf38a253060515ce04` | server/backend |
| ejabberd | `https://github.com/processone/ejabberd/tree/afe6393701939f0baf45a1580a30a41bb91700bf` | XMPP server |

Representative pinned source permalinks: [OpenIM message transfer](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/internal/msgtransfer/online_history_msg_handler.go), [OpenIM sequence pull](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/internal/rpc/msg/sync_msg.go), [Synapse event persistence](https://github.com/element-hq/synapse/blob/0c287237cbb96814282f1bc207e5f6c4407fb8a0/synapse/handlers/message.py), [Synapse event store](https://github.com/element-hq/synapse/blob/0c287237cbb96814282f1bc207e5f6c4407fb8a0/synapse/storage/databases/main/events.py), [Tinode save/broadcast](https://github.com/tinode/chat/blob/fd8801cdea3f2984008b0cdf38a253060515ce04/server/topic.go), [ejabberd offline spool](https://github.com/processone/ejabberd/blob/afe6393701939f0baf45a1580a30a41bb91700bf/src/mod_offline.erl), and [ejabberd stream management](https://github.com/processone/ejabberd/blob/afe6393701939f0baf45a1580a30a41bb91700bf/src/mod_stream_mgmt.erl).

## Per-project lifecycle evidence

### OpenIM

`internal/msgtransfer/init.go:36-45,60-124` constructs Redis and Mongo models, MQ producers for `toMongo` and `toPush`, and consumers for `toRedis` and `toMongo`. The comments at lines 39-44 describe the intended sequence: a `toRedis` consumer stores/increments Redis, then emits push and Mongo work. In `internal/msgtransfer/online_history_msg_handler.go:101-124`, a sharded batcher is configured with `OnComplete` calling `Raw.Mark()` and `Raw.Commit()`. `:254-328` shows storage messages inserted with `BatchInsertChat2Cache`, read sequences updated, then `MsgToMongoMQ` and push publication. Errors from Redis insertion cause a logged return (`:267-271`); sequence and Mongo MQ failures are logged (`:273-324`). `internal/rpc/msg/sync_msg.go:31-56` authorizes the user and retrieves messages by conversation sequence ranges for offline/reconnect pull.

**Verified in code:** authorization before pull; sequence-range retrieval; sharded/batched consumption; commit callback after batch completion; Redis/cache before later Mongo MQ and push steps.

**Inference / unverified:** the inspected paths do not prove durable replay after a handler crash, atomicity between Redis and MQ publication, or duplicate suppression across redelivery. A handler return after cache failure may leave the broker message uncommitted, but that behavior depends on the MQ implementation not inspected here.

### Matrix Synapse

`synapse/handlers/message.py:1754-1807` documents `_persist_events` as the persistence boundary and states that an error in a batch drops all events. The worker path forwards to the room's writer via `send_events` (`:1774-1805`), returning the persisted event id (`:1807`). The storage implementation is in `synapse/storage/databases/main/events.py` (the `_persist_events_and_state_updates` transaction path, including event/state insertion and stream bookkeeping). Client synchronization is implemented under `synapse/rest/client/sync.py`; receipt handling is separate under `synapse/rest/client/receipts.py`.

Relevant tests present in the pinned tree include `tests/handlers/test_message.py`, `tests/handlers/test_sync.py`, `tests/handlers/test_receipts.py`, `tests/storage/test_events.py`, `tests/storage/test_receipts.py`, and replication tests such as `tests/replication/tcp/streams/test_events.py` and `tests/replication/tcp/streams/test_receipts.py`.

**Verified in code/test inventory:** event persistence is a distinct writer path; batched persistence has all-or-drop error semantics in the handler docstring; sync and read receipts have separate endpoints/modules; targeted storage/replication tests exist.

**Inference / unverified:** this source inspection does not prove behavior under a database commit failure, worker crash at each phase, or duplicate client submission. Those require executing targeted tests/fault injection.

### Tinode

`server/topic.go:1116-1206` performs permission checks, assigns `SeqId: t.lastID + 1`, calls `store.Messages.Save`, increments `t.lastID` only after successful save, sends an accepted control response with the sequence (`:1167-1171`), then invokes plugin notification, broadcasts to sessions and sends push (`:1197-1205`). Save failure returns an error response and does not broadcast (`:1141-1153`). Read and receive sequence semantics are separate in `:1288-1356`; offline/history retrieval is handled by `replyGetData` around `:2885-2905`.

**Verified in code:** authorization precedes persistence; persistence precedes acceptance/broadcast; monotonic topic sequence is assigned in the saved record; read and receive receipts are distinct state transitions.

**Inference / unverified:** no inspected path proves idempotent handling of a retried client message with the same client id, nor atomic coupling of database save and push delivery.

### ejabberd

`src/mod_offline.erl:195-227` stores offline messages through the configured backend, enforcing a per-user limit where configured. `:614-656` pops stored messages on presence transition and routes each non-expired message after privacy checks. `:1076-1091` delegates storage and updates an ETS count cache only after backend success. Stream-management recovery is in `src/mod_stream_mgmt.erl:622-705`: unacknowledged stanzas are resent, or routed to offline storage/error handling according to configuration; resumed sessions also reroute late queued packets (`:610-620`).

The test module `test/offline_tests.erl:37-48` defines offline feature/identity/error cases, and `:145-178` defines master/slave persistence and fetch/delete/purge cases.

**Verified in code/test inventory:** durable offline spool abstraction; expiry/privacy checks before routing; explicit unacknowledged-stanza resend path; offline tests cover fetch/delete and multi-node cases.

**Inference / unverified:** duplicate user-visible delivery after resend is protocol/client dependent; this review did not establish deduplication keyed by message id.

## Failure matrix

| Scenario | OpenIM | Synapse | Tinode | ejabberd |
|---|---|---|---|---|
| DB write fails | **Verified in code:** cache/Mongo errors are logged/returned in inspected handlers. Exact broker disposition is **Inference / unverified**. | **Verified in code:** persistence path raises on failure; batch is documented all-or-drop. | **Verified in code:** `Save` error returns before acceptance/broadcast. | **Verified in code:** offline backend error is returned by `store_message_in_db`. |
| Broker publish fails after DB write | **Inference / unverified:** downstream MQ calls log errors; no atomic outbox proof. | **Inference / unverified:** replication/send failure behavior requires targeted execution. | Not a brokered path in inspected code; push failure semantics **Inference / unverified**. | Router/process failure handling outside inspected path; **Inference / unverified**. |
| Cache write fails | **Verified in code:** cache insertion error logs and returns before later steps. Replay depends on MQ semantics (**Inference**). | Not applicable to the inspected canonical event path; cache behavior **Inference / unverified**. | Not applicable to core save path. | ETS count cache updates only after backend success (**Verified**). |
| Consumer crashes before/after ack/commit | **Inference / unverified:** commit is in `OnComplete`; crash timing/replay not tested. | Worker/replication tests exist, but crash injection not run (**Inference**). | Topic process crash recovery not established. | Stream queue/resume code is **Verified**; crash scenario not executed. |
| Duplicate event delivery | No direct dedup proof (**Inference / unverified**). | Event ids and persistence checks exist; duplicate submission behavior not executed. | No client-id dedup proof in inspected path. | Resend is explicit; duplicate suppression is not shown. |
| Timeout with unknown client outcome | Requires client retry/reconciliation experiment (**Inference / unverified**). | Event id returned after persistence; timeout semantics not established. | Accepted control response follows save; client timeout retry semantics not shown. | Stream management can resend unacked stanzas (**Verified**). |
| Reconnect after offline period | Sequence-range pull is **Verified in code**. | `/sync` and stream replication paths exist; execution not run. | `get.data` history retrieval is present; execution not run. | Offline pop/reroute is **Verified in code**. |
| Two concurrent messages in one conversation | Sharded keying is **Verified in code**; ordering guarantees need a concurrency test. | Room writer/shard routing is **Verified**; load/concurrency test not run. | Single topic `lastID` mutation is visible; race behavior needs test. | Ordering across routed stanzas is **Inference / unverified**. |
| Partial push/cache/history side effects | OpenIM visibly separates cache, Mongo MQ and push; partial completion is possible (**Verified/inference**). | Push/action workers are separate; exact compensation not reviewed. | Broadcast/push follow save, so storage can succeed while downstream delivery fails (**Verified in code**). | Offline spool and stream queue are separate mechanisms (**Verified**). |
| Storage/broker unavailable during restart | Recovery behavior not proven for OpenIM. | Replication/restart tests exist but were not run. | Restart/reload behavior not proven. | Resume/offline paths are implemented; outage matrix not executed. |

## Jetson relevance

The evidence addresses `CORE-003`/`CORE-004` concerns around direct/group message persistence, ordering, delivery and reconnect retrieval, plus the cross-cutting reliability requirements for durable state transitions, retries, duplicate control, crash recovery and privacy-safe observability. None of the projects supplies verified evidence for Jetson campaign consent, suppression, analytics truth, subscription lifecycle or included-AI requirements; those remain outside this task.

## Patterns worth learning

1. Make persistence and sequence assignment explicit before online fan-out (Tinode; Synapse).
2. Separate durable history, online delivery and offline retrieval, with visible lifecycle states (all four, in different forms).
3. Use stream/sequence cursors for reconnect and distinguish received/read acknowledgements (OpenIM, Tinode, ejabberd, Matrix receipts).
4. Treat broker/cache/push failures as independent failure domains and record them separately; OpenIM makes this separation especially visible.
5. Exercise recovery with targeted fault injection instead of inferring guarantees from happy-path source.

Patterns to avoid copying without evidence: assuming a consumer commit equals end-to-end delivery, treating push success as durable message success, claiming exactly-once behavior from sequence numbers alone, or conflating transport acknowledgements with read receipts.

## Prioritized follow-up experiments

1. Build a common direct-message harness covering duplicate client retries, concurrent sends, reconnect gaps and crash at each persistence/publication boundary.
2. For OpenIM, fault-inject Redis, Mongo, MQ publish and consumer termination; record redelivery, commit and duplicate outcomes.
3. For Synapse, run targeted persistence, sync, receipt and replication tests with database/worker failure injection.
4. For Tinode, test concurrent `saveAndBroadcastMessage`, client retry identity, restart recovery and push failure after save.
5. For ejabberd, test stream resume with lost acknowledgements, offline spool failure, multi-node failover and duplicate user-visible delivery.
6. Convert measured semantics into Jetson acceptance tests for `CORE-003/004` and reliability gates before any implementation choice.

## Tests actually run and report status

No upstream test suite, integration test, load test, fault-injection test or Android E2E test was run. The report is based on static source and test inventory inspection only. The report is complete for the bounded research assignment, with runtime behavior and several failure dispositions intentionally left as **Inference / unverified**.

## Changed files

- `docs/research/AGENT_REPORT_MESSAGE_RELIABILITY.md` (this report)
- No application code, product requirements, business-plan text or research index entry was changed.
