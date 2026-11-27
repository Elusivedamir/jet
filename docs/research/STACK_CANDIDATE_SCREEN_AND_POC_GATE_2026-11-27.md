# Jetson Messenger — Stack Candidate Screen and Proof-of-Concept Gate

**Review date:** 2026-11-27  
**Status:** Research shortlist only; no language, framework, database, transport or hosting choice is approved.  
**Scope:** application-server language/runtime and web-framework family. This is not a full-stack decision.

## 1. Why this review exists

The business plan deliberately leaves the technical stack open. The repository evaluation criteria require a weighted score only where evidence exists; unknown dimensions must remain Unknown, not be converted to neutral or zero. The current persistence experiments compare prototype adapters, not complete server runtimes. They therefore cannot choose the application stack.

The first production-like proof of concept (PoC) should answer one narrow question: which candidate lets Jetson implement the same durable direct-message contract with the least correctness risk and operational complexity, while remaining maintainable by the project owner and coding agents?

## 2. Candidate screen

Candidates are evaluated as language/runtime families, not as preselected products. Framework selection is deliberately deferred until a candidate passes the same PoC.

| Candidate | Documented strengths relevant to Jetson | Costs and risks to test | Current disposition |
|---|---|---|---|
| Go + standard HTTP/runtime; SQL through `database/sql` or a driver-specific adapter | Official docs describe goroutines/channels, request cancellation via `context`, a concurrency-safe SQL handle with managed connection pool, and explicit `sql.Tx` commit/rollback semantics. The language compiles to native code and does not require a separate VM. | Concurrency primitives do not eliminate logical races; goroutine lifecycle/leak control, transaction boundaries, schema/migration tooling, WebSocket library maturity, observability and developer ergonomics must be tested. | **Finalist for PoC** — strong fit hypothesis, not selected. |
| TypeScript + supported Node.js LTS; framework undecided (e.g. lightweight HTTP framework versus a more integrated framework) | Official Node docs describe event-driven I/O and a worker pool; TypeScript can share types/tooling with a web client. Node publishes an explicit release/LTS schedule; at review time the official schedule lists Node 26 as Active LTS. | Event-loop or worker-pool blocking can degrade all clients and create denial-of-service exposure. Runtime/module/build complexity, dependency supply chain, CPU-heavy work isolation, WebSocket backpressure and memory under many idle connections need measurement. | **Finalist for PoC** — strong ecosystem/shared-language hypothesis, not selected. |
| Kotlin/JVM + Spring Boot; servlet versus reactive model undecided | Spring Boot documents standalone production applications, embedded servers, health/metrics/configuration and integrations across SQL, security and messaging. Spring provides transaction abstractions and test support. | Runtime/container memory, startup, configuration surface, dependency graph and operator skill must be measured. Declarative transactions have proxy/thread-context semantics: self-invocation may bypass proxy interception; imperative and reactive transactions use different context models. | **Finalist for PoC** — strongest integrated framework hypothesis, not selected. |
| Rust + an async runtime/framework chosen only for the PoC | Official Rust material documents ownership-based memory/thread safety and the need for an async runtime to schedule async tasks. Potential fit for a correctness/performance-critical service. | More decisions are required around async runtime, libraries and integration patterns. Compile/iteration time, agent-generated code review burden, debugging and owner maintainability must be measured, not assumed. | **Reserve candidate** — reconsider if the first three fail correctness, resource or maintainability gates. |

## 3. Evidence and limits

