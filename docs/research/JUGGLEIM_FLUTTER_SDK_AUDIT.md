# JuggleIM Flutter SDK — static audit

Date: 2026-11-23  
Repository: https://github.com/juggleim/imsdk-flutter  
Inspected commit: `7e9d6f28b613063d742f5280025a54f78cf20940`  
Status: [ВЫВОД] source inspection only; no Flutter build or device/runtime tests executed.

## Executive result

[ВЫВОД] The inspected Flutter plugin is **not a four-platform JuggleIM client SDK**. Its `pubspec.yaml` declares Flutter plugin implementations for Android and iOS only. There are no declared implementations for Web or Windows. Flutter itself supports those targets, but that does not add a JuggleIM transport implementation for them.

Therefore Flutter cannot currently serve as a single JuggleIM client implementation for Android, Web, Windows, and iOS based on this plugin. It remains a possible shared UI option for Android+iOS only, if a runtime PoC proves feature parity and maintenance quality. Web and Windows would still need separate JuggleIM Web/Electron integrations or custom bridges.

## Repository evidence

### Package metadata

File: `juggle_im/pubspec.yaml`

- Package name: `juggle_im`
- Package version: `0.0.73`
- Dart constraint: `^3.7.2`
- Flutter constraint: `>=3.3.0`
- Declared plugin platforms:
  - Android: `JuggleImPlugin`
  - iOS: `JuggleImPlugin`
- No `web:` or `windows:` platform implementation is declared.

This is the decisive blocker for treating the existing plugin as a cross-platform JuggleIM SDK.

### Android native bridge

Files:
- `juggle_im/android/src/main/java/com/juggle/im/juggle_im/JuggleImPlugin.java`
- `juggle_im/android/src/main/java/com/juggle/im/juggle_im/JuggleIMFlutterWrapper.java` (wrapper inspected through repository search and source references)
- `juggle_im/android/build.gradle`

Findings:
- Flutter communicates with native Android through a MethodChannel named `juggle_im`.
- The plugin registers a native video platform view.
- Android plugin build uses compileSdk 35 and minSdk 21.
- Its Gradle dependencies pin `com.juggle.im:juggle:1.8.39`, `com.juggle.call.zego:juggle:1.8.25`, and `com.juggle.ultimate:juggle:1.8.19.1`.

### iOS native bridge

Files:
- `juggle_im/ios/Classes/JuggleImPlugin.m`
- `juggle_im/ios/Classes/JuggleIMFlutterWrapper.m`
- `juggle_im/ios/juggle_im.podspec`

Findings:
- Flutter communicates with native iOS through a MethodChannel also named `juggle_im`.
- The plugin registers a native video platform view.
- Podspec declares iOS 12.0 minimum.
- Podspec pins JuggleIM 1.9.0, JZegoCall 1.8.25, and JuggleUlt 1.8.19.3.

### Version drift

The inspected Flutter plugin pins different JuggleIM core versions on its two platforms:
- Android: 1.8.39
- iOS: 1.9.0

It also pins different JuggleUlt versions:
- Android: 1.8.19.1
- iOS: 1.8.19.3

This creates a platform parity/reproducibility concern. It is not proof of a bug, but requires vendor clarification and compatibility testing before adoption.

### Example and packaging maturity

- Package README is still the generic Flutter plugin template ("A new Flutter plugin project") rather than maintained integration documentation.
- The example app contains a runnable integration flow and exercises connection, conversations, message send/receive, history, and many additional methods.
- Example source contains hard-coded demonstration AppKey/token values and a non-TLS `ws://` endpoint. These must never be copied into Jetson. Treat all such example credentials as untrusted/demo-only and never use them for production.
- Package LICENSE is the generic MIT license text naming Tom Gilder, while native JuggleIM dependencies have their own licenses. This creates a provenance/licensing question for the wrapper repository: confirm the rights/ownership of the Flutter bridge code and review the exact dependency licenses/SBOM before commercial use. Do not assume the wrapper license automatically grants rights to the underlying native SDKs.

## Feature/API surface observed

The Dart wrapper exposes a substantial API surface, including:
- SDK initialization, server list, connect/disconnect, connection status/listeners.
- Conversation list, conversation settings, drafts, unread counts.
- Send/resend messages, media messages, message history/search/delete/recall.
- Read receipts, reactions, favorites, group/user/friend information.
- Moments/social feed.
- Call/session and video-view functions.

