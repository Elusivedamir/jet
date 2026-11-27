# Jetson Messenger — Independent Source Check (2026-11-27)

**Purpose:** independently verify a small, decision-relevant subset of source references used by the architecture research reports. This is a bounded source-path check, not a full upstream audit, reproducible source snapshot, license clearance or runtime validation.

## Result summary

Five exact raw source paths at the pinned upstream revisions were retrieved successfully through GitHub. The inspected code supports the limited observations below. The repository still does not contain the referenced `upstream-sources/MANIFEST.txt` or the local source snapshot directory on either `research/architecture-synthesis-task` or `research/repository-landscape`; therefore the wider research snapshot set cannot be independently reproduced from Jet's branches.

## Source observations

### 1. Tinode — save, accept, then fan out

Pinned source: [server/topic.go at fd8801c](https://github.com/tinode/chat/blob/fd8801cdea3f2984008b0cdf38a253060515ce04/server/topic.go), function `Topic.saveAndBroadcastMessage`.

Observed sequence in the inspected function:
1. Check topic write permission.
2. Call `store.Messages.Save(...)`; on error, send an error response and return.
3. Advance the topic sequence.
4. If the request has a client message ID, send `NoErrAccepted` with the sequence.
5. Broadcast to sessions and invoke push handling.

**Supported conclusion:** in this code path, the message-store save call succeeds before the accepted response and online broadcast/push path. This does not establish a universal exactly-once delivery guarantee, retry idempotency, multi-device receipt semantics or the durability properties of every configured Tinode storage backend.

### 2. Synapse — explicit persistence boundary and room ordering

Pinned source: [synapse/handlers/message.py at 0c28723](https://github.com/element-hq/synapse/blob/0c287237cbb96814282f1bc207e5f6c4407fb8a0/synapse/handlers/message.py).

Observed:
- `handle_new_client_event` delegates persistence work to `_persist_events`.
- `_persist_events` invokes the storage controller's `persistence.persist_events(...)`.
- The handler uses a per-room `Linearizer(max_count=1)` around event creation to limit concurrent creation in one room.

**Supported conclusion:** persistence and room event ordering are explicit design boundaries in the inspected handler. This source inspection does not prove all replication, notification, federation or recovery guarantees, and no Synapse test suite was run.

### 3. OpenIM — distinct queue, push and stored-message handling

Pinned source: [internal/msgtransfer/online_history_msg_handler.go at a101d85](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/internal/msgtransfer/online_history_msg_handler.go).

Observed:
- The consumer's completion callback marks and commits the consumed batch.
- `handleMsg` calls `toPushTopic` for the non-storage message list.
- Stored messages are passed to `BatchInsertChat2Cache`; read-sequence state is updated separately.

**Supported conclusion:** this handler has distinct paths for non-storage push, stored-message cache/sequence handling and queue-batch commit. The inspected file alone does not establish one atomic transaction across queue acknowledgement, message persistence and recipient delivery. Avoid inferring such a guarantee from component names or architecture diagrams.

### 4. ejabberd — offline spool and limits

Pinned source: [src/mod_offline.erl at afe6393](https://github.com/processone/ejabberd/blob/afe6393701939f0baf45a1580a30a41bb91700bf/src/mod_offline.erl), function `store_offline_msg`.

Observed:
- Offline messages are stored through `store_message_in_db` when the configured MAM/offline path requires it.
- A configured per-user maximum is checked; the function returns `{error, full}` when the limit is reached.
- The module exposes offline message retrieval/resend integration.

**Supported conclusion:** ejabberd provides an explicit offline-message spool with configurable storage and capacity behavior. This is a protocol/product pattern reference, not evidence that Jetson should copy its schema or claim unlimited offline retention.

### 5. Listmonk — audience eligibility query

Pinned source: [queries/campaigns.sql at 47a24df](https://github.com/knadh/listmonk/blob/47a24dfe8a889b0c7fe8730b0bb7ac24ab571e87/queries/campaigns.sql).

Observed in campaign subscriber selection:
- Subscriber-list status is filtered by opt-in mode.
- Double-opt-in campaigns select confirmed subscribers for normal sends.
- Single-opt-in selection excludes unsubscribed entries.
- Subscribers with status `blocklisted` are excluded.

**Supported conclusion:** the inspected batch-selection query re-evaluates opt-in/unsubscribe/blocklist-related eligibility while selecting campaign recipients. It does not establish Jetson legal compliance, purpose-specific consent evidence, or that eligibility cannot change between selection and actual dispatch. Jetson still needs its own dispatch-time recheck and auditable consent ledger.

## Provenance status

| Item | Status |
|---|---|
| Five pinned raw source paths above | Retrieved and inspected on 2026-11-27 |
| Full upstream shallow snapshots | Not present in the two inspected Jet branches |
| `upstream-sources/MANIFEST.txt` | Not found; GitHub contents API returned 404 on both branches |
| Remaining report-cited source paths | Not independently checked in this pass |
| Upstream builds/tests/load/fault tests | Not run |
| Dependency/SBOM, nested license and asset review | Not completed |
| Security advisory and maintainer-response review | Not completed |
| Legal clearance for copying/reuse | Not completed |

The source references above may support architectural learning and test hypotheses. They do not authorize copying code or assets into Jetson. Before any reuse decision, restore a repository-accessible immutable source archive/manifest with exact commit SHAs and checksums, review all nested licenses and dependencies, and obtain the required legal/security assessment.

## Consequence for architecture decisions

- Tinode and Synapse provide source-level examples of a persistence boundary before downstream message handling.
- OpenIM demonstrates separated queue/push/cache paths but the inspected handler does not prove atomic coupling.
- ejabberd provides an offline spool pattern with explicit capacity limits.
- Listmonk demonstrates recipient eligibility filtering in campaign selection, but Jetson must still recheck current consent/suppression at dispatch.
- The modular-monolith recommendation remains provisional. No technology stack, service topology, protocol or upstream code reuse is approved by this source check.
