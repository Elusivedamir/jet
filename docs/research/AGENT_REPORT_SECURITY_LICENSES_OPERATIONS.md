# Security, licensing and operations diligence

**Review date:** 2026-11-23
**Scope:** bounded source review of the eight pinned repositories below. This is repository diligence, not a security audit, legal opinion, operational deployment, or stack selection.

## Method and evidence limits

Reviewed the local shallow source snapshots listed in `upstream-sources/MANIFEST.txt`; each checkout's `HEAD` matched its manifest SHA. Links below are GitHub permalinks at that revision. Repository files establish what is present in that tree. Documentation statements are attributed to project documentation, not treated as independently reproduced. No upstream test suite was run. No network access was attempted. Consequently external CVE/advisory history, live issue and PR queues, independent health ratings, release/tag history beyond checked-in evidence, and current hosted security-program terms remain unverified.

Evidence labels: **Code/test evidence** means source or tests exist at the pinned revision; **Documentation claim** means project-authored text; **Inference** means an operational or product implication derived from those observations.

## Revisions and reviewed paths

| Project | Pinned commit | Main inspected paths (all links pin the SHA) |
|---|---|---|
| SimpleX Chat | `2aed5f082c95a3c9eaeb14308aa03b852e484809` | [LICENSE](https://github.com/simplex-chat/simplex-chat/blob/2aed5f082c95a3c9eaeb14308aa03b852e484809/LICENSE), [docs/SECURITY.md](https://github.com/simplex-chat/simplex-chat/blob/2aed5f082c95a3c9eaeb14308aa03b852e484809/docs/SECURITY.md), [tests](https://github.com/simplex-chat/simplex-chat/tree/2aed5f082c95a3c9eaeb14308aa03b852e484809/tests), [scripts/ci](https://github.com/simplex-chat/simplex-chat/tree/2aed5f082c95a3c9eaeb14308aa03b852e484809/scripts/ci) |
| Zulip | `a7af4399c1943eb4778789de95f09f6d14911e94` | [LICENSE](https://github.com/zulip/zulip/blob/a7af4399c1943eb4778789de95f09f6d14911e94/LICENSE), [SECURITY.md](https://github.com/zulip/zulip/blob/a7af4399c1943eb4778789de95f09f6d14911e94/SECURITY.md), [release lifecycle](https://github.com/zulip/zulip/blob/a7af4399c1943eb4778789de95f09f6d14911e94/docs/overview/release-lifecycle.md), [backup command](https://github.com/zulip/zulip/blob/a7af4399c1943eb4778789de95f09f6d14911e94/zerver/management/commands/backup.py), [tests](https://github.com/zulip/zulip/tree/a7af4399c1943eb4778789de95f09f6d14911e94/zerver/tests) |
| Mattermost | `4a38cfa4164d01db704464b62f0ee516f5f3a933` | [LICENSE.txt](https://github.com/mattermost/mattermost/blob/4a38cfa4164d01db704464b62f0ee516f5f3a933/LICENSE.txt), [server/enterprise/LICENSE](https://github.com/mattermost/mattermost/blob/4a38cfa4164d01db704464b62f0ee516f5f3a933/server/enterprise/LICENSE), [SECURITY.md](https://github.com/mattermost/mattermost/blob/4a38cfa4164d01db704464b62f0ee516f5f3a933/SECURITY.md), [backup and disaster recovery docs](https://github.com/mattermost/mattermost/tree/4a38cfa4164d01db704464b62f0ee516f5f3a933/docs/main/deployment-guide), [server tests](https://github.com/mattermost/mattermost/tree/4a38cfa4164d01db704464b62f0ee516f5f3a933/server) |
| Rocket.Chat | `77df90cdbcc2e37be2febe5ff668273564b0d543` | [LICENSE](https://github.com/RocketChat/Rocket.Chat/blob/77df90cdbcc2e37be2febe5ff668273564b0d543/LICENSE), [apps/meteor/ee/LICENSE](https://github.com/RocketChat/Rocket.Chat/blob/77df90cdbcc2e37be2febe5ff668273564b0d543/apps/meteor/ee/LICENSE), [SECURITY.md](https://github.com/RocketChat/Rocket.Chat/blob/77df90cdbcc2e37be2febe5ff668273564b0d543/SECURITY.md), [apps/meteor/tests](https://github.com/RocketChat/Rocket.Chat/tree/77df90cdbcc2e37be2febe5ff668273564b0d543/apps/meteor/tests) |
| Signal Server | `398888f224289f2e52baa78e2df285ae179eaad0` | [LICENSE](https://github.com/signalapp/Signal-Server/blob/398888f224289f2e52baa78e2df285ae179eaad0/LICENSE), [pom.xml](https://github.com/signalapp/Signal-Server/blob/398888f224289f2e52baa78e2df285ae179eaad0/pom.xml), [integration tests](https://github.com/signalapp/Signal-Server/tree/398888f224289f2e52baa78e2df285ae179eaad0/integration-tests) |
| Fluxer | `1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d` | [LICENSE](https://github.com/fluxerapp/fluxer/blob/1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d/LICENSE), [.github/SECURITY.md](https://github.com/fluxerapp/fluxer/blob/1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d/.github/SECURITY.md), [deploy](https://github.com/fluxerapp/fluxer/tree/1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d/deploy), [backup/restore implementation](https://github.com/fluxerapp/fluxer/tree/1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d/fluxer_rexctl/internal/backup), [gateway tests](https://github.com/fluxerapp/fluxer/tree/1e9cd7c9b6ef5b39ac73ef5ce78c40531370b37d/fluxer_gateway/test) |
| OpenIM Server | `a101d85ec16cc21bec60005169725adc1ae5649a` | [LICENSE](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/LICENSE), [docker-compose.yml](https://github.com/OpenIMSDK/Open-IM-Server/blob/a101d85ec16cc21bec60005169725adc1ae5649a/docker-compose.yml), [deployments](https://github.com/OpenIMSDK/Open-IM-Server/tree/a101d85ec16cc21bec60005169725adc1ae5649a/deployments), [test](https://github.com/OpenIMSDK/Open-IM-Server/tree/a101d85ec16cc21bec60005169725adc1ae5649a/test) |
| Tinode | `fd8801cdea3f2984008b0cdf38a253060515ce04` | [LICENSE](https://github.com/tinode/chat/blob/fd8801cdea3f2984008b0cdf38a253060515ce04/LICENSE), [SECURITY.md](https://github.com/tinode/chat/blob/fd8801cdea3f2984008b0cdf38a253060515ce04/SECURITY.md), [docker](https://github.com/tinode/chat/tree/fd8801cdea3f2984008b0cdf38a253060515ce04/docker), [monitoring](https://github.com/tinode/chat/tree/fd8801cdea3f2984008b0cdf38a253060515ce04/monitoring), [server tests](https://github.com/tinode/chat/tree/fd8801cdea3f2984008b0cdf38a253060515ce04/server) |

## License boundary matrix

This is a first-pass boundary inventory, not a dependency-level legal clearance. Root license text is not sufficient to clear all assets, bundled dependencies, generated output, or commercial/enterprise editions.

| Project | Root/source boundary evidence | Assets, dependencies, editions and generated artifacts |
|---|---|---|
| SimpleX | Root `LICENSE` is AGPL-3.0. | Repository includes separate package license files, e.g. `packages/simplex-chat-python/LICENSE` and TypeScript package licenses; `docs/dependencies/licences/` contains vendored dependency license texts. Audit each package, app store artifact and asset provenance before reuse. |
| Zulip | Root `LICENSE` is Apache-2.0. | Root `NOTICE`, `web/third/marked/LICENSE`, `confirmation/LICENSE.txt`; generated release bundles and third-party assets need separate notices/provenance review. No legal conclusion inferred from root license. |
| Mattermost | `LICENSE.txt` describes a mixed model: platform source AGPLv3 with stated exceptions/commercial licensing; admin/config paths Apache-2.0; compiled Mattermost-produced versions MIT license. | `server/enterprise/LICENSE` identifies a separate enterprise boundary; `server/public/LICENSE.txt`, `webapp/channels/LICENSE.txt`, `NOTICE.txt`, plugin/source-available docs and generated compiled binaries are separate evidence. Obtain counsel review for the exact files and distribution/SaaS model. |
| Rocket.Chat | Root `LICENSE` provides repository-level terms. | `apps/meteor/ee/LICENSE` separately covers EE; `packages/livechat/LICENSE` and `packages/apps-engine/src/definition/LICENSE` are nested boundaries; package assets and generated builds require inventory. |
| Signal Server | Root `LICENSE` is AGPL-3.0. | Maven dependencies and deployment artifacts are not all licensed by root file; inspect `pom.xml` and generated/container contents using a license/SBOM process before reuse. |
| Fluxer | Root `LICENSE` is AGPL-3.0. | Nested `fluxer_desktop/LICENSE`, `fluxer_static/emoji/LICENSE` and NOTICE, font licenses/notices, embedded `libwebp`/zstd and other dependency licenses demonstrate mixed asset/dependency terms. Binary packaging needs artifact-level inventory. |
| OpenIM Server | Root `LICENSE` is Apache-2.0. | Logo directories have their own license files; scripts/templates also contain license files. Go module and generated/container contents need SBOM and provenance checks. |
| Tinode | Root `LICENSE` is GPL-3.0. | `chatbot/LICENSE`, `py_grpc/LICENSE`, `monitoring/LICENSE`, `tn-cli/LICENSE`, and `loadtest/LICENSE` are nested boundaries. Product, auxiliary tools and bundled assets need separate review. |

## Security policy and advisory evidence

| Project | Repository policy / channel evidence | Advisory and response evidence from this run |
|---|---|---|
| SimpleX | `docs/SECURITY.md` requests private encrypted email disclosure; states threat-model exclusions and links project-authored prior assessment summaries. | Policy exists. CVE/advisory corpus and response timelines not independently checked; linked audit claims not independently validated here. |
| Zulip | `SECURITY.md` directs private email/HackerOne reporting and describes response and security release process; release lifecycle says CVEs are used for security releases. | Process documentation exists; actual advisory history and response time not checked against an external database. |
| Mattermost | `SECURITY.md` establishes private vulnerability reporting. | Policy exists; advisory history and response evidence not checked externally. |
| Rocket.Chat | `SECURITY.md` establishes a security reporting process. | Policy exists; external advisory and response record unknown. |
| Signal Server | No root `SECURITY.md` appeared in the inspected source file inventory. | Repository-only policy evidence unavailable; this does not establish absence of an organization-wide channel. Advisories not checked externally. |
| Fluxer | `.github/SECURITY.md` points to a hosted security page and email channel, and identifies hosted page as authoritative. | Repository channel exists; hosted program details and advisory record not fetched. |
| OpenIM Server | No root `SECURITY.md` found in checked-in path inventory. | Repository-only disclosure policy and advisory evidence unknown. |
| Tinode | `SECURITY.md` names `security@tinode.co` and lists excluded report classes. | Policy exists; exclusions and response history need independent review; advisories not checked externally. |

## Maintenance, release, tests and reproducibility

Snapshot last-commit dates are activity observations, not release cadence. The pinned Zulip commit metadata is dated 2026-11-24, one day after this review date; it is reported as a manifest-snapshot property and cannot support an assertion about review-time current activity. The other snapshot commit dates are SimpleX 2026-11-21; Mattermost 2026-11-23; Rocket.Chat 2026-11-23; Signal Server 2026-11-20; Fluxer 2026-11-23; OpenIM 2026-11-10; Tinode 2026-11-22. Git history is shallow; tags, maintainer concentration, contributor counts and unresolved issue/PR queues are unknown. A single snapshot cannot demonstrate cadence or maintainer resilience.

**Code/test evidence:** test trees or representative test files are present for SimpleX (`tests/`), Zulip (`zerver/tests/`), Mattermost (`server/` and `e2e-tests/`), Rocket.Chat (`apps/meteor/tests/`), Signal Server (`integration-tests/`), Fluxer (`fluxer_gateway/test/`), OpenIM (`test/`) and Tinode (`server/*_test.go`). Presence proves neither suite completeness nor reproducibility. CI workflows/build definitions exist in several snapshots, but this review did not run any test or build. Runtime/toolchain, external services, fixtures and secrets required to reproduce suites were not validated.

Third-party repository health scores: **none reported**. Provider pages, individual project assessments, dates and methodologies were unavailable under the no-network constraint.

## Operational dependency matrix

This summarizes visible repository deployment evidence; exact production topology, support burden and failure behavior require deployment testing.

| Project | Evidence and operational implications |
|---|---|
| SimpleX | Large multi-client/server repository and relay compose assets. **Inference:** operational sizing spans client ecosystems and messaging relays; snapshot did not establish a complete first-party backup/restore and upgrade runbook. Validate server state, queue retention, relay topology, monitoring and recovery. |
| Zulip | Release lifecycle documents stable and maintenance releases; backup/restore and schema migration tooling/docs are checked in. **Inference:** deployment depends on a maintained integrated application stack and upgrade discipline. Validate restore on isolated copy and supported upgrade path. |
| Mattermost | Deployment, backup/disaster recovery and migration documentation are present; product has distinct enterprise/source licensing. **Inference:** edition capability and licensing affect operations. Validate database/files backup consistency, migration duration, edition feature boundary and telemetry/support requirements. |
| Rocket.Chat | Compose and CI deployment files and migration code exist; EE directory is separately licensed. **Inference:** service topology and edition boundaries add upgrade/configuration work. Validate backup consistency, migrations, extension compatibility and rollback behavior. |
| Signal Server | Maven multi-module service, websocket resources and integration test modules are present. **Inference:** this is a server component rather than a complete turnkey messenger platform; surrounding clients, storage, push, deployment and operational controls must be separately evaluated. |
| Fluxer | `deploy/`, `fluxer_rexctl` backup/restore and release code, and compose stack files are present. **Inference:** more operations tooling is checked in, but recovery and upgrade correctness still require exercising it against realistic state. |
| OpenIM | Docker Compose, deployment directory, configs, build tooling and Go release config are present. **Inference:** multi-service deployment requires dependency health, config/secrets management and coordinated upgrades; test restore/migration and observability on the actual topology. |
| Tinode | Docker, monitoring and loadtest directories are present. **Inference:** deployment/runbook components are available, but scale, backup/restore and upgrade guarantees need reproducible execution. |

## Benchmark and throughput claim audit

No generic throughput figure is accepted as comparable evidence. Tinode contains a `loadtest/` harness; Fluxer contains a test named `request_load_test`; Mattermost contains backing-storage benchmark documentation. These are harness/documentation presence, not results. The inspected evidence did not establish, for all reported claims, a common workload, date, hardware, topology, tuning, latency/error distribution, data durability criteria, or independent reproduction. Product/vendor performance claims therefore remain unverified here.

For a comparable future experiment, record commit and build flags; workload mix (direct/group messages, fanout, attachments, online connections, CRM/campaign operations); arrival pattern and duration; users/devices and geographic/network distribution; hardware/cloud instance types; database/queue/cache topology and tuning; warmup; p50/p95/p99 latency, errors, drops and recovery; durability/backup checks; and raw scripts/results. Separate vendor claims from independently run measurements.

## Cost-driver worksheet (no prices)

Build a monthly model with explicit unit assumptions and low/base/high scenarios. Do not fill unit prices until a deployment design and provider quotes exist.

| Driver | Required workload inputs | Candidate measured quantities
|---|---|
| Messages and storage | active users, messages/user/day, average retained payload, retention, replication/index overhead | database bytes, IOPS, CPU, egress |
| Attachments | attachments/user/day, size distribution, retention, download rate, deduplication | object bytes, requests, egress, scanning/transcoding |
| Connections, fanout and push | concurrent devices, presence churn, group size, messages to online/offline users, push rate | connection capacity, gateway CPU/memory, queue operations, push provider cost |
| Queues | peak and average event rate, retention, retry/redelivery rate | broker throughput, retained bytes, partitions/replicas |
| CRM and campaigns | business tenants, contacts/tenant, segment sizes, campaign frequency, consent/suppression lookup rate | indexed rows, audience job CPU, queue volume, sends and reports |
| Analytics | events/message and campaign, event retention, query frequency, dashboard concurrency | ingest, retained bytes, scan/query compute |
| AI | requests/user and tenant, input/output token distributions, model latency/retry rates | input/output tokens, provider requests, moderation and caching |
| Backups, monitoring and operations | RPO/RTO, backup frequency/retention, telemetry volume/cardinality, support coverage | backup bytes/restore compute, metrics/logs/traces, on-call and support hours |

Worksheet columns should include scenario, input, unit, measured value, source/date, formula, unit price source/date, monthly subtotal, uncertainty and owner. Run sensitivity analysis on retention, attachment egress, campaign peaks, AI token use and redundancy.

## Non-compensable gates

These are diligence gates for considering reuse/adaptation, not a stack score. A **Fail** means the evidence currently fails the stated gate; **Unknown** means insufficient evidence. Passing one gate cannot compensate for failure or uncertainty in another.

| Gate | SimpleX | Zulip | Mattermost | Rocket.Chat | Signal Server | Fluxer | OpenIM | Tinode |
|---|---|---|---|---|---|---|---|---|---|
| Exact component and asset license boundary cleared | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |
| Security disclosure route and advisory history independently checked | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |
| Reproducible build/test evidence produced in this review | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |
| Restore and upgrade rehearsed against representative data | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |
| Product fit and data portability demonstrated against Jetson journeys | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |
| Comparable, independently reproduced capacity evidence | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown |

## Jetson implications and next checks

1. Treat license clearance as component-, asset-, dependency- and distribution-specific. AGPL/GPL and mixed commercial/enterprise boundaries require counsel review for the intended hosted and client distribution model; no repository is cleared by this report.
2. Require private disclosure channels, a response process, advisory monitoring and a documented vulnerability intake/triage plan for any production dependency. Repository policy alone does not prove response performance.
3. Before relying on a candidate operational pattern, reproduce its build/tests and rehearse upgrade, backup and restore with representative encrypted/user/business data. Preserve privacy and consent/suppression invariants during campaigns and exports.
4. Evaluate data export and migration using explicit user, conversation, media, consent, CRM, campaign and analytics records. This snapshot review did not verify a complete migration path for any candidate; lock-in remains a risk to test.
5. Measure messaging, campaign and analytics workloads separately and together. A messaging benchmark does not validate campaign burst handling or analytics cost. Keep capacity goals as hypotheses until tests establish them.
6. Independently check current advisories/CVEs, maintainers, releases, issue/PR backlog, governance and any claimed third-party grades when network research becomes available.

## Completion and checks

**Report status: complete for the bounded local-snapshot research assignment, with explicit evidence gaps.** All eight manifest revisions were confirmed against local checkout `HEAD`. Inspected source paths are linked above. No upstream tests/builds were run; no report-specific automated tests apply. This review did not inspect every dependency/asset file or independently query external advisory, release, issue, PR, benchmark or scoring services. Remaining risks are identified in the gates and next checks; this report does not select or endorse a technology.
