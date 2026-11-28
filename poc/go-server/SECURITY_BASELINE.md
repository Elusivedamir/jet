# Go PoC security baseline — 2026-11-27

## First scan

The first Go vulnerability scan used Go 1.24.13, pgx/v5 5.7.2 and golang.org/x/text 0.21.0. govulncheck reported 24 reachable advisories across the standard library and imported modules. Notable direct dependency findings included:
- GO-2026-5004 in pgx/v5 5.7.2, fixed in 5.9.2.
- GO-2026-6629 and GO-2026-5970 in golang.org/x/text 0.21.0, fixed in 0.41.0.
- Multiple standard-library advisories in Go 1.24.13, with the newest fixed baseline reported as Go 1.26.11.

The raw report is retained as a CI artifact from the first scan. This was an actual failing security gate, not a theoretical note.

## Remediation applied

- Go toolchain baseline raised to 1.26.11.
- Module language version raised to 1.26.0.
- pgx/v5 raised to 5.9.2.
- golang.org/x/text raised to 0.41.0.
- CI regenerates the module graph and checksum file for this remediation pass; after the generated go.sum is committed, CI must return to non-mutating `go mod tidy -diff` plus `go mod verify`.

## Acceptance gate

The remediation is not marked successful until:
1. integration, race and shared crash/recovery tests pass on the new toolchain;
2. govulncheck completes with no reachable advisories;
3. Trivy vulnerability/license report is generated and reviewed;
4. regenerated go.sum is committed and clean-checkout verification is non-mutating.

A clean govulncheck report does not imply zero advisories in all modules that are not reachable from this PoC.
