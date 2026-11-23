# Jetson Messenger

Repository for the Jetson Messenger product and its implementation.

## Project governance

The approved product specification and approved MASTER PROMPT are the authoritative sources of requirements. Engineering rules apply throughout the project. Do not change product behavior, commercial terms, scope, or approved decisions without explicit owner approval.

Before implementation:
- preserve the approved specification and decision history;
- record technical decisions and their rationale;
- verify repository state and dependencies before modifying existing code;
- distinguish verified facts, assumptions, proposals, and open questions;
- never claim tests, security, performance, or production readiness without evidence.

## Current bootstrap state

Repository initialized on 2026-11-23. This initial commit establishes the Git reference needed to create a separate working branch.

The complete approved MASTER PROMPT and numbered product specification (points 1–16) must be imported verbatim from their canonical source before implementation begins. Do not reconstruct missing source text from summaries.

## Planned documentation areas

- `docs/product/` — approved product specification and requirements;
- `docs/governance/` — MASTER PROMPT, decision log, change control;
- `docs/architecture/` — architecture, interfaces, ADRs;
- `docs/research/` — third-party project evaluations and PoC reports;
- `docs/security/` — threat model, security requirements, verification;
- `docs/quality/` — test strategy, acceptance criteria, release gates.

No application stack or production architecture is approved by this bootstrap commit.