The iOS wrapper source dispatches many corresponding method names to native JuggleIM. This indicates more than a minimal proof-of-concept wrapper, but source presence alone does not establish parity, correctness, thread-safety, lifecycle safety, or production readiness. A complete Android/iOS method-by-method parity audit and runtime tests remain necessary.

## Decision impact

| Target | Flutter UI framework | JuggleIM bridge evidence | Conclusion |
|---|---|---|---|
| Android | Supported by Flutter | Plugin declares Android native implementation | Candidate; runtime test required |
| iOS | Supported by Flutter | Plugin declares iOS native implementation | Candidate; runtime test required |
| Web | Supported by Flutter | No Web implementation declared | Not supported by this plugin |
| Windows | Supported by Flutter | No Windows implementation declared | Not supported by this plugin |

Flutter official platform support is not equivalent to JuggleIM plugin support.

## Recommended architecture impact

[ПРЕДЛОЖЕНИЕ] Do not select Flutter as the single UI/client stack for all four Jetson platforms based on the inspected plugin.

Keep the earlier native-SDK-first route as the lowest-integration-risk candidate:
- Android: native Kotlin + official JuggleIM Android SDK.
- Web: TypeScript + official JuggleIM Web SDK.
- Windows: Electron reusing the Web client, after desktop security review.
- iOS: Swift + official JuggleIM iOS SDK.
- Shared Jetson Backend and versioned API contracts remain authoritative across clients.

A separate Flutter Android+iOS prototype may still be worth comparing against native apps if reducing mobile UI duplication has enough value. It would not remove the need for Web and Windows clients.

## Android APK PoC — next executable gate

### Environment gate

The current execution environment has Java and Git, but does not expose Flutter, Dart, Android SDK/adb, Gradle, or Docker commands. Therefore an APK cannot be built or installed in this environment at this point. No build or runtime test is claimed.

Required environment:
- Android Studio / Android SDK and platform tools.
- JDK compatible with selected Gradle/Android Gradle Plugin.
- Flutter SDK only if the Flutter-vs-native mobile spike is retained.
- Android emulator or physical test device.
- Isolated JuggleIM server and test database.
- Jetson-owned backend test environment issuing short-lived user IM tokens.

### Minimum test sequence

1. Build clean sample app from pinned SDK versions.
2. Obtain token only from test backend; verify no app secret or privileged JuggleIM API is present in APK/assets.
3. Initialize SDK against isolated test server over TLS.
4. Connect and record connection lifecycle events.
5. Send a private text message from test user A to test user B.
6. Verify ACK/sent state and delivery to B.
7. Receive while B is backgrounded/offline; reconnect and verify offline sync.
8. Fetch history and verify pagination/order.
9. Log out/revoke session and test that old token/connection cannot continue accessing data.
10. Repeat on a second device/session for the same account.
11. Capture logs without tokens, message bodies, or PII; record SDK versions, OS, device, timestamps, error rates, and results.

### Acceptance criteria

- Build completes reproducibly from a clean checkout with pinned dependencies.
- No secrets or demo tokens in source, resources, APK, logs, or crash reports.
- User A cannot read or mutate user B's conversations by changing IDs.
- Sent message is acknowledged and delivered once under normal network conditions.
- Offline message is available after reconnect within the configured retention policy.
- Session revocation prevents subsequent authorized operations.
- All failures and unverified cases are reported; no pass is inferred from static source inspection.

## Open issues

- Confirm Flutter plugin repository ownership/provenance and licensing.
- Confirm why Android and iOS JuggleIM dependency versions differ.
- Audit Dart/Android/iOS method parity, event callback behavior, threading, plugin detach/reinitialization, and native view lifecycle.
- Review Android/iOS native dependency SBOM and licenses.
- Run actual builds and device tests before choosing Flutter or JuggleIM for production.

## Sources

- Flutter plugin repository: https://github.com/juggleim/imsdk-flutter
- Flutter package metadata: https://github.com/juggleim/imsdk-flutter/blob/7e9d6f28b613063d742f5280025a54f78cf20940/juggle_im/pubspec.yaml
- Flutter Android implementation: https://github.com/juggleim/imsdk-flutter/tree/7e9d6f28b613063d742f5280025a54f78cf20940/juggle_im/android
- Flutter iOS implementation: https://github.com/juggleim/imsdk-flutter/tree/7e9d6f28b613063d742f5280025a54f78cf20940/juggle_im/ios
- JuggleIM Android SDK: https://github.com/juggleim/imsdk-android
- JuggleIM iOS SDK: https://github.com/juggleim/imsdk-ios
- Flutter supported platforms: https://docs.flutter.dev/reference/supported-platforms
