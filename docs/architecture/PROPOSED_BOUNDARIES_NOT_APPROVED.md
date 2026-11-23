# Proposed system boundaries — not approved

Status: [ПРЕДЛОЖЕНИЕ] discussion artifact only. No stack, deployment topology, or vendor dependency is approved.

## Responsibility split to evaluate

### Jetson Backend
- Jetson user identity and authentication.
- Mapping between Jetson user IDs and messaging-provider IDs.
- Authorization and business entitlements.
- Subscription lifecycle, payment state, trial consent and cancellation.
- CRM, campaigns, templates, scheduling, unsubscribe and suppression lists.
- KPI aggregation and AI assistant orchestration.
- Audit/security events and policy enforcement.

### Messaging infrastructure candidate
A candidate such as JuggleIM may be evaluated for:
- real-time connections;
- private and group message transport;
- delivery acknowledgements;
- message history and offline synchronization;
- multi-device behavior;
- attachments, push and presence, subject to verification.

### Clients
- Present UI and user-controlled settings.
- Hold only scoped user tokens and public connection configuration.
- Never receive server secrets or privileged administrative credentials.
- Never be trusted as the authority for permissions, payment status, consent, or campaign eligibility.

## Non-negotiable security boundaries to validate

- Server-side authorization on every object and operation (including IDOR/BOLA).
- Strict tenant/user data isolation.
- Consent evidence, unsubscribe enforcement, and immutable campaign suppression checks.
- Signed webhooks, idempotent payment and campaign operations, replay protection.
- Session expiry/revocation and rate limits.
- Safe attachment access and retention/deletion.
- Backups, recovery tests, and privacy-safe observability.

## Decisions still open

- Launch regions and regulatory requirements.
- Client platforms and target device support.
- Candidate messaging engine and license/dependency review.
- Data model, database, queues, realtime protocol.
- Hosting/deployment model and operating cost.
- Availability, throughput, retention, RPO/RTO targets.
- AI provider/model, privacy controls, and unit economics.

Do not implement this proposal until the canonical MASTER PROMPT and numbered product specification have been imported and the relevant decisions approved.
