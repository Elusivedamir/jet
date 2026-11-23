# Jetson Android PoC

This is an isolated Android integration proof of concept, not the Jetson Messenger MVP.

## Toolchain

- JDK 17
- Gradle 8.7
- Android Gradle Plugin 8.6.1
- Android SDK Platform 35 / Build Tools 35.0.0
- JuggleIM Android SDK 1.9.0

The project deliberately has no machine-specific `org.gradle.java.home` path and no signing credentials. Debug builds use the standard Android debug key.

## Build without connecting to an IM server

From this directory:

```bash
gradle --no-daemon :app:assembleDebug
gradle --no-daemon :app:testDebugUnitTest
```

The default AppKey and WSS endpoint are empty. The app does not initialize a network session in this state.

## Configure a test IM application

Use a dedicated test application and TLS-protected WSS endpoint. AppKey is a public application identifier; it is not a substitute for server-side credentials.

```bash
gradle --no-daemon \
  -PjuggleAppKey=YOUR_TEST_APP_KEY \
  -PjuggleWssUrl=wss://YOUR_TEST_IM_HOST \
  :app:assembleDebug
```

Install the resulting APK, obtain a short-lived test user token from a trusted test backend/admin workflow, enter it into the password-style token field, and tap **Подключить JuggleIM**. The screen reports the SDK connection state and local message-database callbacks.

The token is entered at runtime, cleared from the input immediately after being passed to the SDK, and is not written to preferences or logs by this PoC. Use test-only tokens. Do not place user tokens, `app_secret`, `app_secure_key`, admin credentials, or reusable demo tokens in Gradle properties committed to Git, source files, APK resources, screenshots, or CI logs.

## Current integration boundary

Implemented:
- JuggleIM SDK 1.9.0 dependency and guarded SDK initialization.
- Runtime test-token entry and invocation of the real SDK `connect(token)` API.
- Connection-state listener (connected, connecting, disconnected, failure).
- Explicit disconnect action.
- WSS-only endpoint validation.
- Unit tests for runtime configuration.
- CI build, unit tests, and debug APK artifact upload.
- Separate manual Android emulator install/launch smoke test.

Not implemented:
- Jetson account registration/login or backend-issued IM-token endpoint.
- Production token lifecycle, refresh/revocation, logout coordination, or account binding.
- Conversation list, send/receive UI, history, attachments, offline sync, multi-device, push, release signing, or production deployment.

A successful emulator launch proves only that the APK installs and its activity starts. A successful SDK connection requires a reachable JuggleIM server, matching AppKey, and valid token. A successful SDK connection alone does not prove Jetson authentication or end-to-end messaging.
