# Master Prompt Foundation Addendum — Engineering, Security, Reliability and Product Safeguards

**Status:** [СОГЛАСОВАНО] foundational engineering controls; [ВОПРОС] product/architecture parameters that require evidence or owner decision  
**Date:** 2026-11-23  
**Applies to:** Jetson Messenger and all project stages, including discovery, architecture, implementation, integration, testing, release and operations  
**Relationship to canonical MASTER PROMPT:** supplements it; does not replace, reconstruct, reorder or waive any of its original 16 numbered points.

## 0. Authority and interpretation

1. The canonical MASTER PROMPT and owner-approved product requirements remain the highest product authority.
2. This addendum strengthens engineering completeness, security, reliability and change control. It does not silently approve a vendor, stack, architecture, feature, price, launch country, legal position or commercial commitment.
3. If this addendum conflicts with the canonical prompt or an owner-approved decision, stop the affected work, identify the exact conflict and request a decision. Do not silently choose a side.
4. Missing requirements must be recorded as missing. Never invent the original wording or claim that a reconstructed summary is the canonical prompt.
5. Product stages remain sequential and may not be skipped, merged or reordered unless the owner explicitly changes that rule. Research, threat modelling, documentation and isolated disposable PoCs may proceed only where they do not prejudge a missing product requirement or create an irreversible production commitment.
6. Every material requirement, assumption and decision must carry a status: [СОГЛАСОВАНО], [ВЫВОД], [ВОПРОС], [НЕ СОГЛАСОВАНО], [НЕ ПРОВЕРЕНО] or [ПРЕДЛОЖЕНИЕ].

## 1. Security and privacy foundation

### 1.1 Threat model before production design
For every trust boundary and sensitive workflow, document:
- assets and data classes (credentials, identity, private messages, contacts, files, payment state, consent records, business data, telemetry);
- actors and trust levels (anonymous user, authenticated user, other user, staff, administrator, service account, provider, compromised client/device);
- entry points, abuse cases, likely attacker capabilities and impact;
- preventive controls, detection, recovery and residual risk;
- explicit exclusions and assumptions.

Threat models must be revisited when features, vendors, protocols, data flows or deployment boundaries change.

### 1.2 Identity, authentication and sessions
Production design must define:
- account creation and identity verification appropriate to the risk;
- safe password hashing using a current, reviewed password-hashing scheme and parameters (never plaintext, reversible storage or unsalted fast hashes);
- secure credential reset and account recovery, including recovery abuse controls;
- session/token issuance, scope, audience, expiry, rotation, revocation and logout;
- device registration, device loss, suspicious sign-in and session review;
- rate limits, brute-force protections, credential stuffing defenses and abuse monitoring;
- secure storage on each client platform and protection against accidental logs, crash reports, backups and clipboard leakage.

Authentication at the client is not authorization. The server must independently authorize every operation.

### 1.3 Authorization and isolation
- Enforce authorization server-side for every request, resource and state transition.
- Treat all client-supplied IDs, roles, flags, prices, entitlements, tenant identifiers and ownership claims as untrusted.
- Test IDOR/BOLA, privilege escalation, horizontal and vertical access, group membership changes, object ownership, cross-account and cross-business access.
- Define roles and permissions explicitly; default deny; apply least privilege to users, staff, services, CI and administrators.
- Tenant/business isolation must be proven by negative tests, not inferred from UI filtering.
- Administrative operations require stronger authentication, narrow scope, audit records and controlled break-glass procedures.

### 1.4 Messaging confidentiality and cryptography — decision gate
Before production messaging architecture is approved, compare and document:
- transport encryption and server-side encryption at rest;
- whether end-to-end encryption (E2EE) is required, for which conversation types, and the threat model it addresses;
- key generation, storage, distribution, device addition/removal, rotation, backup, recovery and lost-device behavior;
- multi-device synchronization, search, moderation/reporting, attachments, push notifications, backups and AI processing under each model;
- metadata visible to the service/provider and retention implications;
- cryptographic protocol maturity, independent review and migration path.

**Do not assume E2EE is either required or unnecessary.** Record a decision with trade-offs and owner approval before implementing a production cryptographic model. Never invent a custom cryptographic protocol. Use established, reviewed implementations and obtain specialist review.

### 1.5 Data lifecycle and user rights
For every data category define:
- purpose, lawful basis/consent where applicable, collection source and minimization;
- owner/controller/processor roles and provider access;
- retention period and deletion trigger;
- export, correction, account closure and deletion behavior;
- backup expiry and deletion propagation;
- legal hold/exception process where applicable;
- audit evidence and user-facing explanation.

