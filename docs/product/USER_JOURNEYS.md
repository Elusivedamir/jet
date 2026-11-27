# Jetson Messenger — user journeys and acceptance scenarios

**Status:** First-pass user journeys derived from the approved business plan. They define intended outcomes, not a final UI or technical implementation. Exact fields, screens and policies marked OPEN require later product decisions.

## 1. Personas and core jobs

### Personal user
Wants to register and communicate without configuring business tools or paying.

### Small-business owner / self-employed professional
Wants to use the same personal account to organize customer conversations, understand customer status, send relevant consent-based campaigns and see results.

### Customer / recipient
Wants to receive useful messages only with appropriate consent, understand who is contacting them and unsubscribe or adjust preferences easily.

### Growing business operator
Wants to manage larger audiences, segment customers, schedule campaigns and monitor delivery and cost. Advanced team permissions are OPEN.

## 2. Journey A — first use of free messenger (Stage 1)

**Goal:** a new user reaches a useful conversation quickly.

1. Opens Jetson Messenger.
2. Registers or signs in.
3. Completes or skips optional profile details according to the eventual profile policy.
4. Sees clear primary actions: start communication, create chat, create channel and discover Business without being forced into it.
5. Starts a private conversation or creates a basic chat.
6. Sends a message.
7. Sees an understandable state if the message is sending, sent, failed or needs retry.
8. Receives a reply and can continue the conversation.

**Acceptance scenarios**
- A successful send is persisted and appears to sender and recipient.
- A temporary network failure does not falsely report success.
- Retrying after an uncertain outcome does not create unintended duplicate messages.
- Reopening the app restores the conversation according to the documented sync contract.
- A free user can complete the journey without starting a trial or entering payment details.

**OPEN:** registration methods, contact discovery, profile fields, message state vocabulary, offline behavior, edit/delete, attachments, read receipts and E2EE scope.

## 3. Journey B — create a chat or channel (Stage 1)

**Goal:** user can initiate a shared communication space.

1. Chooses «Создать чат» or «Создать канал».
2. Provides the minimum information required by the eventual product policy.
3. Selects participants or audience where applicable.
4. Confirms creation.
5. Sees the new space and can use the capabilities supported in the first release.

**Acceptance scenarios**
- Chat and channel are distinct, clearly labelled creation paths.
- The user receives clear validation for missing/invalid input.
- Unauthorized users cannot change settings or content they do not control.

**OPEN:** channel visibility/discovery, public/private modes, posting rights, roles, moderation, participant limits and channel-specific features.

## 4. Journey C — understand and activate Jetson Business (Stage 2)

**Goal:** personal user understands the value and activates Business without creating another account.

1. Selects «Перейти на бизнес-аккаунт» / «Попробовать Business».
2. Sees included capabilities: CRM, campaigns, KPI, premium business profile and AI assistant.
3. Sees trial duration (up to 7 days), reference/actual price, billing frequency, first charge date, auto-renewal and cancellation instructions.
4. Explicitly accepts auto-renewal and provides a payment method if the trial is configured to convert automatically.
5. Business capabilities become available on the existing personal account.
6. Receives a reminder before trial expiry.
7. Continues the subscription or cancels before the first charge.

**Acceptance scenarios**
- No recurring charge occurs without explicit advance consent and a payment method.
- Price, date and cancellation route are visible before consent.
- Cancellation is accessible and produces a clear confirmation.
- Business activation does not create a second identity/account.
- Failure to pay does not silently corrupt or delete the personal messenger account.

**OPEN:** payment provider, grace period, failed payment, refund, tax display, app-store rules and post-cancellation access/data retention.

## 5. Journey D — learn Business safely in demo mode (Stage 2)

**Goal:** prospective subscriber sees the value without risking unsolicited messages.

1. Opens the Business demo.
2. Enters a clearly labelled virtual customer base.
3. Opens customer cards and views sample history, notes and statuses.
4. Creates or edits a segment.
5. Prepares a campaign using a template.
6. Schedules or previews the campaign.
7. Inspects sample KPI/report output.
8. Exits demo without any real recipient being contacted.

**Acceptance scenarios**
- Demo recipients and records are unmistakably synthetic.
- Demo actions cannot enqueue or dispatch real messages.
- Demo data is isolated from the user's real CRM unless an explicit import/copy action is later approved.
- Demo reports are labelled as sample data.

## 6. Journey E — manage a customer in CRM (Stage 2)

**Goal:** business owner keeps context around a customer conversation.

