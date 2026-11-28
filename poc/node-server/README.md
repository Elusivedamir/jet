# Node.js / TypeScript durable-message PoC

**Status:** isolated research PoC for the owner-approved Node.js + TypeScript backend direction; not production code or production-ready.

## Durable messaging contract

- PostgreSQL transaction covers sender-scoped idempotency, conversation sequence, message row and one outbox intent per recipient other than the sender.
- HTTP acceptance occurs after commit.
- Worker claims with FOR UPDATE SKIP LOCKED, expiring lease and fencing token.
- Dispatch atomically creates recipient inbox row and completes the outbox item.
- SSE endpoint resumes from Last-Event-ID or after; recipient acknowledgement is persisted separately.
- Retry uses bounded exponential delay and terminal failure after eight attempts.

## Account and session PoC

- Registration: `POST /v1/auth/register` with `username`, `password`, `display_name`.
- Login: `POST /v1/auth/login` with `username`, `password`.
- Current account: `GET /v1/me` with `Authorization: Bearer <access_token>`.
- Logout: `POST /v1/auth/logout` with the same Bearer token.
- Usernames are normalized to lowercase and restricted to 3–24 ASCII letters, digits or underscore. Passwords must be 12–128 characters; display names 1–48 characters.
- Passwords are salted and hashed with Node.js scrypt; plaintext passwords are never persisted. Sessions use 256-bit random opaque tokens; only SHA-256 token digests are stored. Sessions expire after 30 days and logout revokes the token.
- Access tokens are returned only at registration/login and must be treated as secrets by clients. This PoC uses Bearer tokens; it does not yet implement refresh tokens, device/session management, login throttling, password reset, email/phone verification, MFA or account recovery.

## Run

Requires Node.js 22.23.5, PostgreSQL 17+. The exact Node patch is pinned in `.nvmrc` and consumed by CI.

    export DATABASE_URL='postgres://jetson:jetson_test_only@localhost:5432/jetson_poc?sslmode=disable'
    npm ci
    npm test
    npm run build
    npm start

The service applies the PoC schema at startup. The legacy `X-Test-Account` identity shim is disabled by default and cannot be enabled when `NODE_ENV=production`. The isolated CI crash/contract harness opts in with `NODE_ENV=test` and `JETSON_ALLOW_TEST_IDENTITY=true`. This shim is not authentication and must never be enabled in a deployed environment.

## Messaging endpoints

- POST /v1/conversations/{id}/messages — JSON operation_key, payload and optional reply_to_message_id. Reply targets must be active messages in the same conversation; reply metadata is preserved in history and recipient inbox. Idempotent retries must repeat the same reply target.
- POST /v1/messages/{id}/forward with `{"target_conversation_id":"...","operation_key":"..."}` — forwards an active message the caller can read into a conversation they belong to. The new message is authored by the forwarding user and carries `forwarded_from_message_id`; the original sender is not impersonated. Idempotent retries must repeat the same source, destination and operation key.
- GET /v1/conversations/{id}/messages?after=0 — history.
- GET /v1/conversations/{id}/search?q=...&limit=20 — PostgreSQL full-text search within one conversation (2–128 characters, 1–50 results). Only current members can search; deleted messages are excluded. Search uses the `simple` text configuration and ranks matches before newest-position tie-breaking.
- GET /v1/conversations/{id}/events?after=0 — SSE stream.
- POST /v1/messages/{id}/ack — recipient acknowledgement.
- POST /v1/messages/{id}/read — recipient marks a delivered message as read; repeated calls are idempotent.
- GET /v1/messages/{id}/read-receipts — sender-only view of each recipient's delivery and read timestamp.
- GET /v1/messages/{id}/reactions — list emoji reaction counts and whether the caller reacted.
- POST /v1/messages/{id}/reactions with `{"emoji":"👍"}` — add a reaction.
- DELETE /v1/messages/{id}/reactions with `{"emoji":"👍"}` — remove the caller's reaction.
- Read receipts are distinct from delivery acknowledgements: an inbox row proves delivery, while a read receipt is written only after the recipient explicitly marks the message read. Reactions are unique per account/message/emoji and visible only to conversation members. Pins are conversation-scoped and visible only to members; this PoC does not yet introduce moderator-only pin permissions.
- PATCH /v1/messages/{id} with `{"payload":"corrected text"}` — sender-only edit; allowed for 15 minutes after sending.
- DELETE /v1/messages/{id} — sender-only soft delete; allowed for 15 minutes after sending. The message remains in history as a deleted placeholder and its reactions are removed.
- GET /v1/conversations/{id}/updates?after=0 — durable per-recipient edit/delete event feed with an independent monotonic event cursor. Poll this endpoint after reconnect to synchronize changes without relying on the message-position cursor.
- POST /v1/conversations/{id}/pins with `{"message_id":"..."}` — pin an active message in that conversation. Any current member may pin; the PoC caps a conversation at 50 pins and repeated pin requests are idempotent.
- GET /v1/conversations/{id}/pins — list pinned messages and pin metadata for members.
- DELETE /v1/conversations/{id}/pins/{message_id} — unpin a message; repeated removal is harmless. Deleting a message also clears its pin.
- Edits store prior payload versions in message_versions. Delete-for-everyone purges all stored versions for that message, clears reactions and pins, and appends a tombstone event for each current conversation member in the same PostgreSQL transaction. Edit/delete events are not conflated with delivery acknowledgements or new message positions.

