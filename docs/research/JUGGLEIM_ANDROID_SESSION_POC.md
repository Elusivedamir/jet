# JuggleIM Android session PoC

**Status:** [ВЫВОД] implementation on the isolated working branch; [НЕ ПРОВЕРЕНО] live connection until a real test AppKey, WSS endpoint, server and token are supplied.

## Confirmed SDK contract

- Official Android SDK repository: https://github.com/juggleim/imsdk-android
- Official Android quick start: https://juggle.im/docs/client/quickstart/android/
- Current SDK dependency used by this PoC: `com.juggle.im:juggle:1.9.0`.
- SDK initialization: `JIM.getInstance().setServerUrls(...)`, then `JIM.getInstance().init(context, appKey)`.
- User session: `JIM.getInstance().getConnectionManager().connect(token)`.
- Connection observation: `addConnectionStatusListener(key, listener)`; states include IDLE, CONNECTING, CONNECTED, DISCONNECTED and FAILURE.
- The SDK documentation says the user token must be issued by the application/server side; it must not be hard-coded into a public client.

## Implemented in Android PoC

- Uses the existing guarded SDK initialization in `JetsonApplication`.
- Adds a runtime-only password-style test token field.
- Calls the actual SDK connection manager's `connect(token)` method.
- Shows connection-state changes and local database open/close callbacks.
- Provides explicit disconnect.
- Clears the input field immediately after handing the token to the SDK; does not persist or log it.
- Keeps AppKey and WSS configuration as Gradle properties for local test builds; the default CI build remains offline/unconfigured.

## Critical integration gap

The Jetson repository currently has no implemented Jetson authentication backend or token-issuance endpoint. Therefore the client cannot yet obtain a user token from Jetson automatically. Manual test-token entry is only a narrow SDK transport PoC, not the intended user experience and not a production auth design.

Before live integration testing, provide/deploy:
1. A JuggleIM test environment with reachable WSS endpoint and matching AppKey.
2. A trusted server-side method to issue a short-lived token for a test user.
3. A test account and a second account/device for private-message verification.

Never place App Secret, App Secure Key, admin credentials, or reusable user tokens in the repository, APK resources, Gradle properties committed to Git, or Actions logs.

## Acceptance gates

1. Required CI build and unit tests pass.
2. Emulator install/launch passes.
3. With test AppKey/WSS/token, SDK reports CONNECTED.
4. Invalid/expired token produces a visible failure without leaking the token.
5. Disconnect transitions to DISCONNECTED.
6. Two test users exchange private messages; delivery, ACK and history are verified.
7. Only after these tests, design Jetson backend token issuance and account-to-IM identity mapping.

## Evidence and limitations

The SDK API shape above is confirmed from the official SDK source and quick-start documentation. No live server credentials or endpoint were available during this change, so no successful network session is claimed.
