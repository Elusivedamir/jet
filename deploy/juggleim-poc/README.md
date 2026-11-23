# JuggleIM local end-to-end PoC

**Status:** isolated test environment only. This is not a production deployment and does not approve JuggleIM as the final production messaging stack.

## What this test validates

1. Build a pinned upstream JuggleIM server from source.
2. Start MySQL and JuggleIM in an isolated Docker network.
3. Create a temporary AppKey and two synthetic IM users using the server-side REST API.
4. Issue user tokens without placing the AppSecret in either APK.
5. Terminate the local WebSocket with WSS using a short-lived test CA.
6. Install two separate Android app variants (Alice and Bob) in one emulator.
7. Verify both SDK sessions reach `CONNECTED`.
8. Send a private text message from Alice to Bob using the Android SDK.
9. Verify the sender's SDK success callback and Bob's message-receive callback.

The Android SDK's private-message flow follows the official JuggleIM sample: `TextMessage`, a `PRIVATE` `Conversation`, and `IMessageManager.sendMessage`. See https://juggle.im/juggleimsdk/ and https://juggle.im/docs/client/sdkintro/watcher/message/.

## Run locally

Prerequisites: Docker Engine + Compose plugin, OpenSSL, curl, jq, JDK 17, Android SDK / adb, and Gradle 8.7.

From the repository root:

```bash
bash deploy/juggleim-poc/scripts/bootstrap.sh
```

The bootstrap:
- generates a random MySQL root password in an ignored `.env` file;
- generates a seven-day local CA and server certificate;
- starts the pinned JuggleIM server, MySQL and Caddy WSS proxy;
- creates a temporary app and two synthetic users;
- stores test AppKey, WSS address and user tokens in the ignored file `.secrets/test-users.env` with mode 0600.

Build both Android clients:

```bash
set -a
source deploy/juggleim-poc/.secrets/test-users.env
set +a
cd android/poc
gradle --no-daemon \
  -PjuggleAppKey="$JUGGLE_APP_KEY" \
  -PjuggleWssUrl="$JUGGLE_WSS_URL" \
  :app:assembleAliceDebug :app:assembleBobDebug
```

Install the local CA on a disposable, rootable Android emulator and install both APKs. The emulator test workflow in `.github/workflows/juggleim-e2e.yml` contains the complete automated commands, including token injection through debug-only Intent extras.

Stop and remove the local test stack and its database volume after the test:

```bash
cd deploy/juggleim-poc
docker compose down -v --remove-orphans
```

Delete the ignored `.env`, `.secrets/` and `certs/` directories when finished.

## Network and secret boundaries

- MySQL, the JuggleIM admin API and the JuggleIM server API are published only on host loopback (127.0.0.1).
- The WSS proxy is also bound to host loopback. The emulator reaches the host through Android's 10.0.2.2 alias.
- The generated CA and leaf certificate are test-only, self-signed-chain credentials valid for seven days. They must never be used in production.
- The JuggleIM AppSecret and admin authorization stay in the provisioning shell process and are not written to the APK or test-users file.
- User tokens are credentials. They are stored only in an ignored local file with restrictive permissions and are masked in CI logs. CI runs use synthetic users and an ephemeral database volume.
- The upstream JuggleIM server API currently requires a SHA-1 signature of `app_secret + nonce + timestamp`. This is an upstream protocol requirement, not a Jetson password-hashing design. Keep the secret and signature generation server-side, rotate it with the AppKey, and record replay-protection limitations for the upstream API.
- The upstream local admin image seeds demo credentials. This stack is intentionally bound to loopback and must not be exposed to a LAN or public interface.

## Important product/backend gap

This PoC provisions two synthetic IM identities directly through the JuggleIM server API. It does **not** implement Jetson account registration, password hashing, login/session lifecycle, account-to-IM identity mapping, account recovery, token refresh/revocation, subscriptions, or business permissions. It is not the Jetson Backend and must not be exposed as a public token-issuing endpoint.

The official JuggleChat Server is also under evaluation as a business-layer reference, but its current login implementation stores password hashes using unsalted SHA-1. It must not be adopted as Jetson's production authentication system without a security redesign and review.

## Pinned upstream source

- Repository: https://github.com/juggleim/im-server
- Commit: `471425fe0acfa0f9658e62eff69a3ba5bb622515`
- License: Apache-2.0
- The SQL schema in this directory is copied from that exact upstream commit. See `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES/JuggleIM-APACHE-2.0.txt`.

## Acceptance evidence

The CI workflow must show:
- Docker stack healthy and JuggleIM admin API reachable.
- Two test tokens provisioned.
- Alice and Bob SDK connections reach `CONNECTED`.
- Alice receives SDK send success.
- Bob receives the exact synthetic test message.

A successful CI run verifies this narrow Android/JuggleIM integration path only. It does not establish production security, scalability, multi-device behavior, offline synchronization, push, release signing, or the final architecture decision.


## CI / emulator notes

GitHub-hosted Linux runners may not expose KVM to the Android emulator. The E2E workflow sets `ANDROID_I_WANT_MY_TCG=yes` so the emulator can use its software CPU translator when hardware acceleration is unavailable. This is a slower fallback; it does not change the app's runtime networking or TLS configuration.