### Go
- The official Go documentation describes `sql.Tx` as a transaction boundary with commit/rollback semantics and states that a successful commit applies the transaction's changes atomically: [Executing transactions](https://go.dev/doc/database/execute-transactions).
- The official SQL handle is safe for concurrent goroutine use and manages a connection pool: [Managing connections](https://go.dev/doc/database/manage-connections).
- Go's FAQ describes goroutines/channels and scheduler behavior, while warning that performance must still be measured: [Go FAQ](https://go.dev/doc/faq).
- These docs establish API capabilities, not Jetson's correctness, performance, security or production suitability.

### TypeScript / Node.js
- Node's official guide explains the event loop and worker pool, and explicitly warns that blocking either harms throughput and can expose a denial-of-service vector: [Don't block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop).
- The official release schedule identifies release channels and LTS windows; at this review date it lists Node 26 as Active LTS: [Node.js Release schedule](https://github.com/nodejs/Release).
- Shared-language benefit with a TypeScript web client is a project hypothesis, not an official performance claim. The PoC must test runtime isolation and dependency health.

### Kotlin / Spring Boot
- Spring Boot documents embedded servers, production-ready health/metrics/configuration, data access, security and messaging integrations: [Spring Boot](https://spring.io/projects/spring-boot) and [documentation overview](https://docs.spring.io/spring-boot/documentation.html).
- Spring documents imperative and reactive transaction managers and their different context models: [Transaction abstraction](https://docs.spring.io/spring-framework/reference/data-access/transaction/strategies.html).
- Spring documents that default proxy-mode `@Transactional` does not intercept self-invocation; this is a real correctness trap the PoC must test: [Using @Transactional](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).
- Feature breadth is not proof of low operating cost or easy maintenance.

### Rust
- Official Rust material describes memory and thread safety as outcomes of ownership/type-system constraints: [Rust](https://rust-lang.org/).
- Rust's async guide explains that async tasks require a runtime/scheduler: [Asynchronous Programming in Rust](https://rust-lang.github.io/async-book/part-guide/async-await.html).
- These are language/runtime properties, not proof that a particular server framework or database driver is production-ready for Jetson.

## 4. Evidence scorecard — deliberately not scored yet

The repository's 100-point criteria remain authoritative: correctness/recovery 20, security/privacy/abuse 15, product fit 15, campaign/data integrity 15, operations/economics 12, tests/reproducibility 10, maintenance/release health 8, documentation/DX 3.

| Dimension | Go | Node/TypeScript | Kotlin/Spring | Rust | Why score is Unknown today |
|---|---|---|---|---|---|
| Messaging correctness/recovery (20) | Unknown | Unknown | Unknown | Unknown | No equivalent Jetson server PoC or failure-injection suite has been run. |
| Security/privacy/abuse (15) | Unknown | Unknown | Unknown | Unknown | No candidate-specific threat model, dependency audit or security review. |
| Product fit (15) | Unknown | Unknown | Unknown | Unknown | Framework/API integration and client contracts are not implemented. |
| Campaign/data integrity (15) | Unknown | Unknown | Unknown | Unknown | Campaigns are Stage 2; no candidate has a tested consent-aware dispatcher. |
| Operations/economics (12) | Unknown | Unknown | Unknown | Unknown | No controlled container, memory, CPU, backup/restore or cost experiment. |
| Tests/reproducibility (10) | Unknown | Unknown | Unknown | Unknown | Current passing tests are language-neutral reference/SQLite prototypes, not candidate server tests. |
| Maintenance/release health (8) | Unknown | Unknown | Unknown | Unknown | Official docs alone do not establish candidate dependency health, maintainer response or owner ability to maintain. |
| Documentation/DX (3) | Unknown | Unknown | Unknown | Unknown | Must be assessed by completing the same change task with owner and coding-agent review. |

**No weighted total is calculated.** Awarding scores now would imply evidence that does not exist. Non-compensable license, security, reproducibility, product-invariant and data-portability gates remain Unknown for every candidate.

## 5. Standardized PoC contract

Every candidate must implement the same narrow vertical slice, using the same external dependencies and test fixtures:

1. Start one server process and expose health/readiness endpoints.
2. Authenticate two test accounts using a deliberately minimal test-only identity adapter; do not ship password/session design from this PoC.
3. Establish two authenticated realtime connections using the same transport contract.
4. Send one direct message with a stable sender-scoped operation key.
5. In one database transaction, commit message identity, conversation position, idempotency record and durable outbox intent before returning Accepted.
6. Deliver the committed message to the second account through an independently retriable worker; distinguish queued, attempted and recipient-acknowledged states.
7. Recover after process termination and reconnect using a documented cursor; do not lose an accepted message or create a second logical message.
8. Provide a deterministic test seam at transaction commit, acceptance response, outbox claim, delivery send and delivery completion.

Do not add groups, attachments, CRM, subscriptions, campaign UI, AI, E2EE or external channels to this PoC. Those features would obscure the narrow comparison and are not needed to prove the core contract.

## 6. Required identical test matrix

| ID | Test | Pass condition |
|---|---|---|
| STACK-001 | Happy-path A-to-B direct message | One committed message; Accepted follows commit; B receives same stable message ID. |
| STACK-002 | Store failure before commit | No Accepted response, no message row, no outbox intent. |
| STACK-003 | Process killed after commit but before response | Retry with same operation key resolves to original message and position. |
| STACK-004 | Two concurrent identical requests | One logical message and one conversation position. |
| STACK-005 | Same sender/key in another conversation | Conflict; no cross-conversation lookup or outbox side effect. |
| STACK-006 | Different senders use same operation key | Independent scopes; no cross-account result disclosure. |
| STACK-007 | Outbox worker killed after claim | Lease/fencing/recovery returns work without permanent loss. |
| STACK-008 | Delivery send succeeds, completion write fails | Ambiguous attempt is reconciled; no second visible logical message. |
| STACK-009 | Recipient offline then reconnects | Message appears from durable history/sync; cursor cannot skip it. |
| STACK-010 | Account C requests A/B history | Authorization denied without message, metadata or cursor leakage. |
| STACK-011 | Same-conversation concurrent sends | Unique committed positions; deterministic order under documented serialization. |
| STACK-012 | Graceful and hard process restart with pending outbox | Pending work remains visible and recoverable. |

Run deterministic cases at least 100 times each and randomized state-machine sequences per the existing test plan. Any reduced repetition count must be recorded and must not be called equivalent. Add load tests only after correctness passes.

## 7. Fair comparison protocol

- Same machine/OS/container limits, database version, schema, dataset, test seed, transport behavior and client harness.
- Same PostgreSQL instance and connection-pool budget for all candidates; SQLite is not a substitute for this comparison.
- Same message payload size, number of accounts, active connections, send rate, offline duration and reconnect workload.
- Run each scenario at least five independent times after warm-up; publish median and p95/p99 with run-to-run spread. Report environment and raw artifacts.
- Measure build time, cold start, steady-state RSS, CPU, open sockets, DB connections, transaction latency, queue age, delivery lag, test runtime and image size.
- Measure developer/agent task time, review corrections, failed builds, complexity of a routine schema change and ease of tracing a message end-to-end.
- Run dependency/license inventory, vulnerability scanning and secret scanning. No candidate passes security or licensing gates by virtue of a successful functional test.
- Publish source revision, exact commands, environment variables (names only), dependency lockfiles and raw JSON/CSV outputs.

## 8. Stop conditions and selection rule

Stop a candidate immediately if it loses an accepted message, creates duplicate logical messages, skips a committed cursor position, leaks another account's data, acknowledges before durable commit, cannot recover pending outbox work, or cannot reproduce its build/tests.

After all candidates pass correctness, calculate the weighted score only for dimensions with evidence and report evidence coverage/confidence. A candidate with any unresolved non-compensable gate cannot be selected. If two candidates remain close, prefer the one the owner can inspect, operate and maintain with lower total burden; verify that with a timed maintenance task, not intuition.

**Current outcome:** Go, Node/TypeScript and Kotlin/Spring are PoC finalists; Rust is a reserve candidate. This is a shortlist for experiments, not a production-stack selection. Database, transport, framework, hosting, identity/session design and E2EE remain open.

## 9. Explicit non-goals

- No production stack decision.
- No copying or adopting an upstream messenger.
- No production identity, password, session, cryptography or E2EE design.
- No claims about capacity, SLA, security audit or legal compliance.
- No change to business plan, product scope, Stage 1/2/3/4 sequencing or pricing.

## 10. References

- [Jetson repository evaluation criteria](JETSON_REPOSITORY_EVALUATION_CRITERIA.md)
- [Architecture synthesis](JETSON_ARCHITECTURE_SYNTHESIS.md)
- [Message state-machine contract](../testing/MESSAGE_STATE_MACHINE_CONTRACT.md)
- [Message reliability test plan](../testing/MESSAGE_RELIABILITY_TEST_PLAN.md)
- [Official Go transaction docs](https://go.dev/doc/database/execute-transactions)
- [Official Go connection-pool docs](https://go.dev/doc/database/manage-connections)
- [Official Node event-loop guidance](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)
- [Official Node release schedule](https://github.com/nodejs/Release)
- [Official Spring Boot overview](https://spring.io/projects/spring-boot)
- [Official Spring transaction abstraction](https://docs.spring.io/spring-framework/reference/data-access/transaction/strategies.html)
- [Official Spring @Transactional semantics](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html)
- [Official Rust overview](https://rust-lang.org/)
- [Official Rust async guide](https://rust-lang.github.io/async-book/part-guide/async-await.html)