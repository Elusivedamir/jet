# Dependency reproducibility and supply-chain audit — 2026-11-27

## Scope and evidence

This is a manifest-level audit of the three isolated message PoCs, based on the committed files on the current research branch. It is not a vulnerability scan, SBOM, license audit, or proof that transitive dependency graphs are reproducible.

## Findings

| Candidate | Direct dependency declaration | Lock / checksum state | Finding |
|---|---|---|---|
| Go | `go.mod` declares Go 1.24.0 and `github.com/jackc/pgx/v5 v5.7.2` | `go.sum` is not committed | CI currently runs `go mod tidy`, which resolves dependencies during the job but does not make the resulting graph part of the reviewed source revision. |
| Node.js / TypeScript | `package.json` pins pg 8.13.1, @types/node 22.10.2, @types/pg 8.11.10 and TypeScript 5.7.2 | `package-lock.json` is not committed | CI uses `npm install`; transitive resolution is not locked to a reviewed lockfile. |
| Kotlin / Spring | Maven parent Spring Boot 3.4.4; Kotlin 2.0.21; JDK target 21; Kotlin Maven plugin/all-open versions pinned | No committed Maven dependency lock or checksum-enforcement file identified | Direct and plugin versions are declared, but transitive versions are inherited/resolved through Maven metadata. Reproducibility and dependency verification remain incomplete. |

## Required remediation

### Go
- Generate and commit `go.sum` using the pinned Go toolchain (1.24.x).
- Change CI from mutating `go mod tidy` to a non-mutating verification step after the lock data is committed (for example, `go mod tidy -diff` where supported, plus `go mod verify`).
- Verify that a clean checkout builds without modifying tracked dependency files.

### Node.js / TypeScript
- Generate and commit `package-lock.json` with the selected Node/npm toolchain.
- Replace `npm install` in CI with `npm ci`.
- Verify clean install, build and tests from the committed lockfile.

### Kotlin / Spring
- Select and document a Maven dependency pinning strategy for all resolved transitive dependencies and build plugins.
- Capture the resolved dependency tree as an auditable artifact; decide whether Maven dependency lock extensions or strict dependency constraints are appropriate.
- Add dependency checksum verification and reproducible clean-build checks where supported.
- Do not claim a lockfile equivalent until the chosen mechanism is committed and CI-enforced.

## Security / governance gates still open

- Generate an SBOM for each candidate from the exact tested commit.
- Run vulnerability scanning against resolved dependencies and record database timestamp/tool version.
- Inventory direct and transitive licenses and flag incompatible/unknown licenses for human review.
- Pin CI actions to immutable commit SHAs in a separate hardening change; current workflow references use version tags.
- Avoid automatic dependency upgrades during the stack comparison; any upgrade must be a reviewed change applied consistently where applicable.

## Acceptance criteria

A candidate passes dependency reproducibility only when:
1. a clean checkout can install/build using committed dependency metadata;
2. CI fails if dependency metadata is stale or modified by the build;
3. dependency versions and checksums are reviewable;
4. an SBOM and vulnerability/license reports are attached to the exact tested SHA;
5. the validation log records tool versions and the exact commit.

**Current result: OPEN / NOT PASSED for all three candidates.** This is a manifest inspection, not a vulnerability scan. No security clearance is implied.
