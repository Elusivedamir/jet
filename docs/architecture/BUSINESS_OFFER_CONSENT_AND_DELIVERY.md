# Business-offer consent and delivery boundary

**Status:** implemented in the Node.js/TypeScript research PoC; not production-ready.  
**Last verified Node revision before this follow-up:** `cd6012f5d213e2ccb18f3e835b63ff028d2aedb0`. The recipient-visibility hardening in the current branch head requires fresh CI evidence.

## Purpose

Business offers are not ordinary chat messages. They require two independent recipient-controlled permissions and an accepted-contact relationship. They appear in a separate inbox folder, and revocation must win if it commits before delivery. A draft or audience preview never sends a message.

## Eligibility invariants

A business offer is eligible only when all of the following hold:

1. Sender and recipient are accepted contacts.
2. The conversation is the stable direct conversation for that exact account pair.
3. There is exactly one recipient other than the sender; group/channel fan-out is rejected.
4. The recipient's master `business_offer_preferences.enabled` flag is true.
5. The recipient has a current `business_consent_state` grant for this business account.
6. Only the recipient's authenticated account can change their preference or consent.

The master preference defaults to off. Enabling it does not grant consent to any business. Turning it off revokes current per-business grants; turning it on later does not restore them.

## Transaction and lock order

The internal `Store.send(..., "business_offer")` path checks eligibility inside the same PostgreSQL transaction that writes the message and its outbox intent. It checks accepted-contact existence before reading preference state, avoiding disclosure of a non-contact's preference. It then locks rows in this order:

1. recipient master preference;
2. per-business consent state;
3. accepted-contact row.

Consent mutations and dispatch use the same order. Preference and consent rows are locked for update; the contact row is held with `FOR KEY SHARE`. The locks remain held through the relevant state change or message/outbox commit.

The outbox worker repeats eligibility at the delivery boundary, before inserting the recipient inbox row. If preference is disabled, consent is revoked/missing, the contact is removed, or the message was deleted before delivery, the outbox row moves to `cancelled` and no recipient inbox row is created.

Race rule: if dispatch obtains the permission locks first, delivery may commit before a later opt-out; if the opt-out obtains the locks first, dispatch sees the new state and cancels. An earlier audience preview never authorizes delivery.

## Idempotency

Sender-scoped `operation_key` is checked before eligibility on retry. If the original message transaction already committed, an identical retry returns the original message and does not create another message or outbox intent—even if consent has since been revoked. A new operation key must pass current eligibility. A retry with changed payload, conversation, reply/forward target or message class conflicts.

## Recipient visibility rule

An outbox row is not proof that a recipient can read a message. For `business_offer`, recipient visibility begins only when a durable `recipient_inbox` row exists for that recipient. Until then, recipient-facing history, search, conversation previews, reactions, pins, forwarding and event feeds must not expose the message. The sender may still see their own sent message.

This distinction is essential because the message row and outbox intent are committed before asynchronous delivery. Merely changing the outbox state to `cancelled` does not remove the message row. Every recipient-facing query must therefore enforce the inbox-row visibility predicate, not rely on the outbox state alone.

## Inbox routing

- `standard` messages route to `primary`.
- `business_offer` messages route to `business_offers`.
- The public message-send endpoint does not accept a client-controlled message class.
- The separate folder API is recipient-scoped and uses a stable timestamp/message-ID cursor.

## Campaign draft boundary

The current campaign API supports only draft creation, draft listing and audience preview. Preview is a point-in-time estimate. There is no campaign enqueue, schedule, send, retry or mass-send endpoint. Any future campaign dispatcher must create one durable job per eligible recipient, recheck and lock current consent when enqueuing, recheck again at actual delivery, use stable per-campaign/per-recipient idempotency, and cancel jobs that lose eligibility before delivery. External email, SMS, third-party channels and public outbound APIs are out of scope for this PoC.

## Current limitations

This is a research PoC, not a legal compliance determination or production consent-management system. Subscription entitlement/billing, rate caps, sender abuse controls, policy versioning/renewal, user notifications, privacy retention/deletion policy and production migration discipline remain open. Audit events are append-only through the current application API but are not claimed to be tamper-proof against database administrators.

## Verification

Existing tests cover master preference default-off, explicit per-business grants, accepted-contact requirements, recipient-only authorization, revocation on master opt-out, no automatic restoration, transaction-locked eligibility, rejection of ineligible direct sends, group rejection, idempotent retry after revocation, and cancellation when consent or the master preference is revoked before dispatch.

The recipient-visibility regression test additionally asserts that a cancelled offer is absent from recipient history and search, cannot be forwarded or reacted to, and is absent from recipient pin results. The exact current-head CI run is the authority for pass/fail status; do not infer a green build from this document.
