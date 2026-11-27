# Jetson continuous security and quality gates

**Status:** owner-requested governance baseline, 2026-11-27. The workflow implementation is newly added and its first CI execution is not yet verified.

## Purpose

Run repeatable, evidence-producing checks on every pull request. These checks complement—not replace—unit/integration tests, threat modeling, manual review, and the product acceptance process. They do not certify Jetson as secure or production-ready.

## Integrated tools and pinned sources

| Tool | Purpose | Integration / version | Evidence boundary |
|---|---|---|---|
| Trail of Bits skills | Security-focused differential review, post-patch validation, spec-to-code compliance, supply-chain risk review | Exact skill files vendored from `trailofbits/skills` commit `149d7b21f4067765b82e67029730b42d228ef4b4`; CC BY-SA 4.0 | Agent workflow support varies by runtime; no independent sub-agent is implied |
| OWASP ASVS | Security verification requirements | Stable ASVS 5.0.0; checklist in this repository | Human/agent evidence checklist, not an automated ASVS certification |
| Semgrep | Static application security analysis | CLI `1.187.0`, registry config `p/security-audit` | Rule coverage depends on language support and configuration |
| Gitleaks | Secret detection in repository history | OCI image pinned by digest: `ghcr.io/gitleaks/gitleaks@sha256:b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb` (linux/amd64) | Finding-free scan does not prove that no secret was ever exposed elsewhere |
| zizmor | GitHub Actions / CI workflow security | `zizmorcore/zizmor-action@53290badfa369cb0bf7ad16342cb62c2fa47ac7b` (action v0.8.0), zizmor CLI `v1.30.1` | Audits workflow configuration, not application code |
| CodeQL | Data-flow and semantic source analysis | `github/codeql-action` pinned to `776237d428f23fefc3d9e0fe1962921cbcd53e17` | Build and language extraction coverage must be checked in each run |
| OpenSSF Scorecard | Repository supply-chain posture | Tracked as a follow-up integration; see below | Requires a separate permission/output decision before activation |
| Renovate | Dependency update automation | Tracked as an opt-in follow-up; requires repository app installation/configuration | No app installation or automatic dependency PRs are claimed |

The old `semgrep/semgrep-action` repository is archived/deprecated and MUST NOT be used. The native Semgrep CLI is used instead.

## CI trigger and permissions

The continuous workflow runs on pull requests, pushes to the dedicated governance branch, weekly schedule, and manual dispatch. It has read-only repository permissions globally. CodeQL receives only the permissions needed to publish code-scanning results. The zizmor job does not upload to GitHub Advanced Security and does not request write permissions.

All third-party GitHub Actions are pinned to full commit SHAs. Tool versions and container digests are recorded above. Update pins only after reviewing upstream releases, provenance, licenses, permissions, and behavior.

## Required review sequence

### Every implementation PR
1. Define acceptance criteria and affected trust boundaries.
2. Run the existing build, unit, integration, contract, concurrency, migration and regression tests applicable to the change.
3. Run Semgrep, Gitleaks, zizmor and CodeQL workflows.
4. Review the diff with Loop Code Review.
5. For security-sensitive or externally visible changes, run Trail of Bits differential review and the applicable ASVS checklist areas.
6. After a security fix, run post-patch validation and regression tests against sibling paths and variants.
7. Compare implementation with approved product requirements and API/data contracts using spec-to-code compliance.
8. Record findings, severity, evidence, owner, disposition and follow-up. Rerun affected checks after fixes.

### Before a release
- Complete the relevant ASVS 5.0.0 checklist and retain evidence.
- Review threat model, authorization matrix, session/device lifecycle, privacy/data retention, cryptographic design, abuse controls and account recovery.
- Review SBOM, dependency advisories, licenses, provenance and reproducibility.
- Run backup/restore, crash/restart, load, soak and end-to-end tests for the release candidate.
- Record unresolved findings and explicitly accept any residual risk. No automated green check alone authorizes release.

## Fail-closed evidence states

Every check must be reported as one of:
- `PASS`: the check ran on the exact commit and produced usable evidence with no blocking findings.
- `FAIL`: the check ran and found a blocking issue or failed its required assertion.
- `NOT RUN`: the check did not execute, was skipped, was unavailable, or could not produce evidence.
- `NOT APPLICABLE`: a documented reason establishes that the check does not apply to the change.

Never convert `NOT RUN`, `SKIPPED`, parser/build failure, incomplete language extraction, or unavailable service into `PASS`. A successful workflow is not proof that all code paths are secure. A scan with zero findings is bounded by the tool's coverage and configuration.

## Finding handling

- Do not silently suppress or downgrade findings.
- False-positive dispositions require a reproducible explanation, location, rule ID, and reviewer.
- Secrets require immediate credential revocation/rotation and incident handling; deleting a line is not sufficient.
- A vulnerability fix must include a regression test where practical and post-patch variant analysis.
- Do not auto-merge dependency updates or security fixes.
- Do not add tokens, third-party SaaS services, paid plans, or broader permissions without owner approval.
- Never paste secrets into chat or commit them to the repository.

## OWASP ASVS checklist usage

Use `docs/security/OWASP_ASVS_5.0.0_CHECKLIST.md` as a Jetson-specific evidence tracker. Select requirements based on the implemented feature and its risk. The checklist is deliberately not a claim that every ASVS requirement applies to every PoC. Record exact ASVS requirement IDs and evidence before marking an item verified.

## Follow-up integrations

### OpenSSF Scorecard
Evaluate the official `ossf/scorecard-action` with a pinned immutable revision and least-privilege configuration. Do not publish SARIF or request `id-token: write` until the repository's visibility, code-scanning entitlement and publication need are confirmed. The manual Scorecard CLI may be used for repository posture assessment in the meantime.

### Renovate
Evaluate a repository Renovate configuration only after deciding update cadence, grouping, cooldown, automerge prohibition, lockfile regeneration and CI policy. Enabling Renovate requires the repository owner to install/authorize its GitHub App; repository files alone cannot complete that external setup.

## Source references

- Trail of Bits skills: https://github.com/trailofbits/skills/tree/149d7b21f4067765b82e67029730b42d228ef4b4
- OWASP ASVS 5.0.0 stable release: https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release
- Semgrep CLI releases: https://github.com/semgrep/semgrep/releases
- Gitleaks: https://github.com/gitleaks/gitleaks
- zizmor action: https://github.com/zizmorcore/zizmor-action/tree/53290badfa369cb0bf7ad16342cb62c2fa47ac7b
- CodeQL action: https://github.com/github/codeql-action/tree/776237d428f23fefc3d9e0fe1962921cbcd53e17
- OpenSSF Scorecard: https://github.com/ossf/scorecard-action
- Renovate: https://github.com/renovatebot/renovate
