# Decision log

Last updated: 2026-11-23

This file records owner-approved product and engineering decisions. A summary is not a substitute for the canonical source document.

## Approved product decisions

- Product name: Jetson Messenger.
- Slogan: «Свобода наконец-то и в бизнесе».
- Free messaging includes registration, profile, direct messages, chats, and channels.
- Jetson Business is a personal subscription attached to an individual account, not a separate company/account type.
- USD 5/month is a pricing hypothesis, not a final approved price.
- Business scope includes CRM, bulk messaging, KPI, business profile, and an included AI assistant.
- Trial may last up to 7 days. Auto-renewal requires explicit consent and a payment method, with clear disclosure of price, first payment date, frequency, cancellation, and a reminder before trial end.
- Trial uses a demo virtual database and only limited real sending to users who explicitly consent.
- Bulk messaging requires consent, unsubscribe, separation of service and promotional messages, suppression of unsubscribed users, and abuse monitoring. Do not promise unlimited sending or untested throughput.
- MVP remains inside Jetson Messenger. Email/SMS/external messengers are out of MVP; API/developer portal is post-launch.
- Visual direction: black, premium, high contrast.
- Initial actions: start conversation, switch to business, create channel, create chat.
- Target users: small businesses, online stores, service companies, professionals, and community creators.
- Phases: IM core; Jetson Business; analytics/AI; scaling/API/docs.
- Revenue arithmetic ($5 × subscribers) is not a forecast.

## Approved platform strategy (2026-11-23)

- The product is planned for four client platforms: Android, Web, Windows, and iOS.
- Android APK is the first implementation and launch target.
- The architecture must support a shared server-side product core and common API contracts for all four clients.
- Users should have one Jetson account and synchronized access to shared conversations, contacts, channels, and Jetson Business capabilities across supported clients, subject to platform-specific UX and security controls.
- Development is phased: Android first, then Web, then Windows and iOS. This is a planning sequence, not a commitment to ship dates.
- Telegram Mini App is explicitly excluded from the project.
- The technology stack and detailed client architecture remain unapproved until comparative research evaluates cost, maintainability, platform fit, SDK compatibility, security, and delivery effort.
- This decision does not authorize external messenger integrations; the existing MVP exclusion remains in force.

## Approved engineering governance

The owner approved the consolidated engineering additions (36 controls). They apply throughout the project and are not new product-specification stages:

1. Technical feasibility checks.
2. Scope-creep control.
3. Security tests structured as attack, defense, verification, residual risk.
4. Cost control; separate one-time and recurring costs.
5. Independence from AI tools.
6. Given/When/Then acceptance criteria.
7. Documentation of actual implementation state.
8. Commercial-readiness controls.
9. Specification is requirements source; repository is implementation source.
10. Readable, modular, typed code; small functions/files; explicit errors; no placeholders.
11. Review AI-generated and third-party code.
12. OWASP-oriented security coverage.
13. Secure coding: safe password hashing, server-side authorization, rate limits, secret management, TLS, parameterized queries, migrations, backups, signed webhooks, payment idempotency.
14. Dependency pinning, lockfiles, vulnerability/SCA/SAST/secret/license checks.
15. AI development safety and careful Git/destructive operations.
16. Completion report covering files, tests, security checks, errors, unknowns, and deviations.
17. Quality over speed.
18. Compare technology alternatives before selecting stack.
19. Separate technologies by responsibility.
20. Architecture before implementation; avoid unjustified microservices.
21. Clear project structure and environment separation.
22. Consistent lint/format/typecheck standards.
23. Validate algorithms, async behavior, races, leaks, network errors, financial calculations, and ACL.
24. Explicit API/component contracts.
25. Database integrity, transactions, indexes, concurrency, migrations, rollback/recovery.
26. Disciplined Git workflow.
27. CI for lint, types, tests, builds, migrations, dependency/security checks.
28. Measure performance rather than assume.
29. Resilience for network/DB failures, retries, timeouts, duplicates, partial operations, restarts, recovery.
30. Environment/configuration/secrets discipline.
31. Observability without leaking secrets or private messages.
32. Inspect dependencies and side effects before modifying existing code.
33. Do not delete unknown code; mark it NOT STUDIED.
34. Maintain ADR and technical-debt logs.
35. Handoff checklist for specification, code, tests, build, dependencies, secrets, permissions, docs, Git, limitations.
36. Priority order: approved concept, security, correctness, data integrity, reliability, maintainability, performance, extensibility, speed.

## Platform architecture research (2026-11-23)

