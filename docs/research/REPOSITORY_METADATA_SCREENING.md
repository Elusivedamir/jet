# Repository metadata snapshot — first screening set

**Snapshot date:** 2026-11-23 (GitHub API `pushed_at` values).  
**Important:** stars and activity are discovery signals, not product quality or suitability scores. `NOASSERTION` means the GitHub API did not return a normalized SPDX license identifier; it does not mean the repository has no license. All licenses must be checked against the actual repository files and any commercial/edition restrictions before reuse.

| Repository | Stars | API license field | Last pushed (UTC date) | First-pass classification |
|---|---:|---|---|---|
| [element-hq/element-web](https://github.com/element-hq/element-web) | 13,674 | AGPL-3.0 | 2026-11-23 | Active; Matrix web/desktop client |
| [element-hq/element-android](https://github.com/element-hq/element-android) | 3,744 | AGPL-3.0 | 2026-09-25 | Active; classic Android client, README says security updates only |
| [element-hq/element-x-android](https://github.com/element-hq/element-x-android) | 2,521 | AGPL-3.0 | 2026-11-23 | Active; next-generation Android client |
| [matrix-org/matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) | 2,202 | Apache-2.0 | 2026-11-23 | Active; Matrix JS/TS client SDK |
| [processone/ejabberd](https://github.com/processone/ejabberd) | 6,754 | NOASSERTION | 2026-11-23 | Active; XMPP/MQTT/SIP server; license requires manual verification |
| [tinode/chat](https://github.com/tinode/chat) | 13,579 | GPL-3.0 | 2026-11-22 | Active; full-stack IM server and clients |
| [OpenIMSDK/Open-IM-Server](https://github.com/OpenIMSDK/Open-IM-Server) | 16,781 | Apache-2.0 | 2026-11-17 | Active; IM server |
| [OpenIMSDK/Open-IM-SDK-Web](https://github.com/OpenIMSDK/Open-IM-SDK-Web) | 116 | AGPL-3.0 | 2025-04-23 | README says no longer maintained; exclude from current SDK shortlist |
| [mattermost/mattermost](https://github.com/mattermost/mattermost) | 39,690 | NOASSERTION | 2026-11-23 | Active; open-core team collaboration; license needs manual review |
| [zulip/zulip](https://github.com/zulip/zulip) | 26,290 | Apache-2.0 | 2026-11-23 | Active; team chat with topic threading |
| [RocketChat/Rocket.Chat](https://github.com/RocketChat/Rocket.Chat) | 46,523 | NOASSERTION | 2026-11-23 | Active; org/customer communications; license/edition boundary needs review |
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | 40,424 | NOASSERTION | 2026-11-23 | Active; customer support/live-chat; license/edition boundary needs review |
| [nextcloud/spreed](https://github.com/nextcloud/spreed) | 2,229 | AGPL-3.0 | 2026-11-23 | Active; Nextcloud Talk app |
| [wireapp/wire-server](https://github.com/wireapp/wire-server) | 2,785 | AGPL-3.0 | 2026-11-23 | Active; Wire backend services |
| [signalapp/Signal-Server](https://github.com/signalapp/Signal-Server) | 10,801 | AGPL-3.0 | 2026-11-20 | Active; Signal server |
| [mautrix/go](https://github.com/mautrix/go) | 672 | MPL-2.0 | 2026-11-23 | Active; Matrix framework/library, not a full messenger |
| [42wim/matterbridge](https://github.com/42wim/matterbridge) | 7,623 | Apache-2.0 | 2024-12-12 | Not recently pushed; bridge between messaging protocols |
| [livekit/livekit](https://github.com/livekit/livekit) | 22,352 | Apache-2.0 | 2026-11-23 | Active; WebRTC SFU/media infrastructure |
| [novuhq/novu](https://github.com/novuhq/novu) | 40,416 | NOASSERTION | 2026-11-23 | Active; notification infrastructure, not chat transport |
| [erlang/otp](https://github.com/erlang/otp) | 12,365 | Apache-2.0 | 2026-11-23 | Active; general runtime/platform, not messenger product |

## Screening decisions

- Keep full-stack messenger/server candidates for deeper review: Tinode, OpenIM Server, Signal Server, Wire Server, ejabberd, Matrix/Synapse ecosystem.
- Review clients and SDKs separately: Element X Android, Element Web, Matrix JS SDK.
- Study product/UX and operational practices as adjacent categories: Mattermost, Zulip, Rocket.Chat, Chatwoot, Nextcloud Talk.
- Treat specialized infrastructure as separate capability studies: LiveKit (media), Novu (notifications), Matterbridge (bridges), mautrix-go (protocol SDK/bridging), Erlang/OTP (runtime patterns).
- Exclude OpenIM's legacy Web SDK from current implementation candidates because its README explicitly states it is no longer maintained. Keep it as a lifecycle/deprecation case study.
- No stack, protocol or architecture is selected by this screening.

## Next verification pass

For the deeper shortlist, inspect actual license files, latest releases/tags, commit cadence over 12 months, contributor concentration, CI required checks, tests, security policy and advisories, installation path, production dependencies, backup/restore, scaling/HA, push, E2EE protocol and key lifecycle, multi-device sync, media/file handling, anti-abuse, migration path and issue response. Capture exact source links and commit/tag references for each conclusion.
