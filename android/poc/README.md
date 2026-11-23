# Jetson Android PoC

An isolated Android/JuggleIM integration proof of concept. This is not the Jetson Messenger MVP or a production deployment.

## Toolchain

- JDK 17
- Gradle 8.7
- Android Gradle Plugin 8.6.1
- Android SDK Platform 35 / Build Tools 35.0.0
- JuggleIM Android SDK 1.9.0

The project has no machine-specific JDK path and no signing credentials. Debug builds use the standard Android debug key. Product flavors `alice` and `bob` produce two separately installed debug clients for the private-message integration test.

## Offline/configuration-free build

From this directory:

```bash
gradle --no-daemon :app:assembleDebug
gradle --no-daemon :app:testDebugUnitTest
```

The default AppKey and WSS endpoint are empty. No IM network session is initialized in that state. Maven Central's Google-hosted mirror is listed before Maven Central to reduce CI exposure to transient 429 responses.

## Live two-client JuggleIM test

The complete isolated Docker Compose environment, token provisioning, local WSS certificate, emulator trust setup, and two-client send/receive verification are documented in [deploy/juggleim-poc/README.md](../../deploy/juggleim-poc/README.md).

CI workflow: [juggleim-e2e.yml](../../.github/workflows/juggleim-e2e.yml).

The E2E workflow provisions two synthetic server-side user tokens. The AppSecret and admin authorization remain outside the APK. In debug builds only, test tokens and message-test parameters may be injected through one-time Activity Intent extras; those extras are removed immediately and are not available in release builds.

## Implemented in the PoC

- JuggleIM SDK 1.9.0 dependency and guarded SDK initialization.
- WSS-only endpoint validation and runtime test-token connection.
- Connection-state and local message-database listeners.
- Explicit disconnect action.
- Debug-only Alice/Bob app variants.
- SDK private text-message send callback and message receive listener.
- CI build/unit tests and isolated server-backed Android end-to-end workflow.

## Not implemented

- Jetson account registration/login, password hashing, and backend authentication.
- Production token issuance, expiry/refresh/revocation, logout coordination, or account-to-IM identity mapping.
- Production authorization/ACL, conversations UI, history UI, attachments, offline/multi-device acceptance, push, release signing, or deployment.
- A production-ready Jetson Backend.

The local provisioning script calls the JuggleIM server registration API directly to create synthetic users. It is test infrastructure, not a public token-issuing endpoint. The upstream JuggleIM Server API currently requires a SHA-1 signature derived from the AppSecret; the secret remains server-side. The current JuggleChat Server login implementation was found to use unsalted SHA-1 password hashes, so it is not adopted as Jetson's authentication system.

A successful E2E workflow can prove this narrow SDK connection and private-message path. It does not establish production security, scalability, data retention, offline synchronization, push, or final architecture approval.
