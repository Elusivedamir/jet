# Agent report 03 — security, licensing, maintenance and operating-cost evidence

**Review date:** 2026-11-23

Network access to GitHub was unavailable (Could not resolve host), so current upstream HEADs could not be fetched. Exact revisions are included only where prior repository-local research records a full SHA. This is diligence research, not a security audit, legal opinion, benchmark or production recommendation.

## Revision and license matrix

**Permalink basis:** repository-local deep-dive evidence links the OpenIM handler to commit `8af585ce33b1ca9661bfda1abd00e5277d46e944` and Tinode mapper/database evidence to commits `0a06b29288f92cd203b13d7573bf835a3e6cdda0`, `0629545528263194c3bed2734d92564056810cc6` and `55529789da1da352ff6919370350ca36205a1ca0`; see [`DEEP_DIVE_MESSAGE_DELIVERY_02.md`](DEEP_DIVE_MESSAGE_DELIVERY_02.md#1-openim-server--queued-transfer-batching-and-acknowledgements) and its Tinode section. These are exact blob revisions, not asserted current HEADs.

| Project | Revision evidence | License evidence | Gate |
|---|---|---|---|
| SimpleX Chat | Unknown; no local pinned SHA | Unknown; no local license tree | Unknown |
| Zulip | Unknown; no local pinned SHA | Prior metadata says Apache-2.0; files not rechecked | Unknown |
| Mattermost | Unknown; no local pinned SHA | Metadata NOASSERTION; edition boundaries unresolved | Unknown |
| Rocket.Chat | Unknown; no local pinned SHA | Metadata NOASSERTION; edition boundaries unresolved | Unknown |
| Signal Server | Current SHA unknown; prior snapshot dated 2026-11-20 | Prior research records AGPLv3 | Unknown |
| Fluxer | Unknown; no local pinned SHA | Unknown; no local license tree | Unknown |
| OpenIM Server | 8af585ce33b1ca9661bfda1abd00e5277d46e944 (internal/msgtransfer/online_history_msg_handler.go) | Prior research inspected root Apache-2.0 LICENSE | Unknown |
| Tinode | 0a06b29288f92cd203b13d7573bf835a3e6cdda0; 0629545528263194c3bed2734d92564056810cc6; 55529789da1da352ff6919370350ca36205a1ca1 | Prior research records root GPL-3.0 | Unknown |

OpenIM and Tinode source evidence is documented in DEEP_DIVE_MESSAGE_DELIVERY_02.md. Full legal reuse requires a release-pinned tree, SPDX inventory and generated-binary provenance.

## Security, maintenance and operations

Inspected local evidence paths include `docs/research/DEEP_DIVE_MESSAGE_DELIVERY_02.md` (OpenIM `internal/msgtransfer/online_history_msg_handler.go`; Tinode `server/db/mysql/adapter.go`, `server/db/postgres/adapter.go` and mapper call flow) and `docs/research/DEEP_DIVE_BACKEND_COMPARISON_01.md` (deployment, security and release notes). No local checkout of the eight upstream trees was present, so nested enterprise/edition license files and live advisory pages could not be independently enumerated.

No local policy/advisory evidence was available for SimpleX, Zulip, Mattermost, Rocket.Chat or Fluxer. Signal policy response was not independently rechecked. Prior research records OpenIM CodeQL and credential-rotation guidance, but inspected handlers log downstream failures while acknowledging batches; crash and replay tests are mandatory. Tinode SECURITY.md was previously reviewed and its weak TLS 1.0 allowance is an explicit anti-pattern.

Prior research records OpenIM dependencies MongoDB, Redis, Kafka, MinIO and Etcd, with API, gateway, transfer, push, cron and RPC processes. Tinode has multiple adapters and separate TopicUpdateOnMessage and MessageSave calls; uniqueness does not prove atomicity. Signal documents mvnw verify, service/integration tests and a FoundationDB dependency. For the remaining projects, deployment, backup/restore, migration, observability, contributor concentration, issue health and release cadence are Unknown in this run.

No benchmark or throughput claim is accepted: no workload, hardware, date, methodology or independent reproduction is available locally.

## Cost model and Jetson implications

Future estimates must measure active users, messages and fanout, online connections and push, attachment bytes/retention, campaign audience and queue throughput, CRM rows, analytics events, AI requests/tokens, backups, replicas, monitoring, egress, support and on-call. No prices are invented.

No candidate passes the non-compensable gates because license provenance, reproducible critical behavior and operational controls remain incomplete. OpenIM and Tinode are learning references; Signal is a test/integration reference. Tinode weak TLS and OpenIM error propagation are explicit risks. Zulip, Mattermost and Rocket.Chat are adjacent operations references.

Next checks: obtain offline mirrors or network access; pin a full commit for all eight; enumerate nested licenses/notices; inspect advisories and response history; run documented tests; exercise crash, duplicate, retry and backup/restore paths; and record measured workloads.

## Files and tests

Changed file: docs/research/AGENT_REPORT_SECURITY_LICENSES_OPERATIONS.md. No application code or product requirements changed. Tests run: none. Report status: incomplete for live upstream verification; complete for evidence available in this checkout.
