# Cross-platform client architecture research

Date: 2026-11-23  
Status: [ВЫВОД] comparative research; no production stack or vendor dependency approved.

## Owner-approved platform target

- Android APK first.
- Web, Windows, and iOS follow.
- One Jetson account and shared server-side product data across clients.
- Telegram Mini App excluded.
- External messenger integrations remain outside MVP.

## Executive conclusion

Do not force all four clients into one UI framework solely to claim a single codebase. The decisive integration constraint is the messaging SDK: JuggleIM currently documents distinct Android, iOS, and Web SDKs; its Web SDK explicitly supports browser and Electron-based desktop use. Static inspection of JuggleIM Flutter plugin commit 7e9d6f28b613063d742f5280025a54f78cf20940 now confirms that its pubspec declares Android and iOS implementations only; it does not declare Web or Windows implementations. It also pins different native JuggleIM versions on Android and iOS. See JUGGLEIM_FLUTTER_SDK_AUDIT.md. Flutter remains a possible Android+iOS UI option, not a single four-platform JuggleIM client.

Recommended architecture to validate first:

1. Android: native Kotlin client using the official JuggleIM Android SDK.
2. Web: TypeScript web client using the official JuggleIM Web SDK.
3. Windows: package/reuse the Web client in Electron, subject to desktop security and update testing; JuggleIM's Web SDK README explicitly says its API works in Electron.
4. iOS: native Swift client using the official JuggleIM iOS SDK.
5. All clients call the same Jetson Backend API for identity, profile, account settings, business entitlements, CRM, campaigns, consent, billing, and AI. The backend remains the authority for permissions and business rules.

This is a proposed integration route, not an approved technology decision. It deliberately shares server contracts and product rules rather than forcing UI code to be shared.

## Options compared

| Option | Android | Web | Windows | iOS | Main trade-off |
|---|---|---|---|---|---|
| Native clients + shared backend | Kotlin + native SDK | TypeScript + Web SDK | Electron reusing Web | Swift + native SDK | More client projects; lowest SDK mismatch risk based on documented SDKs |
| Flutter-first | Flutter + JuggleIM plugin | Flutter Web (no JuggleIM plugin implementation found) | Flutter Desktop (no JuggleIM plugin implementation found) | Flutter + JuggleIM plugin | Mobile UI reuse possible; separate Web/Windows IM integration still required; plugin version drift and license provenance need review |
| Kotlin Multiplatform / Compose | Kotlin | Compose Web/Wasm | Compose Desktop | Kotlin shared + iOS | Strong Kotlin reuse; official docs still label Compose Web as Beta, adding risk to a core web messenger |
| React Native + web + Windows | React Native | React/React Native Web | React Native Windows or Electron | React Native | Shared JS/TS expertise, but platform-specific integration and JuggleIM SDK support need verification |

## Evidence and constraints

### JuggleIM SDK fit

- JuggleIM's current ecosystem page lists Android, iOS, Web, React Native, Flutter, HarmonyOS, and desktop building blocks.
- The official Web SDK README states that the same API works in browsers and Electron-based desktop apps; it documents TypeScript types and a React/Vue demo.
- JuggleIM's public GitHub organization lists a Flutter SDK, but the Flutter repository's supported targets, API parity, release cadence, and Windows/Web compatibility have not yet been proven by this review.
- Existing static server audit remains valid: JuggleIM is not selected; security-sensitive runtime tests, channel semantics, token lifecycle, attachment authorization, capacity, and full dependency/license review remain open.

### Flutter

Flutter's official platform matrix supports Android, iOS, Windows, and modern browsers. However, the inspected JuggleIM Flutter plugin package (version 0.0.73, commit 7e9d6f28b613063d742f5280025a54f78cf20940) declares only Android and iOS plugin implementations. Its Android bridge pins JuggleIM 1.8.39, while its iOS podspec pins JuggleIM 1.9.0. Therefore the existing plugin cannot provide JuggleIM connectivity on Web or Windows without new native/web bridge work. Its README is still a generic template and its package license/provenance needs clarification. A Flutter Android+iOS spike can still be compared, but it does not yield one shared four-platform messaging client. See JUGGLEIM_FLUTTER_SDK_AUDIT.md.

### Kotlin Multiplatform / Compose

Kotlin Multiplatform can share domain logic and networking across platforms. Compose Multiplatform supports Android, iOS, and desktop as stable targets, while its Web/Wasm target is still documented as Beta. This is less attractive for a web-first-accessible messenger unless the web target matures or the Web UI is implemented separately.

### Electron

Electron allows the Web client and its JuggleIM Web SDK to be reused for Windows. This reduces duplicated UI and messaging integration, but adds desktop packaging, memory footprint, update signing, local storage, deep-link, notification, and OS-integration work. These are PoC/acceptance items, not assumed solved.

## Proposed responsibility boundaries

### Jetson Backend (authoritative)
- Jetson identity, registration, login, sessions, recovery.
- Mapping Jetson user IDs to messaging-provider IDs.
- Authorization, account status, blocks, business entitlements.
- Billing, trials, cancellation, refunds and payment-state verification.
- CRM, campaign eligibility, consent evidence, unsubscribe and suppression.
- KPI aggregation, AI orchestration, audit/security events.
- API contracts and versioning shared by every client.

### JuggleIM (candidate messaging transport)
- Realtime connections and message transport.
- Private/group messaging, ACK, history and offline synchronization, subject to PoC.
- Media, presence, push and multi-device behavior, subject to per-platform validation.
- No authority over Jetson Business subscription, promotional consent, payment state, or Jetson-level authorization.

