# Kotlin PoC dependency license review

**Evidence:** GitHub Actions run 46124874917, commit `0465f52ecb38dfc53fece62c436fd0c0124331c1`, artifact `kotlin-message-poc-evidence`, generated CycloneDX inventory and `kotlin-license-policy.json`.

## Result

The Kotlin integration, dependency-lock verification, crash/restart harness, Trivy vulnerability/license scan and SBOM generation completed successfully. The final conservative license-policy gate failed because 3 of 42 SBOM components require explicit review.

| Component | Version | SBOM license declarations | Decision |
|---|---:|---|---|
| `logback-classic` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `logback-core` | 1.5.18 | EPL-1.0; GNU Lesser General Public License | Review required |
| `jakarta.annotation-api` | 2.1.1 | EPL-2.0; GPL-2.0-with-classpath-exception | Review required |

The current policy intentionally accepts a small permissive-license allow-list. These declarations are not silently allow-listed and the gate must not be disabled merely to obtain a green build.

## Next engineering review

1. Trace the logging artifacts to Spring Boot's default `spring-boot-starter-logging` dependency. Evaluate a supported alternative logging backend and confirm its license, runtime behavior and operational support before changing the dependency graph.
2. Trace `jakarta.annotation-api` to its introducing dependency and identify whether it is required at runtime, compile time, or only through optional framework integration. Do not exclude it until compilation, application startup and integration tests prove the exclusion safe.
3. Re-run the dependency lock, SBOM and license policy after any dependency change. Review the complete transitive graph, not just these three names.
4. If a dependency remains, obtain an explicit legal/product decision and document the exact artifact, version, license text, obligations and approved use before adding any narrow policy exception.

## Release status

Kotlin is **not license-policy green** yet. The failure is a dependency-license review gate, not a Kotlin compile or PostgreSQL integration-test failure. No license exception has been added. This document records the concrete blocker so it can be resolved deliberately.