1. Opens an existing conversation.
2. Opens or creates the linked customer card.
3. Reviews available conversation history.
4. Adds a note.
5. Assigns a status.
6. Adds the customer to a segment, or the customer qualifies through a defined segment rule.
7. Returns to the conversation without losing context.

**Acceptance scenarios**
- A customer card is linked to the correct person/account under a documented identity rule.
- Notes and statuses are visible only to authorized business account users.
- Changes are persisted and survive restart.
- Segment membership can be explained from the configured rule.

**OPEN:** exact CRM fields, identity matching, duplicate customer merge, status taxonomy, team access and data import/export.

## 7. Journey F — prepare and send a consent-based campaign (Stage 2)

**Goal:** business user contacts an eligible audience inside Jetson.

1. Opens campaign creation.
2. Chooses an eligible customer segment or list.
3. Chooses service or promotional campaign classification.
4. Creates content from scratch or a template.
5. Reviews audience size and exclusions.
6. System rechecks consent, preferences, unsubscribe and suppression immediately before dispatch.
7. User sees audience, content, expected volume and estimated delivery time.
8. User confirms send or schedules the campaign.
9. Campaign enters a durable queue and progresses through visible states.
10. User can inspect success, partial failure, retries and terminal failures.

**Acceptance scenarios**
- A recipient without the required consent is excluded.
- An unsubscribed recipient is excluded even if they were in the selected segment earlier.
- A preference change between campaign creation and dispatch is respected.
- Retry/replay does not unintentionally duplicate user-visible sends.
- Campaign state survives worker restart.
- User can distinguish queued, processing, accepted/sent, delivered, failed and unknown states according to documented semantics.
- External email/SMS/other-messenger routes are not offered in the first release.

**OPEN:** legal consent evidence, campaign approval thresholds, rate defaults, cancellation/editing after schedule, time zones, quiet hours, rate caps and provider semantics.

## 8. Journey G — recipient controls preferences and unsubscribes (Stage 2)

**Goal:** recipient remains in control of business communication.

1. Receives a business message.
2. Can identify the sender and message category.
3. Opens preferences or unsubscribe.
4. Chooses to stop all relevant marketing messages or adjust available message categories.
5. Receives a clear confirmation.
6. Future campaigns check the updated state before sending.

**Acceptance scenarios**
- The opt-out path is understandable and not hidden behind unnecessary steps.
- The suppression state takes effect before the next eligible campaign dispatch.
- Service notifications and promotional messages are governed separately.
- The platform records sufficient evidence of preference changes without exposing it unnecessarily.

**OPEN:** exact categories, legal basis, re-consent process and treatment of legally required service notices.

## 9. Journey H — review campaign performance (Stage 3)

**Goal:** business owner understands what happened after a campaign.

1. Opens a completed or active campaign report.
2. Reviews delivery, read, replies, link clicks where applicable, conversions and trends.
3. Opens metric definitions or explanations.
4. Compares campaigns or time periods.
5. Uses the findings to adjust segments, content or timing.

**Acceptance scenarios**
- Every displayed metric has a documented definition and source event.
- A queued or provider-accepted message is not falsely counted as delivered.
- Read/click/conversion metrics are only shown where reliably measurable and legally permitted.
- Partial data and delayed event ingestion are disclosed.
- AI-generated interpretation is labelled as assistance, not an authoritative metric.

## 10. Journey I — use AI assistant inside Business (Stage 3)

**Goal:** business owner receives help with everyday business communication.

1. Opens the included Business AI assistant.
2. Requests a draft, customer reply, campaign idea or analysis.
3. Reviews and edits the suggested content.
4. Chooses whether to copy it into a message/campaign.
5. Sends only after the usual consent and campaign controls are applied.

**Acceptance scenarios**
- AI does not send a campaign or contact recipients without explicit user action.
- AI suggestions cannot bypass consent, unsubscribe or permission checks.
- User is informed what data is sent to an external model, if any, under the eventual privacy policy.
- AI usage is measured and governed by cost controls while remaining included in base Business.

**OPEN:** model/provider, data retention, training policy, context access, usage limits and fallback behavior.

## 11. Journey J — operate a large campaign (Stage 4)

**Goal:** growing business can reach large consenting audiences without losing control.

1. Defines a segment and campaign.
2. Reviews eligible audience, consent exclusions and estimated volume.
3. Chooses a permitted sending rate.
4. Schedules or starts campaign.
5. Monitors queue progress, throughput, delivery latency, errors, retries and cost.
6. Pauses/cancels where the future policy permits.
7. Reconciles final report and unresolved outcomes.

