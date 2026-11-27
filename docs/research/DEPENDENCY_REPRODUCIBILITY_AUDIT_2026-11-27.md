# Dependency reproducibility and supply-chain audit — 2026-11-27

## Current state

| Candidate | Committed dependency metadata | CI evidence | Security / license status | Gate |
|---|---|---|---|---|
| Go | `go.mod` + refreshed `go.sum` committed for Go 1.26.11, pgx/v5 5.9.2, x/text 0.41.0 and required indirect modules | `go mod tidy` generated the reviewed diff; both files are committed. Workflow now runs tidy, verify and `git diff --exit-code` | govulncheck: no vulnerabilities found on patched graph. First go-licenses run failed only because the first-party module has no license; workflow now ignores first-party module in third-party scan. Fresh go-licenses + Trivy run pending | **PARTIAL — checksums committed, final fail-closed scan pending** |
| Node.js / TypeScript | `package.json` + npm v3 `package-lock.json` committed with integrity hashes | `npm ci` passed; package files remain unchanged | npm audit JSON: 0 advisories. First license gate correctly failed on root package `UNLICENSED`; workflow now excludes first-party package from third-party allow-list. Fresh allow-list + Trivy run pending | **PARTIAL — clean install and audit observed; corrected license gate pending** |
| Kotlin / Spring | Maven POM + committed `dependency-versions.lock` with 72 resolved coordinates | `mvn -B -C verify`, dependency tree and version-lock checker are configured | CycloneDX SBOM: 42 components; Trivy: 0 vulnerabilities in scanned graph. Three components have EPL/LGPL/GPL-with-classpath-exception declarations and require review | **PARTIAL — graph fingerprint committed; license review and latest CI verification pending** |

## Go

The first patched run used Go 1.26.11, pgx/v5 5.9.2 and x/text 0.41.0. Its `govulncheck` output was exactly “No vulnerabilities found.” The subsequent go-licenses command failed because it attempted to find a license for the repository's own module at `poc/go-server`. This is a first-party licensing issue, not a third-party dependency advisory.

The workflow was corrected to exclude `github.com/elusivedamir/jet/poc/go-server` from third-party license checking while retaining the project's own license as an unresolved owner decision. The generated `go.mod` and `go.sum` changes were reviewed from the CI artifact and committed. The workflow now requires `go mod tidy` to leave both files unchanged and runs `go mod verify`. A fresh clean allow-list/Trivy run is pending.

## Node.js / TypeScript

The committed npm lockfile passed `npm ci` with no package-file drift. The audit JSON from the first fail-closed workflow run reports 0 vulnerabilities (0 info, low, moderate, high or critical). The license-checker correctly failed because the root package is `UNLICENSED`; the project itself must not be silently treated as a third-party package. The workflow now excludes `jetson-node-message-poc@0.1.0` from the third-party allow-list while keeping the project's own license decision open. A fresh run is pending.

## Kotlin / Spring

The latest observed CycloneDX SBOM has 42 components and records license declarations. Trivy reported zero vulnerabilities in the scanned dependency graph after PostgreSQL JDBC was raised to 42.7.12.

The SBOM license inventory identifies three components requiring review:
- `logback-classic 1.5.18`: EPL-1.0 and LGPL;
- `logback-core 1.5.18`: EPL-1.0 and LGPL;
- `jakarta.annotation-api 2.1.1`: EPL-2.0 and GPL-2.0-with-classpath-exception.

These are not automatically approved. A conservative CycloneDX policy checker now marks non-permissive or unknown license declarations for review and fails the candidate gate until resolved. A committed 72-coordinate `dependency-versions.lock` is compared against Maven's resolved JSON dependency tree; Maven strict checksum verification remains enabled. This detects dependency-version drift but is not a cryptographic lock of every downloaded artifact.

## CI enforcement changes

- All three workflows use read-only repository permissions and branch-scoped push triggers.
- GitHub Actions references are pinned to immutable commit SHAs.
- Node: `npm audit --audit-level=low`, third-party license allow-list, Trivy exits nonzero for HIGH/CRITICAL findings.
- Go: `go mod tidy` + `go mod verify` + no-diff gate, govulncheck, go-licenses allow-list, CycloneDX and Trivy HIGH/CRITICAL gate.
- Kotlin: Maven strict checksums, dependency version lock, CycloneDX, license inventory/policy gate and Trivy HIGH/CRITICAL gate.

A zero-finding report is not a security certification. License compatibility and obligations still require human review. The first-party product license remains undecided.

## Remaining remediation

1. Confirm the latest Go run passes the third-party allow-list and Trivy gates, with no go.mod/go.sum drift.
2. Confirm Node's corrected license allow-list and Trivy gates pass.
3. Review the three Kotlin SBOM license declarations; replace or explicitly approve dependencies before any production use.
4. Decide the project's own license; the Node root is `UNLICENSED`, and the Go module currently has no license file.
5. Periodically regenerate SBOMs and rerun vulnerability/license scans.
6. Review container image tags/digests and continue pinning any new CI actions immutably.

**Overall gate: PARTIALLY COMPLETE.** Go's patched vulnerability scan is clean and its checksums are now committed; the corrected allow-list/Trivy run is pending. Node's audit is clean but its corrected license gate is pending. Kotlin's vulnerability scan is clean, but three SBOM license entries require review and the new version-lock check awaits CI.