Direct and multi-recipient conversation fan-out are supported by this PoC. Request bodies are JSON-only, size-limited and validated; malformed JSON and invalid cursors return 400. No production rate limiting, versioned migrations, E2EE, sustained-load evidence or release readiness is claimed. Committed npm v3 `package-lock.json`; CI installs with `npm ci` and checks that package manifests remain unchanged. Dependency vulnerability/license review is generated in CI and must still be reviewed.

## Channels

- Create a public or private channel: `POST /v1/channels` with `title`, unique `slug`, `visibility` and optional `description`.
- Public channel discovery: `GET /v1/channels/search?q=jet`. Private channels never appear in search.
- Join a public channel: `POST /v1/channels/{slug}/join`. Join a private channel with the one-time invite code returned at creation: `POST /v1/channels/{slug}/join` with `{"invite_code":"..." }`.
- Subscribers can leave a channel with `DELETE /v1/channels/{slug}/membership`; the owner cannot leave and orphan the channel.
- The creator is the channel owner. The owner may promote a current subscriber to admin: `POST /v1/channels/{slug}/admins` with `{"username":"bob"}`.
- Owners and admins can publish. Subscribers can read the channel and receive durable fan-out but cannot publish. Channel posts use the same transactional outbox and recipient inbox as other conversations.
- Private invite codes are high-entropy random values; only their SHA-256 digests are stored. The raw code is returned once at creation.

## Business CRM foundation (PoC)

- Add an existing accepted contact to the business user's CRM: `POST /v1/business/customers` with `{"username":"bob"}`.
- List the authenticated business user's customer cards: `GET /v1/business/customers`. Each card includes the linked Jetson person, current status and stable direct-conversation ID when one exists.
- Change a card status: `PATCH /v1/business/customers/{customer_id}` with `{"status":"follow_up"}`. Supported statuses: `new`, `active`, `follow_up`, `customer`, `archived`.
- Add an internal note: `POST /v1/business/customers/{customer_id}/notes` with `{"body":"Call back next Tuesday"}`.
- List notes: `GET /v1/business/customers/{customer_id}/notes`.
- Customer cards can only be created for accepted contacts. Customer and note queries are scoped to the authenticated business account; another account cannot read or modify the card.
- This is the first CRM data slice only. Business subscription entitlement, team roles, custom fields, segmentation, campaigns and billing are not implemented. Consent and recipient preference controls are documented separately below. No campaign dispatch is exposed by this API.

