# Jetson Messenger

Jetson Messenger is restarting from a technology-neutral discovery baseline. The **original business-plan PDF is the canonical product source** and must be preserved without edits.

## Canonical product source

- [Original business plan (PDF)](2_5197266343509931487_261123_112332.pdf) — authoritative source for product, business model, features, commercial assumptions and roadmap.
- [Verified business-plan baseline](docs/product/BUSINESS_PLAN_BASELINE.md) — structured from the complete 15-section, seven-page text supplied by the owner.
- [Product requirements and acceptance framework](docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md) — staged requirements and release gates.
- [User journeys](docs/product/USER_JOURNEYS.md) — personal user, business owner and recipient flows.
- [Master prompt](docs/governance/MASTER_PROMPT.md)
- [Installed agent skills and provenance](docs/governance/AGENT_SKILLS.md)
- [Loop Code Review skill](.agents/skills/loop-code-review/SKILL.md) — iterative independent code-review workflow
- [Branch strategy](docs/governance/BRANCHING_STRATEGY.md)
- [Repository and branch inventory](docs/governance/REPOSITORY_INVENTORY.md)
- [Repository landscape research method and progress](docs/research/REPOSITORY_LANDSCAPE_METHOD.md)
- [Jetson-specific repository evaluation criteria](docs/research/JETSON_REPOSITORY_EVALUATION_CRITERIA.md)
- [Architecture synthesis and decision log](docs/research/JETSON_ARCHITECTURE_SYNTHESIS.md)
- [Stack candidate screen and PoC gate](docs/research/STACK_CANDIDATE_SCREEN_AND_POC_GATE_2026-11-27.md)
- [Agent task 05 — comparable server-stack PoC](docs/agent/tasks/AGENT_TASK_05_STACK_POC.md)
- [Go durable-message core PoC report](docs/research/GO_DURABLE_MESSAGE_POC_REPORT_2026-11-27.md)
- [Three-stack delivery PoC status and preliminary benchmark](docs/research/POLYGLOT_MESSAGE_POC_STATUS_2026-11-27.md)
- [Agent task 01 — message reliability](docs/agent/tasks/AGENT_TASK_01_MESSAGE_RELIABILITY.md)
- [Agent task 02 — CRM and campaigns](docs/agent/tasks/AGENT_TASK_02_CRM_CAMPAIGNS.md)
- [Agent task 03 — security, licenses and operations](docs/agent/tasks/AGENT_TASK_03_SECURITY_LICENSES_OPERATIONS.md)
- [Consolidated discovery index — 1,185 candidates](docs/research/CONSOLIDATED_DISCOVERY_INDEX.md)
- [Initial README screening](docs/research/INITIAL_README_SCREENING.md)
- [Deep-dive backend comparison](docs/research/DEEP_DIVE_BACKEND_COMPARISON_01.md)
- [Deep-dive message delivery and persistence](docs/research/DEEP_DIVE_MESSAGE_DELIVERY_02.md)
- [Candidate scorecard template](docs/research/CANDIDATE_SCORECARD_TEMPLATE.md)
- [High-star projects and independent ratings](docs/research/POPULARITY_AND_RATINGS_TRACK.md)
- [Deep dive 03 — popular messaging platforms](docs/research/DEEP_DIVE_POPULAR_PRODUCTS_03.md)
- [Provisional visual direction](docs/design/VISUAL_DIRECTION_WORKING.md)

## Current status

**Requirements and discovery.** The owner's full business-plan text has been structured into staged requirements and user journeys. Repository landscape research continues. Isolated Go, Node.js/TypeScript and Kotlin/Spring message-core prototypes now pass the same PostgreSQL-backed delivery/reconnect contract and preliminary CI latency probe. These are comparison experiments only: no backend, language, framework, database, realtime transport, protocol, hosting provider, cryptographic library or client framework is selected. Detailed UI remains iterative.

Research up to 1,000 relevant public repositories in transparent tiers. No repository is adopted wholesale. Existing projects are learning sources only; choices require evidence and comparison against the business plan.

## Non-negotiable governance

The original business-plan PDF takes precedence over summaries, technical proposals, old prompts, previous implementations and assistant assumptions. If any discrepancy appears, record it and correct subordinate documents; do not silently alter the PDF or reinterpret its requirements.

Product scope, commercial model, user promises, release boundaries and roadmap may not be changed without explicit owner approval. Technical discovery must not silently change them.

Historical JuggleIM experiments, LansetSpBot reviews and earlier architecture proposals remain research evidence only, not mandatory foundations or production dependencies. Historical branches and commits are preserved.

Work on focused branches, never directly on `main`. No merge, deployment or release without explicit owner approval.
