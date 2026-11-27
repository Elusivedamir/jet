# Jetson Messenger — Business Offers, Interest Graph and Mutuality

**Status:** Owner-approved product direction recorded 2026-11-27. Detailed policy, legal basis, UX, numerical limits and implementation remain to be validated.  
**Authority:** Owner's explicit additions in the 2026-11-27 conversation. This document supplements, and does not replace or rewrite, the canonical business-plan PDF or baseline.

## 1. Product intent

Jetson should make relevant business opportunities useful to people rather than turn the messenger into an unsolicited advertising channel. The intended value includes discovering employment, education, useful services, practical tools and opportunities that may materially improve everyday life. Marketing language must remain honest: Jetson can surface opportunities, not guarantee jobs, educational outcomes, income or life changes.

The feature set consists of three connected capabilities:
1. recipient-controlled Business Offers;
2. user-selected interests and privacy-safe audience matching;
3. bilateral Mutuality modes that govern expanded communication permissions.

## 2. Business Offers — recipient opt-in and separate folder

### Product behavior
- Add an explicit setting/toggle named **"Разрешить предложения от бизнеса"**.
- Default state: OFF unless the owner later explicitly approves another default.
- When OFF, a business account must not send promotional/offers messages to that user through the Business Offers channel.
- When ON, eligible business offers are delivered to a distinct **"Предложения"** folder, separate from personal chats and ordinary inbox conversations.
- Clearly identify the business sender and label the content as a business offer/promotional communication.
- The recipient can open, save, hide/delete, report, block the sender, adjust preferences or withdraw consent.
- Withdrawal must stop future eligible offers promptly and be enforced at dispatch time, not only when the campaign is created.
- Turning off offers must not silently unsubscribe the user from essential service/security notices; service and promotional communication remain separate categories.
- Consent record should capture scope, source, timestamp, policy/version and withdrawal; minimize retained data and restrict access.

### UX and positioning
- Explain the feature positively and accurately: discover work, learning, useful services and practical opportunities.
- Do not use deceptive urgency, fake scarcity, manipulative dark patterns or guaranteed-outcome claims.
- The offers folder should be clearly optional and never masquerade as personal messages.
- User controls must be easy to find and as easy to withdraw as to grant.

## 3. Interest Graph — user-chosen interests and audience matching

### Personal user
- Provide an interest-selection experience familiar in simplicity to short-video recommendation onboarding (e.g. topic chips/categories), without copying another product's UI or assuming behavioral surveillance.
- Users can add, remove, reorder or reset interests at any time.
- Explain how interests influence recommendations and Business audience matching.
- Users can choose whether their interests may be used for personalized Business offer matching.
- Provide controls to pause personalization or clear/reset the interest profile.
- Do not infer or expose sensitive traits. Do not make sensitive categories available for business targeting.

### Business user
- Business subscribers can select from permitted interest categories when defining an eligible audience.
- Businesses receive only aggregate or otherwise privacy-protected audience estimates before sending, not a browsable directory of named users or their private interest lists.
- A user can be matched only if they have enabled Business Offers and permitted interest-based matching for the relevant purpose.
- Audience membership and consent must be rechecked immediately before each dispatch.
- Prevent small-cohort inference and prohibit exporting raw personal interest profiles.
- Explain targeting criteria to recipients in accessible preference controls.

### Recommendation quality
- Start with explicit user-selected interests as the primary signal.
- Any future behavioral signals require separate privacy review, clear disclosure and user controls.
- Avoid optimizing solely for engagement; include relevance, user feedback, complaint rate, hide/report rate and opt-out rate.
- Provide "not interested", hide, report and preference reset controls.
- Paid status buys tools for compliant matching, not access to private personal data or a right to contact anyone.

## 4. Mutuality — bilateral communication permissions

### Modes
- **Базовый** is the default mode for accounts and preserves ordinary messaging/discovery limits.
- **Максимум** is an explicit expanded permission between two specific accounts.
- A business owner may invite an employee/contact to enable Maximum; the other person must independently accept. The same applies in the reverse direction.
- Maximum becomes active only after both parties have explicitly accepted the same scope.
- The relationship is pair-scoped, visible to both parties, revocable by either side and auditable.
- The UI must show current mode and explain what changes before confirmation.
- Revocation immediately returns the pair to the applicable Base/default policy for future sends.

