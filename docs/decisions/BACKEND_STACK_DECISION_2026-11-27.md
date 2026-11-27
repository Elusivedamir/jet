# Backend stack decision — 2026-11-27

## Decision

**Owner-selected primary backend: Node.js / TypeScript.**

The project will proceed with Node.js / TypeScript as the primary backend implementation direction. Go and Kotlin/Spring remain comparative proof-of-concept implementations and research references; they are not the selected primary backend.

This is an explicit product-owner decision, not a claim that the benchmark matrix proved Node is objectively fastest or that the alternatives failed.

## Evidence considered

The corrected outbox matrix at source head `6593d501dcdb8921e221edffc142c368f2ea1e0b` completed all four Node concurrency cells:
- Node workflow [#46041977599](https://github.com/Elusivedamir/jet/actions/runs/46041977599): all four functional/crash/soak cells passed.
- The 12-cell comparison is recorded in [OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md](../research/OUTBOX_WORKER_CAPACITY_FINDINGS_2026-11-27.md).
- Node producer HTTP request errors were zero in all four cells.
- Each Node cell reported one terminal-failure row with `attempt_count=2` and `last_error='Error: final injected failure'`. The exact source-level origin has not yet been confirmed. This remains an open correctness/observability investigation and must not be hidden or assumed harmless.

The matrix used different hosted-runner environments for candidate groups and had varying starting backlogs. It is not a defensible language performance ranking, production capacity estimate, or SLO.

## Scope and guardrails

1. This decision selects the primary backend language/runtime only: Node.js / TypeScript.
2. PostgreSQL remains the current PoC database; this decision does not by itself approve a production database, hosting platform, deployment topology, or operational SLO.
3. Keep outbox worker concurrency at **1 by default** until Node's terminal-failure row is classified and the worker behavior is reviewed. Do not tune concurrency based only on the current noisy hosted-runner matrix.
4. Investigate and document the deterministic Node terminal row with a regression assertion that distinguishes intentional failure injection from unexpected terminal delivery failure. Preserve the failure signal; do not suppress it.
5. Perform a controlled repeatability pass on the selected Node candidate, with exact commit, runner class, PostgreSQL version, configuration, artifacts, and three independent full runs where feasible.
6. Continue security, supply-chain, dependency-license, threat-model, reliability, backup/restore, privacy/legal and product acceptance gates before any production-readiness claim.
7. Do not delete the Go or Kotlin PoCs or their evidence. They remain useful comparative research.
8. No merge, deployment, paid infrastructure, external app installation or change to the canonical business plan is authorized by this decision.

## Status

- **Primary backend direction:** selected by owner — Node.js / TypeScript.
- **Node functional/crash matrix:** passed on the cited tested commit.
- **Node deterministic terminal row:** open; root cause not yet proven.
- **Controlled repeatability:** not yet completed.
- **Production readiness:** not established.
- **Default worker concurrency:** 1.
- **Database/hosting/production topology:** separate decisions.

## Next actions

1. Trace the exact Node failure-injection path from harness setup through terminal-failure persistence.
2. Add/verify an assertion proving that the expected injected failure is the sole terminal row; fail if an unrelated terminal row appears.
3. Run and record a controlled repeatability test for Node.
4. Update the Node architecture ADR and implementation plan to reflect this owner-selected direction without overstating benchmark evidence.
5. Continue the Node vertical slice only after its task-specific quality and security gates are defined.



## Follow-up finding — Node terminal row source identified

Source inspection confirmed that the deterministic `final injected failure` row was generated intentionally by the Node unit test that verifies the max-attempt terminal transition. The test left its fixture in the same PostgreSQL database later reused by the live crash/soak harness. The harness therefore reported a test fixture as a terminal delivery failure. The Node test now resets fixtures in teardown and explicitly asserts the expected terminal error. See [ADR-0003](../architecture/ADR-0003-backend-stack-node-typescript-owner-selected.md) and the outbox findings for the full chain.

The regression is **source-confirmed and patched, but not yet CI-verified**. Do not mark it closed until the exact-head Node workflow passes and all four harness artifacts show zero terminal failures.