- Comparative research is recorded in [CROSS_PLATFORM_CLIENT_ARCHITECTURE.md](../research/CROSS_PLATFORM_CLIENT_ARCHITECTURE.md).
- Preliminary recommendation for validation: native SDK clients (Kotlin/Android, TypeScript/Web, Electron/Windows reusing Web, Swift/iOS) behind one Jetson Backend and common API contracts.
- Flutter remains a candidate pending direct JuggleIM Flutter SDK platform/feature-parity audit and a small proof of concept.
- Compose Multiplatform remains a candidate with a web maturity caveat; official Compose Web/Wasm support is currently documented as Beta.
- This is research, not approval: no framework, stack, JuggleIM dependency, or deployment topology has been selected.

## JuggleIM Flutter SDK audit (2026-11-23)

- Static audit recorded in [JUGGLEIM_FLUTTER_SDK_AUDIT.md](../research/JUGGLEIM_FLUTTER_SDK_AUDIT.md).
- Inspected plugin package declares Android and iOS implementations only; no Web or Windows plugin implementations are declared.
- Android and iOS native dependency versions differ in the inspected plugin (JuggleIM 1.8.39 vs 1.9.0).
- The current Flutter plugin is therefore not accepted as a single four-platform JuggleIM client solution.
- Flutter may remain a candidate for Android+iOS only, subject to runtime feature-parity and license/provenance checks.
- No technology stack or JuggleIM dependency is approved by this audit. Android APK build/runtime PoC remains pending because this execution environment lacks Flutter/Dart and Android SDK tooling.

## Android PoC preparation — historical snapshot (2026-11-23)

- Android JuggleIM validation steps and Given/When/Then acceptance criteria are recorded in [ANDROID_JUGGLEIM_POC_PLAN.md](../research/ANDROID_JUGGLEIM_POC_PLAN.md).
- [ИСТОРИЧЕСКАЯ ЗАПИСЬ, УСТАРЕЛО] At the time this entry was written, no APK had been built and no runtime test had passed. Later entries below supersede this point-in-time status.
- The earlier execution environment lacked Flutter/Dart, Android SDK/adb, Gradle, and Docker; Java and Git were available. Subsequent CI-based Android build and isolated E2E infrastructure are recorded below.
- Production selection remains open pending complete PoC evidence and security/license review.

## Open product decisions

The following remain open and must not be silently decided:
- Launch countries.
- Pricing and payment rails.
- Auto-renewal, cancellation, refunds.
- AI usage limits and unit economics.
- Message throughput and operating limits.
- Exact CRM/KPI fields.
- Team, budget, schedule, support, marketing.
- Willingness to pay, storage and delivery costs.

## Technical decisions

- No production technology stack is approved yet.
- JuggleIM is under evaluation as a possible messaging transport/server component; it is not yet selected.
- Chatwoot is a reference for CRM/campaign/reporting concepts, not an automatic code/stack choice.
- Zulip is a reference for engineering discipline, tests, permissions, and documentation.
- No architecture proposal in this repository is approved merely by being documented.


## JuggleIM Android SDK build audit (2026-11-23)

- Static upstream build/integration review is recorded in [JUGGLEIM_ANDROID_SDK_BUILD_AUDIT.md](../research/JUGGLEIM_ANDROID_SDK_BUILD_AUDIT.md).
- Current upstream README documents Android artifact 1.9.0; older 1.8.39 notes are historical pending exact artifact verification.
- Upstream sample contains a machine-specific JDK path and hardcoded demo signing configuration; neither may be copied into Jetson.
- The optional JetIMKit UI module declares Sendbird Chat 4.16.0 alongside JuggleIM. It is not accepted for Jetson pending dependency, licensing, data-flow, and necessity review.
- Core SDK, JetIMKit, demo, and sample app declare different minSdk levels (19, 24, 24, 26 respectively); Jetson's supported Android API range remains open.
- No JuggleIM version, UI kit, minimum Android API, or production stack is approved by this audit.
- Static inspection only; no Gradle build, APK, or runtime tests have passed.


## Android PoC scaffold and CI (2026-11-23)

- [ИСТОРИЧЕСКАЯ ЗАПИСЬ, ЧАСТИЧНО УСТАРЕЛО] This section records the initial scaffold state. Later session/E2E entries below supersede its statement that runtime session behavior was not implemented.
- Added an isolated, minimal Android project under `android/poc/` and a GitHub Actions build workflow at `.github/workflows/android-poc.yml`.
- Toolchain pinned for the PoC: JDK 17, Gradle 8.7, AGP 8.6.1, compile/target SDK 35; PoC-only minSdk 24. The final product minSdk remains open.
- JuggleIM artifact pin is 1.9.0 based on current upstream README. The app's JuggleIM initialization is guarded by explicit public AppKey and WSS configuration; defaults are empty and do not connect.
- No backend token issuance, messaging session, or production credentials are implemented in this scaffold.
- Unit tests cover runtime configuration validation. GitHub Actions is configured to build a debug APK, run unit tests, and upload an artifact.
- Scaffold source and workflow were committed to the existing working branch. CI execution result, APK artifact, and runtime behavior remain unverified. No merge to `main`.

