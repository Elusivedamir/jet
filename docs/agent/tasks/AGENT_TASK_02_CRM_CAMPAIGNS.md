# Agent task 02 — CRM, consent-aware campaigns and analytics references

**Mode:** research only. Do not implement or select a technology.

## Authority and constraints
Read the current master prompt, verified business-plan baseline, product requirements, user journeys and Jetson repository evaluation criteria before research. Product requirements are binding. Jetson campaigns in the first release are internal to Jetson; email, SMS and other external messengers are explicitly out of first-release scope. Do not propose bypassing consent, unsubscribe or suppression. Do not change product scope or edit application code. No changes to `main`.

## Research assignment
Study open-source projects as independent references for specific workflows, not as candidates to copy wholesale:
- Chatwoot (`chatwoot/chatwoot`) — customer conversation context, contact records, inbox/identity linking, notes, segmentation or automation boundaries.
- Twenty CRM (`twentyhq/twenty`) — customer data model, relationships, activity timeline, permissions and extensibility.
- Listmonk (`knadh/listmonk`) — consent/subscriber preferences, audience segmentation, campaign lifecycle, scheduling, unsubscribe, suppression and analytics. It is an email-focused product: extract transferable patterns only and clearly mark email-specific parts as non-goals for Jetson v1.
- Mautic (`mautic/mautic`) — campaign orchestration, segmentation, consent/preferences and attribution; assess complexity and license/operational costs.
- If a more directly relevant internal messaging/campaign implementation is found, add at most two alternatives with justification.

## Questions to answer
1. What is the canonical data model for customer/person/contact and how is it linked to conversations?
2. How are notes, statuses, activity history and segments represented?
3. How are consent evidence, preferences, unsubscribe and suppression stored?
4. Is recipient eligibility checked at campaign creation, scheduling, dispatch, or multiple points?
5. How are retries and duplicate sends prevented?
6. What campaign states, queue states, scheduling and rate controls exist?
7. Which KPI events are recorded, and what do delivered/read/click/reply/conversion actually mean?
8. What access controls prevent one business user seeing another's CRM data?
9. What are the license, maintenance, security and operational requirements?
10. Which concepts are simple enough for Jetson's Stage 2, and which belong later?

Inspect source and tests for important claims. Pin exact commit SHAs. Cite source paths and permalink URLs. Distinguish observed code from docs, vendor claims and inference. Do not invent legal conclusions; list country-specific legal questions as unresolved.

## Deliverable
Create `docs/research/AGENT_REPORT_CRM_CAMPAIGNS.md`:
- comparison table by capability;
- entity/data-model diagrams in Mermaid if helpful;
- campaign lifecycle and consent enforcement sequence;
- failure/abuse cases;
- metric definitions and limitations;
- exact licensing boundaries and maintenance notes;
- Jetson requirement traceability (CRM-001–004, CAM-001–008, KPI-001–006);
- minimal Stage 2 capability set vs later-stage features;
- unresolved decisions and recommended next source-level audits.

Do not write application code. Do not recommend external email/SMS channels for Jetson v1.
