# Popularity and independent repository ratings — research track

**Snapshot date:** 2026-11-23  
**Purpose:** ensure highly visible projects and projects with independent health/quality ratings are not missed. Popularity and ratings are discovery signals, not proof of product fit, security, or engineering quality.

## 1. How this track works

Every candidate is evaluated on separate axes. Do not collapse them into one popularity score.

1. **Popularity:** GitHub stars, forks, watchers, growth over 30/90/365 days where available.
2. **Independent repository health rating:** score, grade, methodology, snapshot date and exact repository revision, where a credible third-party rating exists.
3. **Upstream health:** last push, releases, contributor distribution, PR response/merge behavior, issue backlog, security advisories and archived status.
4. **Engineering evidence:** tests, CI, reproducible builds, deployment documentation, architecture, fault handling and security design.
5. **Product relevance:** compare only after the canonical business-plan PDF has been extracted and reconciled page by page.

A GitHub star is a bookmark/attention signal, not a user rating or quality certification. GitHub does not assign an official repository quality score. External scores are not interchangeable: one may measure documentation/CI hygiene, another maintenance, and another community popularity.

## 2. Independent rating sources and their limitations

| Source | What it says it measures | Use in this research | Limitation |
|---|---|---|---|
| [RepoGrade](https://www.repo-grade.com/faq) | Deterministic 13-check, 0–100 rubric across documentation, engineering and project health; letter grades A–F | Secondary reproducible checklist for README/install docs, license, tests, CI, reproducibility, issue templates, linting and housekeeping | Not a security audit, architecture review, threat model or proof of runtime quality; scan can be stale |
| [TrustOSS](https://www.trustoss.org/) | 0–100 score across activity (25%), maintenance (25%), community (20%), documentation (15%) and maturity (15%); includes a claimed star-authenticity audit | Potential popularity/maintenance cross-check | Community score includes stars/forks/contributors, so it partly reuses popularity; not independent of stars |
| [RepoHealth](https://repohealth.tools/) | Repository hygiene and maintenance signals, snapshot at pinned commit | Additional snapshot where benchmark coverage exists | Its own description says score is not source-code or overall project quality; current benchmark list does not cover most messenger candidates |
| [OpenSaurus](https://opensaurus.org/category/team-chat/) | Publishes team-chat health scores and license/open-core classification | Discovery lead; use only where a per-project evidence page and scoring methodology can be verified | Category page is an aggregator; scores are not accepted as final without method, date and evidence review |
| [ToolVitals](https://toolvitals.com/blog/top-50-team-chat-tools-2026-10/) | Composite team-chat, health and shipping scores | Cross-check only | Vendor/category ranking; not a substitute for source inspection |

Important: a score of 97 from a team-chat directory is not equivalent to a RepoGrade 97 or TrustOSS 97. Record the publisher, formula, measured dimensions, date and commit beside every score. Never compare scores across providers as if they shared one scale.

## 3. High-star candidates — GitHub API snapshot

Counts below were read from GitHub repository metadata on 2026-11-23. They are a snapshot, not permanent values. Forks and watchers are included as context; open issue count is not a quality score.

| Repository | Stars | Forks | Last push (UTC) | License field | Research role |
|---|---:|---:|---|---|---|
| [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) | 46,523 | 14,147 | 2026-11-23 | NOASSERTION | Full collaboration/messaging platform; inspect edition boundaries and license notices |
| [Mattermost](https://github.com/mattermost/mattermost) | 39,690 | 9,129 | 2026-11-23 | NOASSERTION | Team collaboration; inspect open-core boundaries |
| [Zulip](https://github.com/zulip/zulip) | 26,290 | 10,654 | 2026-11-23 | Apache-2.0 | Team chat, topics/threading, self-hosting |
| [SimpleX Chat](https://github.com/simplex-chat/simplex-chat) | 19,757 | 1,326 | 2026-11-23 | AGPL-3.0 | Privacy/E2EE architecture and identifierless addressing |
| [OpenIM Server](https://github.com/OpenIMSDK/Open-IM-Server) | 16,781 | 2,977 | 2026-11-17 | Apache-2.0 | Dedicated IM backend |
| [Tinode](https://github.com/tinode/chat) | 13,579 | 2,099 | 2026-11-22 | GPL-3.0 | Full-stack IM server/client reference |
| [Element Web](https://github.com/element-hq/element-web) | 13,674 | 2,846 | 2026-11-23 | AGPL-3.0 | Mature web client and Matrix ecosystem |
| [Signal Android](https://github.com/signalapp/Signal-Android) | 29,688 | 6,955 | 2026-11-23 | AGPL-3.0 | Production client architecture, local storage, crypto integration |
| [Signal Server](https://github.com/signalapp/Signal-Server) | 10,801 | 2,510 | 2026-11-20 | AGPL-3.0 | Signal backend and service tests |
| [Telegram Desktop](https://github.com/telegramdesktop/tdesktop) | 33,662 | 7,701 | 2026-11-23 | GPL-3.0 | Large production desktop client; not a backend template |
| [bitchat](https://github.com/permissionlesstech/bitchat) | 37,199 | 5,893 | 2026-11-11 | Unlicense | Bluetooth mesh/offline communication; niche network topology |
| [ntfy](https://github.com/binwiederhier/ntfy) | 35,717 | 1,740 | 2026-11-23 | Apache-2.0 | Push/notification delivery component, not a full messenger |
| [Centrifugo](https://github.com/centrifugal/centrifugo) | 11,025 | 758 | 2026-11-23 | Apache-2.0 | Real-time pub/sub and WebSocket delivery infrastructure |
| [Gotify](https://github.com/gotify/server) | 16,228 | 903 | 2026-11-23 | NOASSERTION | Self-hosted push notification server |
| [Fluxer](https://github.com/fluxerapp/fluxer) | 10,966 | 873 | 2026-11-23 | AGPL-3.0 | Newer Discord-like community/chat platform; inspect maturity and operating cost |
| [Mumble](https://github.com/mumble-voip/mumble) | 8,434 | 1,431 | 2026-11-23 | NOASSERTION | Mature low-latency voice communications, adjacent rather than direct messenger |
| [Discourse](https://github.com/discourse/discourse) | 48,107 | 9,059 | 2026-11-23 | GPL-2.0 | Community/forum discussions; adjacent product, not direct IM |
| [Novu](https://github.com/novuhq/novu) | 40,416 | 4,568 | 2026-11-23 | NOASSERTION | Notification infrastructure, adjacent component rather than messenger |

License field NOASSERTION means GitHub did not normalize a license identifier. It does not prove that no license exists. Inspect the actual root LICENSE, per-directory notices, third-party code and paid-edition boundaries.

## 4. Public third-party ratings found during discovery

These are **reported by the named rating publishers**, not our own audit:

| Candidate | Reported rating | Publisher / context | Status |
|---|---:|---|---|
| Zulip | 93/100 | OpenSaurus team-chat health score | Lead only; independently verify methodology and exact project page |
| Synapse | 90/100 | OpenSaurus team-chat health score | Lead only; independently verify methodology and exact project page |
| Mumble | 85/100 | OpenSaurus team-chat health score | Lead only; adjacent voice product |
| Element | 97 | ToolVitals Oct 2026 composite | Category-ranking signal only |
| Mattermost | 97 | ToolVitals Oct 2026 composite | Category-ranking signal only |
| Rocket.Chat | 97 | ToolVitals Oct 2026 composite | Category-ranking signal only |
| Zulip | 96 | ToolVitals Oct 2026 composite | Category-ranking signal only |

No RepoGrade or TrustOSS numeric score is asserted here for the listed messenger projects: a provider rubric exists, but an exact, current per-repository result was not verified during this pass. Do not invent missing ratings or infer them from a category leaderboard.

## 5. Prioritised next review queue

Priority is for research depth, not an endorsement or adoption decision.

### Tier A — full messenger / collaboration products
- Rocket.Chat
- Mattermost
- Zulip
- SimpleX Chat
- Fluxer
- Element (web + Android X)
- Signal (Android + Server)
- Telegram Desktop (client reference only)
- OpenIM
- Tinode

### Tier B — important specialist systems
- bitchat — offline/mesh topology and constrained connectivity
- ejabberd — mature XMPP server
- Centrifugo — realtime transport/pub-sub
- ntfy and Gotify — notification/push patterns
- Mumble — voice latency and real-time media
- Discourse — community conversation model

### Tier C — adjacent platforms to inspect only where the business plan requires them
- Novu — notification workflows
- LiveKit — real-time media infrastructure
- Matrix protocol SDKs and homeserver ecosystem
- RabbitMQ / NATS / Kafka / Pulsar — messaging infrastructure, not end-user messengers

## 6. How we will produce our own rating

After the business-plan PDF is verified, each candidate gets an evidence-based report. Product fit is assessed separately and cannot be inferred before the PDF is reconciled.

| Dimension | Weight | Evidence required |
|---|---:|---|
| Reliability and message correctness | 20% | ordering, idempotency, durable writes, retries, offline delivery, failure tests |
| Security engineering | 20% | threat model, E2EE scope, key lifecycle, session security, advisories, secure defaults |
| Maintenance and release health | 15% | releases, commit cadence, PR response, contributor concentration, security patching |
| Testing and reproducibility | 15% | unit/integration/E2E/load/fault tests, CI, reproducible build and migrations |
| Operations and total cost | 15% | deployment dependencies, RAM/CPU/storage/bandwidth, backup/restore, observability, HA |
| Documentation and developer experience | 10% | setup, architecture, API/SDK docs, examples, upgrade path |
| License and reuse constraints | 5% | actual license files, commercial terms, third-party notices, open-core boundaries |

**Separate gates, not points:** a disqualifying license conflict, unacceptable security design, abandoned upstream or irreproducible critical dependency cannot be compensated for by stars or a high average score. Product fit is a separate gate against business-plan requirement IDs.

## 7. Rules

- Keep a high-star candidate even if it is not a direct product match; tag it as client, backend, protocol, notification, voice, community or infrastructure.
- Record the exact date and repository revision for every count or grade.
- Track star growth and contributor/release health; do not use absolute stars alone.
- Inspect at least one real implementation path and its tests before assigning an engineering score.
- Third-party scores are evidence inputs, never verdicts.
- No stack, protocol, vendor, framework or codebase is selected by this document.