## Business campaign drafts and audience preview (PoC)

- Create a draft only: `POST /v1/business/campaigns` with JSON `{"title":"Spring update","body":"Draft message text"}`. Title is 1–100 characters; body is 1–4000 characters.
- List drafts owned by the authenticated business account: `GET /v1/business/campaigns`.
- Edit an owned draft only while its status is `draft`: `PATCH /v1/business/campaigns/{campaign_id}` with JSON `{"title":"Updated title","body":"Updated message"}`. Once enqueue has started, the draft is immutable.
- Preview a draft's CRM audience: `GET /v1/business/campaigns/{campaign_id}/preview`. The response separates eligible and excluded recipients and gives exclusion reasons: `global_preference_off`, `business_consent_missing`, `contact_not_accepted`, `direct_conversation_missing`, or `crm_customer_archived`.
- Read a campaign's current durable dispatch summary: `GET /v1/business/campaigns/{campaign_id}/status`. The response is scoped to the authenticated business owner and reports campaign state plus per-job counts (`queued`, `processing`, `delivery_pending`, `sent`, `skipped`, `failed`, `cancelled`, `total`) and the most recent job update time. It is read-only and does not enqueue or retry work.
- Cancel an owned campaign: `DELETE /v1/business/campaigns/{campaign_id}`. Cancellation is idempotent. Queued jobs are cancelled immediately; a leased job that has not passed the worker's final campaign-state check is fenced from starting. The send transaction and cancellation serialize on the campaign row: whichever obtains its lock first defines whether a new message can commit. A send already committed or already handed to the delivery outbox may still complete; the response reports the number of such in-flight jobs.
- Preview is a point-in-time estimate, not a reservation or send authorization. Consent may change immediately afterward; the internal dispatcher's message transaction rechecks and locks eligibility before creating durable delivery intents, and the delivery worker checks again before inbox insertion.
- Campaigns remain draft/preview-only over HTTP: there is no enqueue, schedule, send, retry or external-channel endpoint. An internal CampaignStore.enqueueDraft primitive creates durable per-recipient jobs transactionally, but fails closed unless a business_entitlements.campaigns_enabled=true row exists; no public endpoint or billing/admin path can activate it. The server runs an internal campaign worker: it claims one job per iteration with a 60-second lease and a per-job fencing token, reserves a token from a PostgreSQL-backed per-business dispatch budget shared across worker instances (default burst 10, refill one dispatch per second), marks the campaign `sending`, calls the existing Store.send business_offer path with a stable campaign/recipient operation key, retries transient failures with exponential backoff (terminal after eight attempts), and backs off up to 15 seconds when infrastructure iterations fail. Replaying the same enqueue key remains idempotent while the campaign is queued, sending or completed. The send transaction and delivery worker both recheck recipient preference, per-business consent and accepted contact. A job is counted sent only after the recipient inbox delivery completes. Recipients without a direct conversation and CRM customers marked archived are explicitly excluded in preview and enqueue counts. Billing/entitlement activation, public confirmation UX, campaign scheduling, global platform-wide rate caps and abuse controls remain prerequisites; there is still no public enqueue/send endpoint. See CAMPAIGN_DISPATCH_DRAFT.md for implemented-vs-pending boundaries.

## Contacts and personal conversations