Account deletion must cover or explicitly account for messages, files, search indexes, caches, analytics, logs, backups, provider-side copies and business records. Do not promise immediate erasure where technical or legal retention constraints prevent it.

### 1.6 Attachments and external content
Define and test:
- file type allowlists, size/count limits and content inspection;
- malware scanning or documented risk-based alternatives;
- storage isolation, authorization on every download, expiring access links and safe filenames;
- content-type sniffing, archive bombs, path traversal and parser vulnerabilities;
- quotas, retention, deletion, abuse reporting and link previews;
- safe rendering and opening of untrusted URLs/content.

### 1.7 Abuse, fraud and moderation
Create policies and operational flows for spam, phishing, impersonation, harassment, malicious files, fake accounts, account takeover, fraudulent campaigns and payment abuse. Define report/block/mute flows, evidence preservation, review access, appeal, enforcement consistency, escalation and abuse metrics. Staff access to private content must be purpose-limited, authorized and audited.

### 1.8 Secrets, cryptography and secure defaults
- Secrets must be server-side or in an approved secret manager; never commit, embed in APKs, expose in logs or place in client configuration.
- Separate development, test, staging and production credentials, databases, signing keys, domains and access policies.
- Use TLS with certificate validation; do not disable verification to make tests pass.
- Use secure random values, current approved algorithms, key rotation and documented ownership.
- Test/demo credentials and permissive defaults must be guarded so they cannot be deployed to production.
- CI permissions must be minimal; protect release signing material; rotate exposed credentials and document incident response.

## 2. Architecture and integration integrity

### 2.1 Requirements-to-evidence traceability
Maintain a traceability matrix for every material requirement:
**requirement → owner decision/status → architecture/design element → API/data contract → implementation → test case → test result/evidence → release scope**.

No critical requirement is complete merely because it appears in documentation or code. Every link must be inspectable. Mark gaps as blocked or unverified.

### 2.2 Explicit contracts
For each API, event, message, database entity, job and external integration, document:
- identifier semantics and ownership;
- field names, types, formats, units, required/optional status, defaults and nullability;
- validation, normalization, limits and error model;
- authentication, authorization and tenant scope;
- idempotency, ordering, retry and version compatibility;
- time zone and timestamp semantics;
- producer/consumer compatibility and deprecation policy.

Validate contracts at boundaries. Do not rely on implicit naming, undocumented defaults or assumptions shared only by developers.

### 2.3 Trust boundaries and service responsibility
For every component, state what it owns and what it must never decide. Clients are presentation and interaction surfaces, not authorities for permissions, payment state, consent, pricing or campaign eligibility. Third-party messaging, payment, analytics and AI providers are untrusted external dependencies until reviewed. Server-side policy enforcement remains authoritative.

No service split, microservice, vendor or deployment topology is approved merely because it appears in a diagram or PoC.

### 2.4 Messaging correctness and synchronization
Define acceptance criteria for:
- delivery acknowledgement semantics (accepted, queued, delivered, read—do not conflate them);
- message IDs, deduplication, retries and idempotency;
- ordering guarantees and behavior under reconnect;
- offline delivery, history pagination and synchronization cursors;
- multi-device read state, edits, deletes, reactions and conflict resolution;
- membership/permission changes during in-flight delivery;
- clock skew, duplicate/out-of-order events and partial outages;
- migration away from a provider and export of user data.

Test lost, duplicated, delayed, reordered and replayed events. A green connection or sender callback does not prove recipient delivery or durable storage.

### 2.5 Compatibility and evolution
Maintain a supported client/OS/device/API matrix. Define backward/forward compatibility for clients, servers, database schemas, events and SDKs. Test the oldest supported client against the newest server and vice versa where relevant. Use versioned contracts and staged deprecation; avoid forced upgrades without a documented recovery path.

### 2.6 Third-party and supply-chain review
Before adopting a dependency or provider, record:
- exact version, source, maintainer and provenance;
- license and obligations, including transitive dependencies and bundled assets;
- security advisories, known vulnerabilities and maintenance health;
- permissions, data access, telemetry and network destinations;
- build reproducibility, integrity and update policy;
- exit strategy, portability, data export and replacement cost.

Pin dependencies and use lockfiles. Run dependency/SCA, secret, static-analysis and license checks. Generate an SBOM for release artifacts where feasible. Review SDKs and sample projects separately; never copy demo credentials, signing keys, machine-specific paths or unsafe defaults.

## 3. Reliability, performance and operations

### 3.1 Define measurable service objectives
Before production launch, set evidence-based targets for:
- service availability and maintenance windows;
- message send/receive latency and delivery success;
- API latency/error rate;
- synchronization delay and offline recovery;
- crash-free sessions and supported-device performance;
- capacity, concurrency, storage growth and queue backlog.

