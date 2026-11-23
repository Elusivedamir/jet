# Initial repository screening — evidence from project READMEs

**Date:** 2026-11-23  
**Scope:** First-pass README inspection of selected repositories. This is not a source-code, security, performance, licensing or operational audit. Statements below describe only what the inspected README says. No project is selected as a foundation.

## Candidate comparison

| Repository | README-stated role | Potential learning area | Important caveat / next verification |
|---|---|---|---|
| [Element Web](https://github.com/element-hq/element-web) | Matrix web/desktop client using Matrix JS SDK | Client architecture, protocol SDK boundary, web/desktop support, release/quality signals | Matrix-specific; inspect current supported client features, encryption lifecycle, mobile parity and license |
| [Element Android Classic](https://github.com/element-hq/element-android) | Previous-generation Matrix Android client; README says security updates continue but no new features; recommends Element X | Migration strategy, legacy-client maintenance, security-only support | Not the recommended new Android client; inspect Element X separately |
| [Element X Android](https://github.com/element-hq/element-x-android) | Next-generation Matrix Android client | Modern mobile architecture, Android UX, test/quality gates | Client only; inspect SDK/protocol dependencies and feature parity |
| [Matrix JS SDK](https://github.com/matrix-org/matrix-js-sdk) | Matrix client-server SDK for JavaScript/TypeScript, browser and Node.js | SDK boundaries, event/state model, E2EE integration, tests | SDK, not a complete messenger; inspect supported API/spec versions |
| [ejabberd](https://github.com/processone/ejabberd) | XMPP server project; README surfaces tags, packages, containers, CI and documentation | Long-running server operations, federation, protocol implementation, packaging | Verify current XEP support, modules, license, cluster model and real-world resource profile |
| [Tinode](https://github.com/tinode/chat) | Full-stack instant messaging: server, Android/iOS/web clients and multiple client APIs; README calls it beta-quality | End-to-end product surface, API design, client/server split, push and sync | README explicitly calls it beta-quality; verify current maintenance, security and feature gaps |
| [OpenIM Server](https://github.com/OpenIMSDK/Open-IM-Server) | Instant-messaging server; README advertises Apache-2.0, Go, CI/coverage and best-practices links | Dedicated IM backend, multi-client SDK ecosystem, operations and observability | Verify actual license file, current release activity, security advisories, deployment complexity and client SDK state |
| [OpenIM Web SDK (legacy)](https://github.com/OpenIMSDK/Open-IM-SDK-Web) | README explicitly says project is no longer maintained and may have unpatched vulnerabilities | Deprecation policy, SDK compatibility and migration handling | Exclude as an implementation candidate; retain only as a maintenance/deprecation case study |
| [Mattermost](https://github.com/mattermost/mattermost) | Open-core self-hosted collaboration platform; README describes chat, workflows, calls, screen sharing and AI | Product breadth, self-hosting, operational model, collaboration UX | Team collaboration is not identical to consumer messenger; verify edition/licensing boundaries |
| [Zulip](https://github.com/zulip/zulip) | Open-source team chat with topic-based threading and asynchronous conversation model | Information architecture, threading, notification controls, mature contribution practices | Different interaction model and target market; study UX and product decisions, not copy wholesale |
| [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) | Open-source communications platform for organizations, customers and citizens | Multi-tenant/workspace model, deployment options, customer-facing communication | Verify open-source vs commercial edition feature boundaries, current license and self-host requirements |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | Open-source customer-support platform / Intercom and Zendesk alternative | Business inbox, agent workflows, customer identity, CRM/support features | Adjacent business product, not a core personal messenger; inspect commercial restrictions and data model |
| [Nextcloud Talk](https://github.com/nextcloud/spreed) | Nextcloud app for audio/video conferencing with text chat, file sharing, federated chats and integrations | Federation, file-sharing integration, calls, ecosystem integration | Depends on Nextcloud ecosystem; inspect standalone deployability and boundaries |
| [Wire Server](https://github.com/wireapp/wire-server) | Server source for Wire; README lists separate services for accounts, conversations/teams, push, WebSocket notifications, assets and SSO | Service decomposition, push architecture, security-oriented deployment | README says federation is on long-term roadmap; inspect license/third-party notices and deployment footprint |
| [Signal Server](https://github.com/signalapp/Signal-Server) | Server build/test instructions require FoundationDB client library; README links protocol documentation and security contact | Secure messenger server, cryptographic protocol boundary, storage dependency | Not a turnkey drop-in; inspect protocol/client compatibility, deployment and operational requirements |
| [mautrix-go](https://github.com/mautrix/go) | Matrix framework with client API, appservice, E2EE, bridges and partial federation helpers | Protocol adapters, bridge architecture, SDK abstractions | Library, not a messenger backend; inspect license and API maturity |
| [Matterbridge](https://github.com/42wim/matterbridge) | Chat bridge connecting multiple protocols including Discord, IRC, Matrix, Mattermost, Slack, Telegram, WhatsApp, XMPP and Zulip | Connector isolation, message mapping, retries, protocol translation | Bridge product, not a secure core messenger; evaluate data leakage and weakest-link implications |
| [LiveKit](https://github.com/livekit/livekit) | WebRTC SFU for realtime audio, video and data | Calls, media routing, real-time infrastructure, client SDKs | Media infrastructure only; not a messaging system |
| [Novu](https://github.com/novuhq/novu) | Open-source multi-channel notification infrastructure with one API | Notification orchestration, templates, delivery retries, preferences | Notification platform, not chat transport; inspect current license/edition and channels |
| [Erlang/OTP](https://github.com/erlang/otp) | Runtime and libraries for highly available soft real-time systems | Fault tolerance, supervision, concurrency, process isolation | General runtime, not a product candidate; only a source of engineering patterns |

## Preliminary lessons (not architecture decisions)

1. A messenger is a collection of distinct problem areas: identity and accounts, conversation state, message delivery, client synchronization, media, push, calls, abuse controls, administration, business workflows and operations. A repository that solves one area must not be mistaken for a complete platform.
2. Product category matters. Consumer IM, team chat, customer-support inbox, notification infrastructure, bridges and media SFUs are adjacent but not interchangeable.
3. Client SDKs and servers must be audited separately. A mature server does not guarantee maintained mobile SDKs; OpenIM's legacy Web SDK README is a concrete warning.
4. README badges and claims are leads, not proof. Verify release history, code, test runs, advisories, license files and deployment steps.
5. Security claims require protocol-level review. A repository name or README statement is not evidence that end-to-end encryption is correctly implemented across backups, multi-device, key recovery, group membership and media.
6. No stack or architecture is selected from this sample.

## Follow-up source inspections

- [Element X Android](https://github.com/element-hq/element-x-android)
- [OpenIM Server](https://github.com/OpenIMSDK/Open-IM-Server)
- [Tinode](https://github.com/tinode/chat)
- [Wire Server](https://github.com/wireapp/wire-server)
- [Signal Server](https://github.com/signalapp/Signal-Server)
- [ejabberd](https://github.com/processone/ejabberd)
- [Zulip](https://github.com/zulip/zulip)
- [Mattermost](https://github.com/mattermost/mattermost)
- [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat)
- [Chatwoot](https://github.com/chatwoot/chatwoot)

