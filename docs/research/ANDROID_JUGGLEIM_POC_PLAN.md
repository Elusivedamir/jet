# Android JuggleIM proof of concept — execution plan

Date: 2026-11-23  
Status: [ПРЕДЛОЖЕНИЕ] technical validation plan; no APK build or runtime test has passed.

## Goal

Validate whether the official JuggleIM Android SDK can reliably provide the messaging transport for the first Jetson Android APK while Jetson Backend retains identity, authorization, consent, and all business rules.

This PoC is not the Jetson product MVP and must not introduce unapproved product features.

## Candidate SDK facts

- Official repository: https://github.com/juggleim/imsdk-android
- README currently documents dependency `com.juggle.im:juggle:1.9.0`.
- Maven repository: `https://repo.juggle.im/repository/maven-releases/`.
- Quick start initializes JIM with an AppKey and server URL, then connects using a server-issued user token.
- SDK README describes reconnect, conversations, send/receive, history, unread counts, text/media/custom messages, private/group/chatroom flows.
- Demo app in inspected source declares minSdk 24 and targetSdk 34; the core SDK module declares minSdk 19. JetIMKit declares minSdk 24. These are upstream sample/module settings, not a final Jetson device-support decision.
- Official README says JDK 17 and Android Studio are required to run its demo.
- Selected SDK LICENSE file is Apache 2.0, but transitive dependency and plugin licenses still require SBOM/license review.

## Proposed isolated project shape

Create a small Android application under a dedicated PoC path only after the canonical product prompt is restored and the required build environment is available.

- `app/`: minimal Android application and screens for test login / conversation / message.
- `core/auth/`: Jetson test-backend client; no JuggleIM app secret.
- `core/messaging/`: thin adapter around JuggleIM SDK; no product policy.
- `core/session/`: app lifecycle, token refresh and logout coordination.
- `test/`: unit tests for adapter mapping and session state.
- `androidTest/`: device/emulator integration tests.
- `docs/`: test evidence, SDK version, device/OS, logs with secrets removed.

Do not copy JuggleIM demo app credentials, public demo tokens, or plain `ws://` endpoint into Jetson.

## Trust boundaries

1. Jetson Backend authenticates the user and decides whether the account is active.
2. Jetson Backend maps Jetson user ID to a JuggleIM user ID.
3. Jetson Backend provisions/obtains a scoped, short-lived JuggleIM token.
4. Android client receives only its user token, public AppKey, and WSS endpoint.
5. JuggleIM app secrets, app secure keys, admin API credentials, and server API credentials remain server-side.
6. Jetson Backend remains authoritative for user permissions, blocks, channel membership policy, business entitlements, consent, and campaigns.

## PoC implementation steps

### P0 — environment and source pinning
- Install Android Studio, Android SDK/platform tools, JDK 17, and Gradle via the supported Android Gradle Plugin wrapper.
- Pin JuggleIM SDK version and all transitive dependencies.
- Create isolated test application/server/database; rotate every default credential.
- Configure HTTPS/WSS and test users A/B.
- Record hardware, OS/API level, SDK versions, build tools, and commit IDs.

### P1 — initialization and authentication
- Fetch a test user token from a Jetson-owned backend endpoint.
- Initialize SDK with non-secret AppKey and WSS server address.
- Connect and capture status transitions.
- Verify invalid, expired, revoked, and wrong-user tokens.
- Verify logout/disconnect and reconnect behavior.

### P2 — private messaging
- User A sends a text message to B.
- Verify local sending state, server ACK, delivery event, message ID and history.
- Verify B's reply reaches A.
- Verify no duplicate UI messages after reconnect/retry.

### P3 — offline and multi-device
- Put B offline, send from A, reconnect B and verify delivery/history.
- Sign in as same Jetson user on two devices and compare sync behavior.
- Test background/foreground and process restart.
- Verify token revocation closes or invalidates existing sessions as specified.

### P4 — security and abuse
- Attempt cross-user conversation/history/attachment access by changing target IDs.
- Attempt client-supplied role/admin flags.
- Attempt direct privileged JuggleIM Server API access from APK.
- Inspect APK strings/resources/config for secrets and demo credentials.
- Confirm no message body/token/PII appears in logs or crash reports.
- Verify server-side rate limits and block/mute policy.

### P5 — failure and performance
- Toggle airplane mode, packet loss, slow network, DNS failure, server restart.
- Measure connection time, send-to-ACK latency, delivery latency, reconnect time, duplicate/loss rate.
- Run a controlled concurrency test only after basic correctness; record device/server specs and exact workload.
- Do not extrapolate production capacity from the upstream smoke benchmark.

## Acceptance criteria

| ID | Given / When | Then |
|---|---|---|
| A1 | Given a valid Jetson session, when user opens messenger | Backend issues a scoped IM token and SDK connects |
| A2 | Given user A and B, when A sends a private message | B receives it and server ACK/message ID is recorded |
| A3 | Given B is offline, when A sends and B reconnects | Message becomes available according to retention policy |
| A4 | Given two devices for one account, when a message is sent on either | Other device receives/synchronizes it without data leakage |
| A5 | Given an expired/revoked token, when client reconnects or reuses old session | Access is rejected; no protected data is returned |
| A6 | Given a modified user/conversation ID, when client requests another user's data | Backend/server rejects unauthorized access |
| A7 | Given APK inspection, when strings/resources/config are scanned | No server secret, admin credential, or reusable demo token exists |
| A8 | Given network loss and recovery | App reports state and recovers without silent loss or unintended duplicates |

## Current execution blockers

Environment inspection on 2026-11-23 found:
- Java: available.
- Git: available (2.47.3).
- Flutter: not found.
- Dart: not found.
- Android adb/platform tools: not found.
- Gradle: not found.
- Docker: not found.

Therefore this environment cannot currently compile, install, or execute the Android PoC. No APK exists and no runtime acceptance test is marked passed.

## Exit report required

At completion, record:
- APK artifact checksum and build variant.
- Git commit and SDK/dependency versions.
- Emulator/physical device model and Android API.
- Test case result with logs/evidence.
- Build/test commands and CI result.
- Security scan and dependency/license report.
- Known failures, limitations, and residual risks.

## Current decision

[НЕ СОГЛАСОВАНО] JuggleIM is not selected for production.  
[НЕ ПРОВЕРЕНО] Runtime behavior and performance of the Android SDK in Jetson integration.  
[ПРЕДЛОЖЕНИЕ] Execute this PoC before committing the first APK implementation to a production stack.