- Local setup and safe test configuration instructions: [android/poc/README.md](../../android/poc/README.md). Android SDK setup workflow action updated to v4.

## JuggleIM Android session PoC update (2026-11-23)

- Implemented the Android runtime test-session path using the pinned JuggleIM Android SDK 1.9.0: runtime test-token entry, SDK `connect(token)`, connection-state listener, local DB callbacks, and explicit disconnect.
- Test token is entered into a password-style field, cleared from the field immediately after passing to the SDK, and is not intentionally persisted or logged by the PoC.
- This is a transport-integration PoC only. Jetson account authentication and backend token issuance remain unimplemented; live connection has not been verified because no test AppKey, WSS endpoint, reachable JuggleIM environment, or server-issued test token was available.
- Implementation and limits are documented in [JUGGLEIM_ANDROID_SESSION_POC.md](../research/JUGGLEIM_ANDROID_SESSION_POC.md) and [android/poc/README.md](../../android/poc/README.md).
- CI is running for the implementation on the working branch. Do not describe the feature as live-connected until a test session reaches CONNECTED and messaging tests pass.
- No production technology stack or production use of JuggleIM is approved by this PoC. No merge to `main`.

## Approved foundation addendum (2026-11-23)

- The owner approved [MASTER_PROMPT_FOUNDATION_ADDENDUM.md](MASTER_PROMPT_FOUNDATION_ADDENDUM.md) as a foundational engineering/security/reliability/product-safeguards supplement.
- Approved controls include threat modelling; authentication/session and server-side authorization; privacy/data lifecycle; messaging cryptography decision gate; attachment and abuse controls; explicit architecture/API contracts and requirement-to-evidence traceability; synchronization correctness; compatibility and supply-chain review; measurable reliability, backup/restore and incident response; business/payment/campaign/legal/AI readiness gates; AI-assisted development safeguards; severity model and release gates.
- Product/architecture parameters that require evidence or owner choice (including E2EE scope, data retention, business team model, legal jurisdictions, payment rails, AI provider and SLO/RPO/RTO values) remain explicitly open. The addendum does not silently select them.
- The addendum supplements, and does not replace or reconstruct, the missing canonical 16-point MASTER PROMPT. Restoring that source verbatim remains mandatory before production implementation.
- Apply the new controls immediately to research, architecture and isolated PoC work. The PoC is not production approval for JuggleIM.

## JuggleIM isolated Android E2E PoC (2026-11-23)

- [ПРЕДЛОЖЕНИЕ] Added a disposable, loopback-only Docker Compose environment using the JuggleIM server at pinned upstream commit `471425fe0acfa0f9658e62eff69a3ba5bb622515`, MySQL and a local WSS reverse proxy. This is test infrastructure, not a production deployment or an approved stack selection.
- Added server-side provisioning of two synthetic IM users using the JuggleIM REST API. AppSecret and admin authorization remain outside APKs; synthetic user tokens are stored only in ignored local files / masked CI variables.
- Added separate debug-only Alice and Bob Android variants and SDK-level private text-message send/receive callbacks. Test token Intent extras are accepted only in debug builds and removed immediately.
- Added GitHub Actions workflow `.github/workflows/juggleim-e2e.yml` to build the isolated server, provision users, connect two emulator clients over WSS, send a private message and verify sender/receiver callbacks.
- The Android build previously failed because Maven Central returned HTTP 429 for a transitive dependency. Added Google's Maven Central mirror before the standard Maven Central repository; retry verification is in progress.
- [ВЫВОД] Static review of the current upstream JuggleChat Server login source found unsalted SHA-1 password hashing. It is not adopted as Jetson's production authentication backend; any reuse requires a security redesign and independent review.
- The upstream JuggleIM REST signing protocol uses SHA-1 of `app_secret + nonce + timestamp`. The secret remains server-side. This is an upstream protocol limitation to include in the threat model; the PoC does not expose this signing operation to clients.
- [НЕ ПРОВЕРЕНО] Live SDK connection and private-message exchange remain unverified until the new GitHub Actions E2E run completes successfully.
- This PoC does not implement Jetson account authentication, secure password storage, session lifecycle, production token issuance/revocation, account mapping, authorization, or business services. No production architecture is approved and no merge to `main` is authorized.
