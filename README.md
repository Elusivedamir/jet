# Jetson Messenger

Jetson Messenger is restarting from a technology-neutral discovery baseline. The **original business-plan PDF is the canonical product source** and must be preserved without edits.

## Canonical product source

- [Original business plan (PDF)](2_5197266343509931487_261123_112332.pdf) — authoritative source for product, business model, features, commercial assumptions and roadmap.
- [Verified business-plan baseline](docs/product/BUSINESS_PLAN_BASELINE.md) — structured from the complete 15-section, seven-page text supplied by the owner on 2026-11-23; the original PDF remains preserved as the source artifact.
- [Product requirements and acceptance framework](docs/product/PRODUCT_REQUIREMENTS_AND_ACCEPTANCE.md) — staged MUST/OPEN requirements, acceptance conditions and release gates.
- [User journeys](docs/product/USER_JOURNEYS.md) — core journeys for personal users, businesses and message recipients.
- [Master prompt](docs/governance/MASTER_PROMPT.md)
- [Branch strategy](docs/governance/BRANCHING_STRATEGY.md)
- [Repository and branch inventory](docs/governance/REPOSITORY_INVENTORY.md)
- [Repository landscape research method](docs/research/REPOSITORY_LANDSCAPE_METHOD.md)
- [Provisional visual direction](docs/design/VISUAL_DIRECTION_WORKING.md)

## Current status

**Stage 1 planning — requirements and journeys.** The business-plan study is complete from the owner's supplied full text. Product requirements and initial user journeys are documented. No backend, language, framework, database, realtime transport, protocol, hosting provider, cryptographic library or client framework is selected. Detailed UI remains iterative.

Research up to 1,000 relevant public repositories in transparent tiers. No repository is adopted wholesale. Existing projects are learning sources only; choices require evidence and comparison against the business plan.

## Non-negotiable governance

The original business-plan PDF takes precedence over summaries, technical proposals, old prompts, previous implementations and assistant assumptions. If any discrepancy appears, record it and correct subordinate documents; do not silently alter the PDF or reinterpret its requirements.

Product scope, commercial model, user promises, release boundaries and roadmap may not be changed without explicit owner approval. Technical discovery must not silently change them.

Historical JuggleIM experiments, LansetSpBot reviews and earlier architecture proposals remain research evidence only, not mandatory foundations or production dependencies. Historical branches and commits are preserved.

Work on focused branches, never directly on `main`. No merge, deployment or release without explicit owner approval.