Define measurement method, population, window, exclusions, alert thresholds and owner. Do not claim an SLA until targets and operational capacity are approved.

### 3.2 Data durability and disaster recovery
For each critical datastore/service, define:
- Recovery Point Objective (RPO) and Recovery Time Objective (RTO);
- backup frequency, encryption, access separation and retention;
- restore procedure and scheduled restore drills;
- replication/failover behavior and consistency risks;
- migration rollback or forward-fix strategy;
- recovery validation and customer communication.

A backup job reporting success is not proof that data can be restored. Test actual restores.

### 3.3 Failure handling
Every network/service/job integration must define bounded timeouts, retry policy with backoff/jitter, retryable vs terminal errors, cancellation, idempotency, circuit breaking where appropriate, dead-letter/replay procedures and cleanup. Prevent retry storms and duplicate payments/messages/campaigns. Degrade safely and communicate partial failures.

### 3.4 Observability and incident response
Provide privacy-safe logs, metrics, traces and audit events with correlation IDs. Never log passwords, tokens, signing secrets, message bodies or unnecessary personal data. Define alert ownership, severity, on-call/escalation, incident containment, credential rotation, user notification, post-incident review and corrective-action tracking.

### 3.5 Capacity and cost
Load-test realistic workflows and failure conditions before capacity claims. Track infrastructure, storage, egress, push, AI, payment and support costs separately. Model unit economics under normal, peak and abuse conditions. Set budgets/quotas and alerting; do not promise unlimited usage or throughput without evidence.

## 4. Product, business and legal completeness gates

These topics are mandatory to resolve before the affected feature/launch; this addendum does not choose their commercial or legal values.

### 4.1 Account and workspace model
Clarify whether one personal account may manage multiple businesses, whether staff/team seats exist, role granularity, invitations, ownership transfer, offboarding, billing responsibility, audit history and cross-workspace isolation. Preserve the currently approved rule that Jetson Business is a personal subscription attached to an individual account, not a separate company/account type, unless the owner explicitly changes it. Do not infer team functionality from that rule.

### 4.2 Subscription and payments
Specify plan entitlements, trial eligibility, explicit consent, price/currency/tax display, renewal timing, reminders, cancellation, grace period, failed payment, refunds, chargebacks, duplicate webhook handling, idempotency and account downgrade behavior. Payment provider callbacks must be authenticated and reconciled server-side. Never trust client-side purchase success as proof of entitlement.

### 4.3 Campaign consent and deliverability
Record consent source, scope, timestamp, wording/version and withdrawal. Enforce suppression at send time, including race conditions and imports. Separate transactional/service messages from promotional campaigns. Define complaints, bounce handling, frequency caps, sender reputation, abuse thresholds, auditability and recipient rights. Do not promise delivery or unlimited campaigns.

### 4.4 Jurisdiction and compliance
Before launch in each country, obtain qualified review of applicable privacy/data-protection, consumer, subscription/auto-renewal, payment, tax, marketing/anti-spam, child-safety, accessibility, content moderation, data residency and breach-notification requirements. Maintain a country-by-country launch checklist and provider/data-processing agreements. Do not present an engineering assumption as legal advice or compliance certification.

### 4.5 AI governance
Before sending user/business data to an AI provider, document data categories, purpose, consent/notice, provider retention/training terms, region, access controls and deletion. Mitigate prompt injection, malicious attachments/URLs, cross-tenant leakage, tool overreach and unsafe actions. Use least-privilege tools, explicit confirmation for consequential actions, output validation, audit logs, rate/cost caps, fallback behavior and opt-out controls. AI must not override authorization or policy. Measure quality and unit cost; do not imply human-level reliability.

### 4.6 Support and lifecycle
Define user support, account recovery escalation, complaint handling, service status communication, accessibility expectations, export/deletion support, upgrade and end-of-life policy before launch. Provide an operational owner for each critical service.

## 5. AI-assisted development and change-control safeguards

