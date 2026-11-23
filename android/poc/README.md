# Jetson Android PoC

An isolated Android/JuggleIM integration proof of concept. This is not the Jetson Messenger MVP or a production deployment.

## Toolchain

- JDK 17
- Gradle 8.7
- Android Gradle Plugin 8.6.1
- Android SDK Platform 35 / Build Tools 35.0.0
- JuggleIM Android SDK 1.9.0

## Live two-client JuggleIM test

The isolated Docker Compose environment, token provisioning, local WSS certificate, emulator trust setup, and two-client send/receive verification are documented in deploy/juggleim-poc/README.md. CI workflow: .github/workflows/juggleim-e2e.yml.

## PoC TLS trust model

The local test CA is generated per CI run. Android 7+ applications do not automatically trust user-added CA certificates, and relying only on modifying the emulator system trust store proved unreliable for this test. The bootstrap now copies only the public CA certificate (never its private key) into a generated Android raw resource before the APK build. network_security_config.xml explicitly trusts that per-run CA alongside normal Android system roots. The server leaf certificate is verified against that exact CA and checked for the emulator endpoint IP before the stack starts.

This trust configuration is strictly for the isolated PoC. Do not ship the generated CA or this trust policy in a production Jetson build. Production must use a publicly trusted server certificate or a separately designed managed trust model.

## JuggleIM connection signing key (test PoC)

The Android SDK requires IConnectionManager.setConnectParams(signKey, headers) before connect(token). The isolated test provisioning script exposes the AppSecret only as a masked CI environment value and in a mode-0600 local test credentials file. Never embed a production app secret in a distributable client APK.