### What Maximum means
- Remove ordinary per-pair message-frequency and repeated-contact limits that exist to prevent unwanted unsolicited contact, for as long as both parties keep Maximum active.
- Permit sustained, high-volume back-and-forth communication between those two accounts, subject to service capacity and safety controls.
- Do not interpret Maximum as permission for unrelated third-party campaigns, group-wide permissions, data sharing, account impersonation or bypassing recipient blocks/reports.
- No mode overrides a block, explicit opt-out, account security lock, legal restriction, fraud/malware protections or platform-wide emergency controls.
- Maximum is not a blanket promise of literally infinite capacity or immunity from all restrictions.

### Employment/business relationship safeguards
- Mutuality must be voluntary and must not be a condition of employment, access to wages, essential services or continued use of the free messenger.
- The employee can decline or revoke without retaliation within the product; the interface must not imply otherwise.
- Business administrators cannot silently enable Maximum for staff or on behalf of another user.
- If the account is managed by an organization, authorization and audit boundaries must be explicit.

## 5. Communication policy and high-throughput campaigns

- Distinguish one-to-one pair communication under active Mutuality from promotional campaigns to an audience.
- A compliant business campaign may be processed at high throughput (including a future target workload such as 100,000 recipients/minute) only when capacity has been measured and the eligible audience has the required consent.
- High volume alone is not sufficient to classify a campaign as spam; evaluate consent, recipient preferences, relevance, complaint/report rates, bounce/failure signals, sender reputation, content abuse and anomalous behavior.
- Conversely, subscription status or Mutuality must never grant blanket immunity from anti-abuse enforcement.
- Use durable queues, fair scheduling, backpressure, idempotency, rate governance and priority protection for ordinary personal messaging.
- Distinguish platform capacity limits from abuse policy. If capacity or safety controls slow a campaign, communicate the reason and expected state clearly.
- User claims such as "never blocked", "unlimited for everyone" or guaranteed throughput are prohibited.
- Numerical thresholds, fairness policy, capacity targets and campaign approval rules remain OPEN until measured and reviewed.

## 6. Requirements, privacy and safety gates

Before implementation, define:
- consent and preference taxonomy, proof and withdrawal semantics;
- lawful basis, retention and launch-market compliance;
- data minimization, access controls and audit trail;
- prohibited/sensitive interest categories and inference restrictions;
- minimum cohort sizes and anti-reidentification controls;
- block/report/mute behavior and abuse escalation;
- Mutuality invitation, acceptance, expiration, revocation and pair-state transitions;
- employment coercion protections;
- campaign eligibility snapshot and dispatch-time revalidation;
- queue fairness, backpressure, capacity and incident behavior;
- user-facing explanation of why an offer was recommended.

Required tests include:
- offers OFF means no promotional offer dispatch;
- withdrawal after campaign creation but before dispatch suppresses delivery;
- service notices remain correctly classified and are not used to disguise promotions;
- user cannot be discovered by a business when interest matching is disabled;
- businesses cannot enumerate named users or raw interests;
- changes to interests affect future matching according to a documented update contract;
- one-sided Maximum invitation does not activate expanded permissions;
- mutual acceptance activates only the specific pair;
- either party's revocation removes expanded permissions;
- block/report/security controls still override Maximum;
- a campaign cannot use Mutuality as a substitute for audience consent;
- high-throughput workloads preserve idempotency, recipient eligibility, fairness and ordinary-message service objectives.

## 7. Rollout and unresolved decisions

- Product direction is owner-approved; detailed implementation and rollout stage are not yet selected.
- Initial planning assumption: consent controls and a basic offers folder belong with Business campaigns in Stage 2; interest matching and advanced audience tools may require staged rollout; Mutuality requires its own UX/legal/security validation. Treat exact stage placement as OPEN until reconciled against the canonical plan and owner approval.
- Do not change the business-plan PDF or baseline as part of this feature-spec update.
- Do not select architecture, database, recommendation algorithm, analytics vendor or numerical sending limits in this document.
