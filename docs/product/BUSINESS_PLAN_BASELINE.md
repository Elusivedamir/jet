# Jetson Messenger — approved business-plan baseline

**Purpose:** preserve the owner's approved product direction while technical discovery restarts.  
**Authority:** this document records approved product facts and open business questions. It does not choose software architecture, infrastructure, vendors, or implementation technology.

## 1. Product concept

[СОГЛАСОВАНО] Jetson Messenger is a messenger with free core communication and an optional paid Jetson Business subscription attached to a person's regular Jetson account. It combines communication with customer relationship and sales-development tools in one product.

Slogan: **«Свобода наконец-то и в бизнесе».**

Supporting message: **«Общайтесь с клиентами, управляйте базой и развивайте продажи в одном мессенджере».**

A separate company account is not required for Jetson Business.

## 2. Free messenger

[СОГЛАСОВАНО] Free core functionality includes:
- registration and personal profile;
- direct/private messages;
- chats;
- channels.

Basic communication does not require Jetson Business.

## 3. Jetson Business subscription

[СОГЛАСОВАНО] Jetson Business is an optional paid subscription attached to the user's personal Jetson account.

**Price reference:** approximately USD 5/month. This is an orientation, not a final approved price or payment commitment.

Included product areas:

### CRM
- customer cards;
- interaction history;
- notes;
- statuses;
- basic segmentation.

### Campaigns and messaging
- campaign creation;
- templates;
- scheduling;
- reports.

### KPI and analytics
Candidate business measures already included in the approved concept:
- delivered;
- read;
- replies;
- clicks/transitions;
- conversions;
- metric trends.

Exact formulas, attribution rules and definitions remain open.

### Business profile
Premium visual presentation and additional profile capabilities.

### AI assistant
Included in Jetson Business, not a separate paid tier. AI usage limits, provider, unit economics and acceptable use remain open.

## 4. Trial

[СОГЛАСОВАНО] Trial duration: up to 7 days.

Before activation, the user must explicitly consent to auto-renewal and provide a payment method. The product must clearly disclose:
- subscription price;
- date of the first charge;
- billing frequency;
- how to cancel.

A reminder must be sent before the trial ends.

The trial concept includes:
1. Demonstration using a virtual customer database.
2. Limited real sending only to recipients who have explicitly consented to receive those messages.

Exact billing, reminder, cancellation, failed-payment and refund rules remain open.

## 5. Consent and anti-abuse

[СОГЛАСОВАНО] Campaigns may only be sent to recipients who have consented to receive the relevant messages.

The product must support:
- unsubscribe;
- exclusion of unsubscribed recipients from later campaigns;
- separation of service and promotional messages;
- complaint monitoring;
- abnormal-activity controls.

Do not promise unlimited throughput, immunity from blocking, or absence of platform restrictions. Sending capacity must be established through testing and applicable rules.

## 6. First-release boundaries

[СОГЛАСОВАНО] The first release operates inside Jetson Messenger.

Out of scope for the first release:
- email campaigns;
- SMS campaigns;
- campaigns through external messengers;
- public API;
- full developer portal.

API and developer documentation are considered after launch.

## 7. Initial entry actions and audience

[СОГЛАСОВАНО] Initial actions:
- «Начать общение»;
- «Перейти на бизнес-аккаунт»;
- «Создать канал»;
- «Создать чат».

Target segments:
- small businesses;
- online stores;
- service companies;
- professionals;
- community creators.

## 8. Product stages

[СОГЛАСОВАНО] The approved sequence:
1. Messenger core.
2. Jetson Business.
3. Analytics and AI.
4. Scaling, API and documentation.

Do not reorder these stages without the owner's approval.

## 9. Revenue arithmetic

The simple reference arithmetic is USD 5 × number of paying subscribers, before payment fees, taxes, infrastructure, AI, support and other expenses. This is not a validated revenue or profit forecast.

## 10. Open business questions — do not invent answers

- Launch countries, data residency and applicable legal requirements.
- Final subscription price and payment methods, including app-store/web payment availability.
- Auto-renewal, trial conversion, reminders, cancellation, failed payments and refunds.
- AI provider, allowed use, limits and cost.
- Capacity, latency, availability and scale targets.
- Exact CRM fields, statuses, segmentation and KPI formulas.
- Team, delivery timeline, operating/support model and development budget.
- Infrastructure cost, storage and message-delivery unit economics.
- Business team/seat model and role permissions.
- Data retention, account deletion and recovery.
- Exact E2EE scope and UX. Do not assume an unresolved security/product decision is settled.

## 11. Change control

Product scope, pricing, trial terms, user promises, launch stages and first-release exclusions may not be changed by the assistant or an agent without explicit owner approval.

Every proposal must be labelled [ПРЕДЛОЖЕНИЕ], every unresolved matter [ВОПРОС] or [НЕ СОГЛАСОВАНО], and every confirmed owner decision [СОГЛАСОВАНО].