- Search users by username or display-name prefix: `GET /v1/users/search?q=bo` (minimum two characters; results are limited to 20 and exclude the current account).
- Send a contact request by username: `POST /v1/contacts/requests` with `{"username":"bob"}`.
- List pending requests: `GET /v1/contacts/requests` returns separate `incoming` and `outgoing` arrays.
- Accept an incoming request: `POST /v1/contacts/requests/{request_id}/accept`. Only its recipient may accept it.
- Decline an incoming request: `POST /v1/contacts/requests/{request_id}/decline`. Only its recipient may decline it.
- List accepted contacts: `GET /v1/contacts`.
- List personal conversations for the inbox: `GET /v1/conversations`. Rows distinguish direct and group conversations and include peer or group title, member count, latest-message preview/time and current conversation position.
- Create a group from accepted contacts: `POST /v1/conversations/groups` with `{"title":"Project team","usernames":["bob","carol"]}`. The creator and 1–50 distinct accepted contacts become members in one transaction.
- Rename a group (creator only): `PATCH /v1/conversations/{conversation_id}` with `{"title":"Project team v2"}`.
- Add accepted contacts (creator only): `POST /v1/conversations/{conversation_id}/members` with `{"usernames":["dave"]}`.
- Remove a member (creator only): `DELETE /v1/conversations/{conversation_id}/members/{username}`.
- Leave a group: `DELETE /v1/conversations/{conversation_id}/membership`. The creator cannot leave and orphan the group.
- Get the existing personal conversation with an accepted contact: `POST /v1/conversations/direct` with `{"username":"bob"}`.
- Accepting a request atomically creates the normalized contact pair and a single stable direct-conversation ID with both participants as members. Repeated direct-conversation lookup returns the same conversation.
- Self-add, unknown users, duplicate accepted contacts and attempts to accept another person's request are rejected. A reverse pending request is surfaced instead of creating a confusing duplicate.
- Search exposes only public username/display-name fields; contact and request endpoints require an authenticated account.

These endpoints are still part of the isolated PoC. Blocking/reporting, declined-request notifications and history UX, privacy controls, discovery ranking, abuse throttling and production migrations remain future work.



## Recipient inbox folders (PoC)

- GET /v1/me/inbox?folder=primary&limit=50 lists the authenticated recipient's primary inbox; use folder=business_offers for the separate business-offer folder.
- Both folders are recipient-scoped. The cursor is the pair before_created_at and before_message_id; provide both or neither. Pages are ordered newest first with a stable timestamp-plus-ID cursor.
- Ordinary messages are assigned to primary. Only internally classified business_offer messages are routed to business_offers; the public message-send endpoint does not accept a message class. The internal send path permits an offer only to one recipient in a direct conversation, and checks accepted contact, master preference and current per-business consent inside the same transaction that writes the message and outbox intent.
- This folder is routing infrastructure, not an outbound campaign feature. Campaign drafts, audience previews, status summaries and campaign cancellation are available, but no mass-campaign enqueue or dispatch endpoint exists. A cancelled business offer is hidden from recipient history, search, conversation preview, reactions, pins, forwards and event feeds until it has a durable recipient-inbox row.

## Business offer preferences and consent foundation (PoC)

- `GET /v1/me/business-offers` returns the recipient's master preference. It is **off by default**.
- `PUT /v1/me/business-offers` with `{"enabled":true|false}` changes that master preference.
- `GET /v1/me/business-consents` lists the authenticated recipient's per-business consent state.
- `PUT /v1/me/business-consents` with `{"business_account_id":"...","granted":true|false}` records or revokes explicit consent for one accepted contact. Only the recipient's authenticated account can perform the change.
- The master preference is only a global gate; enabling it does not grant consent to any business. Granting per-business consent is rejected while the master preference is off.
- Turning the master preference off revokes all active per-business grants and writes consent audit events; the current API has no event-update or event-delete operation. Turning it back on does not resurrect those grants.
- `ConsentStore.isEligibleForBusinessOffers` checks the master preference, current per-business grant and accepted-contact relationship together. `lockEligibilityForDispatch` takes locks in preference -> consent -> contact order for future campaign enqueue transactions. The message send path uses the same order. The delivery worker re-checks those conditions under locks immediately before inserting into the recipient inbox; if consent, the master preference or the contact has been removed after enqueue, the outbox item is marked `cancelled` and is not delivered. Idempotent retries of an already-created send return the original message and do not enqueue a duplicate.
- Campaign drafts and audience previews exist, but no campaign enqueue/dispatch endpoint or mass-send UI is exposed. Business subscription entitlement, legal compliance determination and market-specific retention policy are not implemented.
