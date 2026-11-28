# Kotlin PoC dependency license review

**Latest evidence:** GitHub Actions run 46131427269, commit `adac5bb754ae796869484afbe1cda1d840b85b27`, artifact `kotlin-message-poc-evidence` (artifact ID 15257986573). The latest SBOM has 41 components; the conservative policy gate identifies one remaining review-required component. The crash/restart harness passed (3 crash-recovery cases), and Trivy passed.

## Current result

On the latest exact-head run, Kotlin compilation, PostgreSQL integration tests, dependency lock, hard crash/restart harness, third-party inventory, CycloneDX SBOM and Trivy all passed. The conservative CycloneDX license-policy gate still fails because one required dependency needs legal/product review.

The latest run's CI step confirms that the policy check failed after generating a 42-component CycloneDX SBOM. The earlier saved review report identifies these three declarations requiring explicit review:

| Component | Version | SBOM license declarations | Decision |
|---|---:|---|---|
| `logback-classic` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `logback-core` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `jakarta.annotation-api` | 2.1.1 | EPL-2.0; GPL-2.0-with-classpath-exception | Review required |

The follow-up POM excludes the default logging starter and adds Spring Boot's Log4j2 starter. This removes `logback-classic`, `logback-core` and `spring-boot-starter-logging`; the resolved graph contains `log4j-api`, `log4j-core`, `log4j-jul`, `log4j-slf4j2-impl` and `spring-boot-starter-log4j2` instead. The first attempt also excluded `jakarta.annotation-api`, but the runtime crash/restart test proved Tomcat requires `jakarta.annotation.PostConstruct` at startup. The API has been restored as an explicit runtime dependency. The latest SBOM confirms that `jakarta.annotation-api` 2.1.1 is the only remaining review-required component (EPL-2.0 / GPL-2.0-with-classpath-exception); all other 40 components satisfy the current permissive-only policy.

## Engineering follow-up

1. Capture the complete dependency tree and SBOM component metadata for the exact current commit; confirm whether the three artifacts and license expressions remain identical to the earlier report.
2. Trace Logback to the Spring Boot default logging starter. Evaluate a supported alternative logging backend (for example, Spring Boot's Log4j2 starter) only after confirming license metadata, runtime behavior, startup logging and operational support.
3. Trace `jakarta.annotation-api` to its introducing dependency. Determine whether it is required at runtime, compile time or only through optional framework integration. Do not exclude it until compilation, application startup and integration tests prove the exclusion safe.
4. Regenerate the dependency lock, SBOM and license report after any dependency change. Review the complete transitive graph.
5. If any dependency remains, obtain an explicit legal/product decision and document the exact artifact, version, license text, obligations and approved use before adding a narrow policy exception.

## Policy decision

The default allow-list in `poc/shared/license_policy_check.py` intentionally contains a small set of permissive licenses. Copyleft, custom, missing and unrecognized declarations require review. Do not disable the gate, broaden the allow-list, or add blanket exceptions merely to obtain a green build.

This is an automated engineering inventory, not legal advice. Kotlin is **not license-policy green**. The Log4j2 change removes the two Logback components; `jakarta.annotation-api` remains required by embedded Tomcat and needs a documented legal/product decision. Do not waive this gate. Node and Go passing does not waive the Kotlin gate.
