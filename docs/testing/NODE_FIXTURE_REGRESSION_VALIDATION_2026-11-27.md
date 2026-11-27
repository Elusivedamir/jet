# Node fixture-isolation regression validation — 2026-11-27

## Decision and scope

The deterministic Node terminal-failure row was source-traced to a deliberately terminal unit-test fixture that leaked into the later live crash/soak harness. The fixture-isolation patch is now CI-verified on the exact PR head below.

This closes the specific test-fixture contamination finding. It does not establish production readiness, a production delivery SLO, or a final worker-concurrency choice.

## Exact-head evidence

- Repository: `Elusivedamir/jet`
- PR: [#46](https://github.com/Elusivedamir/jet/pull/46) (Draft; not merged)
- Tested head SHA: `43b82aa2cf49c1512054584fe301d75085482b5f`
- Node workflow: [run #46045340151](https://github.com/Elusivedamir/jet/actions/runs/46045340151)
- Security workflow: [run #46045340060](https://github.com/Elusivedamir/jet/actions/runs/46045340060)
- Go comparative workflow: [run #46045340110](https://github.com/Elusivedamir/jet/actions/runs/46045340110)
- Kotlin comparative workflow: [run #46045340379](https://github.com/Elusivedamir/jet/actions/runs/46045340379)

The Node run completed successfully in all four matrix jobs. For each job, clean lockfile install, build, PostgreSQL integration tests, hard crash/restart/shared contract/benchmark, dependency audit/license inventory, and Trivy report steps passed. The seven security jobs passed. The Go comparative matrix passed. Kotlin's four jobs failed its workflow gate; its known conservative dependency-license review remains unresolved and is separate from the selected Node direction.

## Artifact-level assertions

All four Node evidence artifacts were downloaded and inspected:

| Worker concurrency | Artifact ID | Crash/recovery cases | Terminal failures after soak | Queue drained to zero |
|---:|---:|---:|---:|---|
| 1 | 15222441513 | 3/3 PASS | 0 | yes, 35.64 s |
| 4 | 15221773157 | 3/3 PASS | 0 | yes, 0.07 s |
| 8 | 15222161371 | 3/3 PASS | 0 | yes, 0.08 s |
| 16 | 15222356386 | 3/3 PASS | 0 | yes, 0.08 s |

The three crash/recovery scenarios in every artifact passed:
1. Hard process kill during recipient-inbox transaction, followed by lease expiry and recovery.
2. Hard kill after committed outbox claim, followed by lease expiry and recovery.
3. Lost acceptance response after database commit, followed by restart and idempotent retry returning the original message.

All artifacts report `crash_recovery: PASS`, `crash_recovery_cases: 3`, and `terminal_failure: 0` after the producer soak. No terminal-failure samples were present. Queue-drain final snapshots show zero open rows and zero terminal failures.

## Interpretation and limitations

- The fixture-leak regression is **CI-verified** at the exact PR head; the previously observed synthetic terminal row no longer appears in any of the four Node matrix artifacts.
- The worker=1 cell began its drain with 20,841 open rows and drained them in 35.64 seconds. Worker=4 began with 25 open rows and drained in 0.07 seconds. Worker=8 and worker=16 kept up with the preceding soak and had no open rows at the post-soak snapshot. These times are not directly comparable because starting backlog and hosted-runner load differ.
- The harness has three repeated 30-second producer-soak periods inside each workflow job. This is not three independent full CI runs.
- The hosted-runner measurements are short PoC evidence only. They are not production capacity or SLO evidence.
- Keep `OUTBOX_WORKER_CONCURRENCY=1` as the default until a controlled repeatability pass and manual review are complete.
- PR #46 remains Draft and unmerged. The main branch is unchanged.

## Next gate

Run three independent full Node workflow executions on a pinned/equivalent runner class and pinned PostgreSQL version/configuration; inspect each run's artifacts and compare contract, crash recovery, terminal failures, queue drain, producer errors, latency, RSS and CPU. Only after that review should the first Node application vertical slice be authorized.
