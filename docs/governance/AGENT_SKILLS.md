# Repository agent skills and external quality tools

## Installed: Loop Code Review

- **Skill:** `loop-code-review`
- **Upstream:** https://github.com/di-sukharev/loop-code-review-skill
- **Pinned upstream revision:** `23fdbdec6bb211fa55f84da49d58333efe3b09db`
- **License:** MIT; upstream license preserved.
- **Installed path:** `.agents/skills/loop-code-review/`
- **Invocation:** `$loop-code-review` or “используй ревью в цикле”.

The skill is copied into the repository, not installed globally on the user's machine. It is available to compatible repository-aware coding agents that discover the `.agents/skills/` convention.

Before committing implementation changes:
1. Inspect the complete task-scoped diff and untracked files without changing staging.
2. In a runtime with sub-agent orchestration, start a fresh reviewer without the author's conversation history.
3. Require concrete findings with location, failure scenario, impact and evidence.
4. Fix accepted material findings, run relevant tests, and request a fresh review round.
5. Stop after a clean round or five rounds, whichever comes first.
6. Record rounds, checks, unresolved risks and exact pass/open status.

This ChatGPT session does not expose sub-agent spawning/orchestration. The required fallback is a separate **manual self-review (not independent)** phase. Never claim an independent reviewer, model or effort that was not actually used. This fallback and its pass criteria are defined in the master prompt.

## Installed: Trail of Bits security and validation skills

- **Upstream:** https://github.com/trailofbits/skills
- **Pinned upstream revision:** `149d7b21f4067765b82e67029730b42d228ef4b4`
- **License:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), preserved at `.agents/skills/trail-of-bits/LICENSE`.
- **Installation:** exact upstream SKILL.md entrypoint files copied without modification; Git blob SHAs recorded below. The upstream helper scripts, reference directories and agent/workflow definitions were not copied in this pass.
- **Scope:** this is a versioned set of skill instructions, not a complete upstream plugin bundle or autonomous scanner. Do not invoke referenced helper scripts as if they exist in this repository; use the instructions as review guidance until the required assets and compatible runtime are installed. Independent-agent features depend on the target coding-agent runtime. Do not claim that a skill ran unless its required runtime and artifacts are available.

| Skill | Installed path | Upstream Git blob SHA | Jetson use |
|---|---|---|---|
| differential-review | `.agents/skills/trail-of-bits/differential-review/SKILL.md` | `536e9258092876017b098f1712a92e7d06bb1480` | Security-focused review of PR diffs and history |
| post-patch-validation | `.agents/skills/trail-of-bits/post-patch-validation/SKILL.md` | `fff1346bc3b8a58caf26e2ad2c9569d4a9f55acd` | Reproduce vulnerabilities, test variants and validate fixes |
| spec-to-code-compliance | `.agents/skills/trail-of-bits/spec-to-code-compliance/SKILL.md` | `b10d8a081c39dd8f89bdc0559da3074f367ec869` | Compare implementation against approved business/product requirements and contracts |
| supply-chain-risk-auditor | `.agents/skills/trail-of-bits/supply-chain-risk-auditor/SKILL.md` | `83affaaf2841182c5eb610338256f7f540b270aa` | Assess npm, PyPI and Go dependency risk with its supplied collectors |

The upstream Trail of Bits repository is licensed CC BY-SA 4.0, not MIT. The license text and attribution are preserved. Do not relicense these copied skill files under the Jetson project license. Any modifications or adaptations must be reviewed for ShareAlike obligations before distribution.

## Continuous tools and workflows

See [CONTINUOUS_SECURITY_GATES.md](../security/CONTINUOUS_SECURITY_GATES.md) for the canonical tool inventory, exact versions, workflow policy and evidence rules.

| Tool | Installed / configured | Purpose |
|---|---|---|
| Semgrep CLI 1.187.0 | GitHub Actions workflow | Static application security rules |
| Gitleaks OCI image (digest-pinned) | GitHub Actions workflow | Scan Git history and working tree for secrets |
| zizmor action v0.8.0 + CLI v1.30.1 | GitHub Actions workflow | Audit workflow security |
| CodeQL action (immutable SHA) | GitHub Actions workflow | Semantic source analysis for Go, TypeScript/JavaScript and Kotlin/Java |
| OWASP ASVS 5.0.0 | Jetson checklist | Manual security requirement evidence |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` | Weekly/default-branch repository posture scan; publication disabled |
| Renovate | `renovate.json` committed; app not installed | Conservative dependency PR configuration; GitHub App installation required |

### Deprecated or not activated

- `semgrep/semgrep-action` is archived/deprecated. Do not use it; the native Semgrep CLI is configured instead.
- OpenSSF Scorecard is configured for default-branch pushes and weekly schedule; result publication is disabled and no OIDC write permission is granted.
- Renovate configuration is committed with automerge disabled. It remains inactive until the repository owner installs/authorizes the GitHub App.
- No third-party action receives write permissions unless a documented requirement exists.

## Updating skills and tools

Before an update, inspect the upstream source, exact immutable revision, license and changelog; review the diff and relevant security advisories; update the copied files, provenance and prompt together. Do not silently follow a moving default branch or version tag.