### Clients
- Render platform-appropriate UX.
- Store only scoped user credentials/tokens.
- Never receive app_secret, app_secure_key, admin credentials, or privileged Server API access.
- Treat all client-supplied identifiers, role flags, payment state, and consent claims as untrusted.

## Decision matrix (qualitative, preliminary)

| Criterion | Native + shared backend | Flutter-first | KMP/Compose | React family |
|---|---|---|---|---|
| Android-first fit | High | High | High | High |
| Reuse of JuggleIM documented SDKs | High | Unverified | Medium/low | Medium; RN SDK needs audit |
| Web messenger fit | High | Needs UX PoC | Web target Beta | High |
| Windows reuse | Electron/Web reuse | Native Flutter desktop; SDK unverified | Compose Desktop | Electron or RN Windows |
| UI code reuse | Low/medium | High | High except web risk | High between web/RN with adaptation |
| Platform-native integration | High | Via plugins/platform channels | Via expect/actual/native interop | Via native modules |
| Main risk | More client-specific code | SDK feature/platform parity | Web maturity and SDK bridging | RN Windows and SDK compatibility |

Scores are qualitative judgments, not benchmark results.

## Proposed staged validation

### Stage A — Android APK foundation
- Build a minimal Kotlin APK shell.
- Integrate JuggleIM Android SDK in an isolated test app.
- Integrate Jetson Backend authentication without exposing JuggleIM server secrets.
- Validate login, reconnect, private messages, ACK, offline sync, multi-device, logout/revocation.
- Keep product UI and business rules behind Jetson-owned contracts.

### Stage B — Web proof
- Create a minimal TypeScript web client using JuggleIM Web SDK.
- Verify browser support, auth/token handoff, reconnect, history, uploads, read receipts, and multi-device consistency.
- Confirm the same Jetson account and server-side authorization model.

### Stage C — Windows proof
- Package the Web client in Electron.
- Validate secure IPC boundaries, context isolation, sandboxing, CSP, signed installer/updates, notifications, deep links, local cache and credential storage.
- Do not expose Node privileges to renderer content.

### Stage D — iOS proof
- Integrate official JuggleIM iOS SDK in a minimal Swift app.
- Validate push, background behavior, reconnect, media, permissions and App Store constraints.
- Reuse the same Jetson Backend API contracts.

### Parallel gate — compare Flutter
Flutter source inspection is complete enough to rule out the current plugin as a four-platform JuggleIM bridge. Optionally run a focused Android+iOS parity spike only if the mobile UI reuse benefit justifies maintaining a Flutter path alongside separate Web and Windows clients.

## Required acceptance tests

- Same account can sign in on Android, Web, Windows, and iOS.
- Private and group message history remains consistent across devices.
- Logout/revocation invalidates access as specified, including existing connections.
- User A cannot read or mutate User B's conversations, attachments, profile, CRM, or campaigns.
- Client cannot elevate role, forge subscription status, bypass consent, or call privileged JuggleIM APIs.
- Reconnect/offline delivery does not create silent message loss or unintended duplicates.
- Attachments are authorized server-side and cannot be fetched by changing object IDs.
- Push behavior is tested separately on Android and iOS.
- Electron renderer cannot access Node/system APIs outside an explicit, reviewed IPC surface.
- Web and desktop bundles contain no server secrets or privileged keys.

## Risks / unresolved questions

- JuggleIM Flutter SDK: Web/Windows plugin implementations are absent in the inspected package metadata; Android/iOS feature parity, dependency version alignment, package provenance/license, and runtime quality remain to be tested.
- JuggleIM Windows/Electron: validate current Web SDK compatibility and native OS integrations.
- JuggleIM channels: verify Jetson channel semantics; chatrooms are not automatically equivalent to broadcast channels.
- Server edition/scaling and all static-audit security findings remain open.
- iOS builds require macOS/Xcode; Windows desktop builds require Windows toolchain. CI runners must account for this.
- Web messenger performance, browser notifications, uploads, and large histories require measurement.
- Final framework choice depends on PoC results, target devices, developer capacity, and total maintenance cost.

## Recommendation

[ПРЕДЛОЖЕНИЕ] Proceed with a native-SDK-first integration spike: Kotlin + JuggleIM Android SDK for the first APK, TypeScript + JuggleIM Web SDK for the browser, Electron reusing the Web client for Windows, and Swift + JuggleIM iOS SDK later. In parallel, audit JuggleIM Flutter SDK and run a small parity spike. Keep Jetson Backend and API contracts independent of all clients.

[НЕ СОГЛАСОВАНО] No production stack, framework, JuggleIM dependency, hosting topology, or release commitment is approved by this research document.

## Sources

- Flutter supported platforms: https://docs.flutter.dev/reference/supported-platforms
- Flutter deployment: https://docs.flutter.dev/deployment
- Kotlin Multiplatform overview: https://kotlinlang.org/docs/multiplatform/kmp-overview.html
- Compose Multiplatform compatibility and target status: https://kotlinlang.org/docs/multiplatform/compose-compatibility-and-versioning.html
- Compose Multiplatform FAQ (Web/Wasm Beta status): https://kotlinlang.org/docs/multiplatform/faq.html
- JuggleIM ecosystem and platform SDK list: https://github.com/juggleim
- JuggleIM Web SDK (browser/Electron, TypeScript, React/Vue demo): https://github.com/juggleim/imsdk-web
- JuggleIM Flutter SDK: https://github.com/juggleim/imsdk-flutter
- JuggleIM server architecture: https://github.com/juggleim/im-server
