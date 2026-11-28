# Kotlin PoC dependency license review

**Previous evidence:** GitHub Actions run 46130601689, commit `ffd4821cc0b33ac9fb9a3e4e8bae1371ec1ae350`, artifact `kotlin-message-poc-evidence` (artifact ID 15257304684). It recorded the three review-required declarations below. A follow-up POM change is now on the branch at commit `1396b17860f5797985b448d505258b96840b9f2a`; its dependency tree is recorded in run 46131070736, artifact `kotlin-message-poc-evidence` (artifact ID 15258141047).

## Current result

On the previous exact-head run, Kotlin compilation, PostgreSQL integration tests, crash/restart harness and SBOM generation completed. The conservative CycloneDX license-policy gate failed. A follow-up dependency change removes the three flagged artifacts from the resolved graph; exact-head SBOM and policy verification are pending.

The latest run's CI step confirms that the policy check failed after generating a 42-component CycloneDX SBOM. The earlier saved review report identifies these three declarations requiring explicit review:

| Component | Version | SBOM license declarations | Decision |
|---|---:|---|---|
| `logback-classic` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `logback-core` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `jakarta.annotation-api` | 2.1.1 | EPL-2.0; GPL-2.0-with-classpath-exception | Review required |

The follow-up POM excludes the default logging starter and Jakarta annotation API from the web/JDBC starter graph, and adds Spring Boot's Log4j2 starter. The regenerated dependency tree (70 components) confirms that `logback-classic`, `logback-core`, `spring-boot-starter-logging` and `jakarta.annotation-api` are absent; it contains `log4j-api`, `log4j-core`, `log4j-jul`, `log4j-slf4j2-impl` and `spring-boot-starter-log4j2` instead. These new components still require the exact-head SBOM license check.

## Engineering follow-up

1. Capture the complete dependency tree and SBOM component metadata for the exact current commit; confirm whether the three artifacts and license expressions remain identical to the earlier report.
2. Trace Logback to the Spring Boot default logging starter. Evaluate a supported alternative logging backend (for example, Spring Boot's Log4j2 starter) only after confirming license metadata, runtime behavior, startup logging and operational support.
3. Trace `jakarta.annotation-api` to its introducing dependency. Determine whether it is required at runtime, compile time or only through optional framework integration. Do not exclude it until compilation, application startup and integration tests prove the exclusion safe.
4. Regenerate the dependency lock, SBOM and license report after any dependency change. Review the complete transitive graph.
5. If any dependency remains, obtain an explicit legal/product decision and document the exact artifact, version, license text, obligations and approved use before adding a narrow policy exception.

## Policy decision

The default allow-list in `poc/shared/license_policy_check.py` intentionally contains a small set of permissive licenses. Copyleft, custom, missing and unrecognized declarations require review. Do not disable the gate, broaden the allow-list, or add blanket exceptions merely to obtain a green build.

This is an automated engineering inventory, not legal advice. The previous Kotlin exact-head run was **not license-policy green**. The Log4j2 dependency change is intended to remove the flagged dependencies, but Kotlin remains unverified until the new exact-head policy check passes. Node and Go passing does not waive the Kotlin gate.