**Acceptance scenarios**
- Throughput is measured under a documented workload and reliability target.
- Queue pressure does not impair ordinary one-to-one messaging beyond an agreed service objective.
- Backpressure and rate control prevent uncontrolled overload.
- Restart and dependency failure do not lose campaign progress or cause uncontrolled duplicate sends.
- Published capacity claims never exceed reproducible test evidence.

**OPEN:** numerical capacity, latency, availability, RPO/RTO, per-account fairness, priority policy and large-campaign cancellation semantics.

## 12. Journey-to-stage map

| Journey | Stage |
|---|---|
| A — free first use | 1 |
| B — create chat/channel | 1 |
| C — activate Business | 2 |
| D — safe Business demo | 2 |
| E — CRM customer workflow | 2 |
| F — consent-based campaign | 2 |
| G — recipient preferences | 2 |
| H — campaign analytics | 3 |
| I — AI assistant | 3 |
| J — large-scale campaign | 4 |

## 13. Product decisions deliberately not made here

These journeys do not settle technology, backend topology, database, transport, protocol, cryptography, hosting, AI provider, detailed UI design, exact CRM schema, payment provider, launch countries or numerical SLOs. Those decisions require evidence, user research, legal review or explicit owner approval.


## 14. Journey K — opt into useful Business Offers (Stage 2 candidate)

**Goal:** user can discover relevant work, education, services and practical opportunities without exposing the personal inbox to unsolicited promotion.

1. Opens communication preferences.
2. Reviews the explanation of "Разрешить предложения от бизнеса".
3. Chooses whether to enable it; it is OFF by default.
4. Separately chooses whether selected interests may be used for personalized Business matching.
5. Opens the separate "Предложения" folder when an eligible offer arrives.
6. Sees the business sender, promotional label and reason/category for the recommendation.
7. Can save, hide, mark "not interested", report/block or adjust preferences.
8. Can disable Business Offers at any time.

**Acceptance scenarios**
- No promotional offer is dispatched while the relevant consent is OFF.
- Withdrawal between campaign scheduling and dispatch prevents the send.
- Offers never appear as personal messages or masquerade as service/security notices.
- The user can withdraw consent without unnecessary friction.
- Employment, education and life-improvement language is not a guarantee of results.

## 15. Journey L — choose interests and receive relevant recommendations

**Goal:** user controls topics used to personalize recommendations and Business matching.

1. Selects topics from a clear interest catalogue.
2. Adds/removes topics or resets the profile later.
3. Chooses whether interests may be used for Business audience matching.
4. Receives recommendations based primarily on explicit interests.
5. Opens an explanation of why a particular offer was recommended.
6. Hides irrelevant content or marks "not interested".
7. Pauses personalization or clears interests when desired.

**Business-side flow**
1. Business subscriber creates a campaign audience.
2. Selects permitted interest categories and other approved eligibility criteria.
3. Sees a privacy-protected audience estimate and exclusions, not a named-user list.
4. Reviews content, category and estimated volume.
5. System rechecks Business Offers consent, interest-matching permission, unsubscribe and suppression immediately before dispatch.

**Acceptance scenarios**
- Disabling interest matching removes the user from future eligible audiences.
- Businesses cannot enumerate named users or export raw interests.
- Sensitive traits are not inferred or targetable.
- Small audience cohorts cannot reveal an individual's interest profile.
- Consent changes after scheduling are honored at dispatch.

## 16. Journey M — establish Mutuality between two accounts

**Goal:** two people voluntarily establish expanded pairwise communication permissions.

1. Both accounts start in "Базовый".
2. One party invites the other to "Максимум" and sees a clear explanation of the change.
3. The other party independently accepts or declines.
4. Maximum becomes active only after bilateral acceptance; both parties can see its status.
5. The pair can communicate at higher frequency without ordinary pairwise limits while Maximum remains active.
6. Either party can revoke Maximum at any time; future sends return to Base/default rules.
7. Either party can still block/report the other; those controls override Mutuality.

**Acceptance scenarios**
- One-sided invitation never activates Maximum.
- Acceptance applies only to the two named accounts and cannot be inherited by a group or campaign.
- Revocation immediately prevents future sends that rely on Maximum.
- Mutuality does not grant Business campaign consent.
- Employers cannot silently activate it or require it as a condition of employment, wages or essential access.
- Security, legal and anti-abuse protections remain active in both modes.

## 17. Journey-to-stage map additions

| Journey | Stage |
|---|---|
| K — Business Offers opt-in | Stage 2 candidate |
| L — interests and recommendations | Stage placement OPEN |
| M — Mutuality | Stage placement OPEN |