1. AI-generated code, tests, documentation and architecture are proposals until inspected and verified.
2. Never fabricate test output, claim a command ran when it did not, or infer E2E success from a build, mock, stub, screenshot or intermediate log.
3. No placeholder/stub/fake implementation may be presented as complete. Mark intentionally temporary code and its removal gate.
4. Inspect the actual diff and surrounding code before committing. Check for accidental deletions, disabled tests, weakened assertions, swallowed errors, hardcoded secrets, unsafe defaults and unrelated edits.
5. Never delete or rewrite unfamiliar functionality merely to make tests pass. First map dependencies and preserve behavior; mark unstudied code explicitly.
6. Do not change approved requirements, architecture, security controls, product scope, vendor choice or commercial terms without the required approval.
7. Do not reduce test coverage, disable security checks, skip failing jobs or loosen validation to obtain a green pipeline without a documented, approved reason and compensating control.
8. Test the real interface and data flow. A mock may support unit tests but cannot replace integration/E2E evidence.
9. For every fix, identify root cause, adjacent failure modes and regression scope. Run the cheapest relevant checks first, then the appropriate integration and E2E tests.
10. Keep changes small and reviewable; separate refactors from behavior changes; maintain ADR, decision, risk and technical-debt records.
11. Report exact commit/branch, files changed, commands actually run, test results, artifacts, known limitations and unverified scope.
12. Use explicit status: PASS, FAIL, BLOCKED, NOT RUN or NOT VERIFIED. “No known issue” is not the same as “verified safe”.

## 6. Risk severity and release gates

Use this severity model consistently:
- **P0 — critical:** account/data compromise, cross-user or cross-tenant access, secret exposure, irreversible data loss, payment/consent bypass, exploitable production vulnerability, or violation of a hard owner-approved requirement. Stop affected work/release; contain and resolve before proceeding.
- **P1 — high:** major feature failure, significant privacy/security weakness, broken recovery, material billing/delivery errors, or unsupported migration path. Block the affected production feature/release unless an explicit, documented risk acceptance and mitigation is approved.
- **P2 — medium:** bounded defect with workaround or limited impact. Track owner, target stage and regression test; may proceed only if it does not undermine a critical acceptance criterion.
- **P3 — low:** cosmetic, minor usability or non-critical documentation issue. Track and prioritize normally.

A risk acceptance must identify scope, impact, exposure window, compensating control, owner, expiry/review date and rollback/containment plan. No acceptance may waive law, user consent, data ownership or a hard security boundary.

Release gates:
1. No open P0.
2. No unaccepted P1 affecting the release scope.
3. Critical requirements trace to passing tests and evidence.
4. Security, privacy, data migration, backup/restore and rollback checks are complete for the scope.
5. Build provenance, signing, permissions, dependency/license review and secret scan are checked.
6. Monitoring, incident response, support ownership and rollback are ready.
7. User-facing claims match verified behavior and known limitations.

## 7. Mandatory decision register — values intentionally not invented

Create and maintain explicit ADRs/decision records for:
- E2EE scope and cryptographic/key lifecycle;
- identity verification, account recovery and session policy;
- personal account ↔ business/workspace/team relationship and role model;
- data classification, retention, export, deletion and backup expiry;
- supported client/OS/device matrix and compatibility policy;
- message durability, delivery semantics, synchronization and multi-device conflict behavior;
- attachment scanning, storage and access policy;
- launch countries, data residency and applicable legal obligations;
- payment provider, taxes, refunds, renewal and failed-payment behavior;
- campaign consent evidence, deliverability and abuse thresholds;
- AI provider, data handling, tool permissions, retention and cost limits;
- availability/latency/capacity targets, RPO/RTO and operating budget;
- third-party vendor/dependency approval and exit strategy.

Each decision record must include context, options considered, evidence, security/privacy/cost/operational consequences, chosen option, rejected alternatives, status, approver, date and revisit trigger. If evidence is insufficient, keep the decision [ВОПРОС] or [НЕ ПРОВЕРЕНО] and block dependent production implementation.

## 8. Required project artifacts

Maintain, as appropriate:
- canonical MASTER PROMPT and version/hash;
- requirements register and acceptance criteria;
- requirement-to-test traceability matrix;
- architecture diagrams and trust-boundary/data-flow diagrams;
- threat model and security test register;
- ADR/decision log;
- API/event/data contracts and compatibility matrix;
- dependency/license/SBOM register;
- privacy/data inventory and retention schedule;
- risk register and technical-debt register;
- SLO/SLA, capacity and cost model;
- backup/restore, migration, rollback and incident runbooks;
- release evidence and completion report.

## 9. Adoption and immediate application

- These foundational engineering controls are [СОГЛАСОВАНО] by the owner on 2026-11-23.
- Product-specific parameters listed in section 7 remain open; this is intentional, not an omission to fill with guesses.
- Apply the controls immediately to research, architecture and the isolated JuggleIM PoC where relevant. The PoC is not production evidence and does not approve JuggleIM as the production messaging engine.
- Before production implementation, restore the original MASTER PROMPT verbatim and reconcile it with this addendum. The addendum cannot replace the missing original 16-point source.
