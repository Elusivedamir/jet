# Jetson Android PoC

This is an isolated build-validation app, not the Jetson Messenger MVP.

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

## Optional SDK initialization

The AppKey is a public application identifier, not a server secret. Supply only a test AppKey and a TLS-protected WSS endpoint:

```bash
gradle --no-daemon \
  -PjuggleAppKey=YOUR_TEST_APP_KEY \
  -PjuggleWssUrl=wss://YOUR_TEST_IM_HOST \
  :app:assembleDebug
```

Do not place user tokens, `app_secret`, `app_secure_key`, admin credentials, or reusable demo tokens in Gradle properties committed to Git, source files, or APK resources. The eventual user token must be issued to the authenticated client by the Jetson Backend at runtime.

## CI workflows

- `.github/workflows/android-poc.yml` runs on pushes and pull requests. It performs the Gradle debug build, unit tests, APK verification, and uploads the APK artifact. This is the required, repeatable CI gate.
- `.github/workflows/android-emulator-smoke.yml` is a separate manual workflow (`workflow_dispatch`). Run it from GitHub Actions when an emulator install/launch smoke test is needed. Emulator boot instability cannot block the required build/unit-test gate.

## Current scope

- Minimal Android shell.
- Guarded JuggleIM SDK initialization.
- WSS-only endpoint validation.
- Unit tests for runtime configuration.
- CI build, unit tests, and debug APK artifact upload.
- Separate manual Android emulator install/launch smoke test.

Not implemented: Jetson account login, backend token issuance, actual IM session, conversation UI, messaging, offline sync, multi-device, push, or release signing.

A green build proves only that the project compiles and packages. It does not prove server compatibility, runtime correctness, or production security. The manual emulator smoke test proves only that the APK can be installed and the activity launched in that emulator environment; it does not prove live JuggleIM connectivity.
