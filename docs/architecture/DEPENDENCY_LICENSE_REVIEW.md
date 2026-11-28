# Kotlin PoC dependency license review

**Latest evidence:** GitHub Actions run 46127900923, commit `4b58d6e2e54b0eeab6ea7288a286a8c288c503bd`, artifact `kotlin-message-poc-evidence` (artifact ID 15256861166). Earlier evidence: run 46124874917, commit `0465f52ecb38dfc53fece62c436fd0c0124331c1`.

## Current result

On the latest exact-head run, Kotlin compilation, PostgreSQL integration tests, crash/restart harness and SBOM generation completed. The final conservative CycloneDX license-policy gate failed. The run is not green.

The latest run's CI step confirms that the policy check failed after generating a 42-component CycloneDX SBOM. The earlier saved review report identifies these three declarations requiring explicit review:

| Component | Version | SBOM license declarations | Decision |
|---|---:|---|---|
| `logback-classic` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `logback-core` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `jakarta.annotation-api` | 2.1.1 | EPL-2.0; GPL-2.0-with-classpath-exception | Review required |

The Maven project currently declares Spring Boot 3.4.4 starters for web and JDBC, Kotlin reflection and PostgreSQL JDBC. The default Spring Boot starter dependency graph is the first place to trace the logging artifacts; the exact transitive path for Jakarta annotations must be confirmed from the generated dependency tree/SBOM before any dependency exclusion is considered.

## Engineering follow-up

1. Capture the complete dependency tree and SBOM component metadata for the exact current commit; confirm whether the three artifacts and license expressions remain identical to the earlier report.
2. Trace Logback to the Spring Boot default logging starter. Evaluate a supported alternative logging backend (for example, Spring Boot's Log4j2 starter) only after confirming license metadata, runtime behavior, startup logging and operational support.
3. Trace `jakarta.annotation-api` to its introducing dependency. Determine whether it is required at runtime, compile time or only through optional framework integration. Do not exclude it until compilation, application startup and integration tests prove the exclusion safe.
4. Regenerate the dependency lock, SBOM and license report after any dependency change. Review the complete transitive graph.
5. If any dependency remains, obtain an explicit legal/product decision and document the exact artifact, version, license text, obligations and approved use before adding a narrow policy exception.

## Policy decision

The default allow-list in `poc/shared/license_policy_check.py` intentionally contains a small set of permissive licenses. Copyleft, custom, missing and unrecognized declarations require review. Do not disable the gate, broaden the allow-list, or add blanket exceptions merely to obtain a green build.

This is an automated engineering inventory, not legal advice. Kotlin is **not license-policy green**. The blocker is distinct from compile and integration-test correctness; Node and Go passing does not waive it.
