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


## Current workstream status — 2026-11-27

| Workstream | Current result | Remaining |
|---|---|---|
| W1 Reliability | Shared SIGKILL/restart test implemented; PASS on Go baseline, Node and Kotlin | Other crash boundaries and soak/restart loops |
| W2 Go | Crash recovery and shared contract PASS on baseline; remediation committed | Confirm Go 1.26.11 + pgx 5.9.2 + x/text 0.41.0 scan, refresh/commit go.sum, repeat benchmark |
| W3 Node.js/TypeScript | Clean npm ci, contract/crash PASS, npm audit and Trivy clean | Sustained load, production auth, migrations, operations |
| W4 Kotlin/Spring | Maven verify, contract/crash PASS, SBOM and Trivy clean after JDBC patch | Full transitive dependency lock; sustained load |
| W5 Supply chain | Node lockfile and Go checksum file committed; SBOMs and reports generated | Go post-fix scan; Maven lock strategy; license owner review; pin actions by SHA |
| W6 Performance | Three concurrent rounds measured for Node and Kotlin; Go has an earlier single-round baseline | Patched Go benchmark; repeated cross-run comparisons; sustained load/soak; cold start and deployment cost |
| W7 Product/security architecture | ADR-0001 proposes Node/TypeScript v1; product/privacy constraints retained | Threat model, consent/abuse enforcement and production auth design |

## Current decision posture

Node.js/TypeScript is the provisional v1 recommendation in ADR-0001, not a release gate closure. Kotlin's small throughput advantage does not currently justify its much larger sampled RSS. Go remains a strong resource-efficiency candidate, but cannot be fairly ranked until its patched toolchain and dependencies pass security checks and the repeated benchmark.

The logical workstreams remain coordination labels, not separate autonomous coding agents. The connected environment still does not expose a direct Copilot/Codex agent launch/assignment action.


## Updated decision evidence — 2026-11-27

The patched Go comparison changes the provisional v1 recommendation: ADR-0002 now proposes Go + PostgreSQL, superseding the earlier Node proposal. Same-runner evidence: Go 723.39 req/s median, p95 26.873 ms, p99 30.586 ms, RSS 18,420 KiB, 115 CPU ticks; Node 576.98 req/s, p95 69.909 ms, p99 138.041 ms, RSS 85,384 KiB, 141 ticks; Kotlin 703.05 req/s, p95 52.171 ms, p99 66.678 ms, RSS 265,864 KiB, 527 ticks. Go's patched govulncheck reported no vulnerabilities; the first third-party license check failed only because the first-party module has no declared license. The workflow now excludes the first-party module from third-party scanning, and the project's own license remains an owner decision.

Two hard crash/recovery scenarios passed on all three candidates. The third lost-acceptance-response scenario and 30-second concurrent soak are implemented but await CI. Go module metadata is committed and a no-drift gate is enabled. Node's npm audit reported zero advisories but the first license gate caught its root UNLICENSED declaration; that root is now excluded from third-party allow-list checking. Kotlin's 42-component SBOM has three components requiring license review; its 72-coordinate Maven version lock is committed.

Current latest three-candidate runs 46029865456 (Go), 46029865368 (Kotlin), and 46029865303 (Node) were created but were queued at last check. Do not mark the latest gates or expanded harness as passed until those jobs complete.
