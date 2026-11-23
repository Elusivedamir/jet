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

## Android PoC preparation (2026-11-23)

- Android JuggleIM validation steps and Given/When/Then acceptance criteria are recorded in [ANDROID_JUGGLEIM_POC_PLAN.md](../research/ANDROID_JUGGLEIM_POC_PLAN.md).
- No APK has been built and no runtime test has passed.
- Current execution environment lacks Flutter/Dart, Android SDK/adb, Gradle, and Docker; Java and Git are available.
- The next executable step requires an Android build environment and isolated JuggleIM test server/backend credentials. Never use demo credentials or expose server secrets in the client.
- Production selection remains open pending PoC evidence.

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
