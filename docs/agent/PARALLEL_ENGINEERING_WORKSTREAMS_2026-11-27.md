# Parallel engineering workstreams — 2026-11-27

## Execution model

The currently connected toolset exposes GitHub repository operations and GitHub Actions, but does not expose a direct GitHub Copilot/Codex coding-agent launch or assignment action for this repository. No external coding agents are claimed to be running.

Until a dedicated agent runner is connected, use independent review/validation workstreams and parallel CI jobs. Each workstream must produce a committed artifact, executable evidence, or a documented blocker. Do not silently merge workstreams or change the production-stack decision.

## Workstreams

| ID | Owner role (logical) | Scope | Required output |
|---|---|---|---|
| W1 | Reliability engineer | Hard process-kill/restart scenarios; lost HTTP response; claim/dispatch/ack crash boundaries | Executable shared harness, per-stack CI runs, SQL and process evidence |
| W2 | Go implementation reviewer | Direct process lifecycle, worker lease controls, crash recovery behavior | Go implementation and isolated CI result |
| W3 | Node.js/TypeScript implementation reviewer | Direct Node process lifecycle, worker lease controls, crash recovery behavior | Node implementation and isolated CI result |
| W4 | Kotlin/Spring implementation reviewer | JVM process lifecycle, scheduler/lease controls, crash recovery behavior | Kotlin implementation and isolated CI result |
| W5 | Supply-chain reviewer | Dependency pinning, committed lockfiles/checksums, SBOM and license inventory | Reproducible dependency reports and CI gates |
| W6 | Performance reviewer | Comparable CPU/RAM/latency/throughput measurements under the same workload | Raw artifacts, methodology, resource data and caveats |
| W7 | Product/security architect | Map offers, interest graph, mutuality and communication policy to backend boundaries; review abuse/privacy controls | Architecture decision records and threat/risk updates |

These are logical parallel workstreams, not separate autonomous agents. A result is accepted only when supported by a commit, CI run, or source-backed analysis.

## Execution order and dependencies

1. W1 defines and implements a common hard-crash harness and acceptance criteria.
2. W2–W4 integrate the same fault boundary into their respective candidate servers. Keep behavior equivalent; do not optimize one candidate's test path.
3. W5 audits dependency reproducibility independently and may proceed in parallel.
4. W6 starts only after all three candidates can run the same deterministic workload and report comparable resource metrics.
5. W7 can proceed in parallel but must not alter the canonical business plan or product requirements without explicit product-governance review.

## Governance

- Keep PRs Draft until evidence and review gates are complete.
- Do not merge any PR or modify `main` without explicit authorization.
- Do not select a production stack based on incomplete or incomparable tests.
- No production-readiness, capacity, security-audit, or exactly-once end-user-delivery claims from the PoC.
- Keep the business-plan PDF unchanged; product requirements remain subordinate to that canonical plan.
- Document failed runs and fixes; never delete failed evidence or relabel a design as a passing test.
- CI test-only hooks must be inaccessible in production builds and operate only against disposable test databases.
