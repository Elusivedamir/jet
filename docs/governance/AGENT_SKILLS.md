# Repository agent skills

## Installed: Loop Code Review

- **Skill:** `loop-code-review`
- **Upstream:** https://github.com/di-sukharev/loop-code-review-skill
- **Pinned upstream revision:** `23fdbdec6bb211fa55f84da49d58333efe3b09db` (master at installation time, 2026-11-27)
- **License:** MIT; the upstream LICENSE is preserved beside the skill.
- **Installed path:** `.agents/skills/loop-code-review/`
- **Invocation:** `$loop-code-review` or the phrase “используй ревью в цикле” in the coding task context.

### Installed files

- `.agents/skills/loop-code-review/SKILL.md` — upstream skill instructions.
- `.agents/skills/loop-code-review/agents/openai.yaml` — OpenAI/Codex skill display metadata.
- `.agents/skills/loop-code-review/LICENSE` — upstream MIT license and copyright notice.

The skill is copied into the repository, not installed globally on the user's machine. This makes the workflow versioned with the project and available to compatible repository-aware coding agents that discover the `.agents/skills/` convention.

### Expected workflow

Before committing implementation changes, apply the skill's iterative review:
1. Inspect the complete task-scoped diff and untracked files without changing staging.
2. In a runtime with sub-agent orchestration, start a fresh reviewer sub-agent without the author's conversation history.
3. Require concrete findings with location, failure scenario, impact and evidence.
4. Fix only accepted material findings, run relevant tests, and request a fresh review round.
5. Stop after a clean round or five rounds, whichever comes first.
6. Record score history, rounds, checks, unresolved risks and whether the result is `passed` or `open`.

High-risk changes require the strongest available independent reviewer at high effort when that capability exists. See the governing `docs/governance/MASTER_PROMPT.md` for the required fallback and pass criteria.

### Capability limitation and this ChatGPT environment

This ChatGPT session does not expose sub-agent spawning/orchestration. Therefore, its mandatory operating mode is a separate **manual self-review (not independent)** phase:
- switch deliberately from implementation to reviewer mode and re-read requirements rather than trusting the implementation narrative;
- inspect the full task diff, changed files, relevant surrounding code and untracked files;
- trace requirements and challenge realistic failure, security, concurrency, retry, authorization, compatibility and data-integrity cases as relevant;
- run applicable tests/checks, add meaningful regression tests where practical, fix accepted material findings and repeat the complete manual review for up to five rounds;
- report all findings, checks, unresolved risks and missing validations; use `open` if material risk remains or a required check is unavailable.

Any score in this environment is a self-assessed implementation score, never an independent reviewer score. Do not claim a sub-agent, reviewer model or effort that was not actually used. Do not fabricate rounds, evidence or test results.

### Updating the skill

To update, inspect the upstream source and license, record the new immutable commit SHA, review the diff, then update the installed files and this provenance record together. Do not silently track a moving `master` branch. Preserve the MIT copyright and permission notice in redistributed copies.


# Repository agent skills and external quality tools

## Installed: Loop Code Review

- **Upstream:** https://github.com/di-sukharev/loop-code-review-skill
- **Pinned upstream revision:** `23fdbdec6bb211fa55f84da49d58333efe3b09db`
- **License:** MIT
- **Path:** `.agents/skills/loop-code-review/`
- **Trigger:** `$loop-code-review` or “используй ревью в цикле”.

The installed skill is versioned with the repository. This ChatGPT environment does not expose sub-agent orchestration; use the mandatory manual self-review fallback in the master prompt and never call it an independent review.

## Installed: Trail of Bits security and validation skills

- **Upstream:** https://github.com/trailofbits/skills
- **Pinned upstream revision:** `149d7b21f4067765b82e67029730b42d228ef4b4`
- **License:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), preserved at `.agents/skills/trail-of-bits/LICENSE`.
- **Installation:** exact upstream SKILL.md files copied without modification; Git blob SHAs recorded below.
- **Scope:** these are agent instructions, not autonomous scanners. Their workflow commands and independent-agent features depend on the target coding-agent runtime. Do not claim that a skill ran unless its required runtime and artifacts are available.

| Skill | Installed path | Upstream Git blob SHA | Jetson use |
|---|---|---|---|
| differential-review | `.agents/skills/trail-of-bits/differential-review/SKILL.md` | `536e9258092876017b098f1712a92e7d06bb1480` | Security-focused review of PR diffs and history |
| post-patch-validation | `.agents/skills/trail-of-bits/post-patch-validation/SKILL.md` | `fff1346bc3b8a58caf26e2ad2c9569d4a9f55acd` | Reproduce vulnerabilities, test variants and validate fixes |
| spec-to-code-compliance | `.agents/skills/trail-of-bits/spec-to-code-compliance/SKILL.md` | `b10d8a081c39dd8f89bdc0559da3074f367ec869` | Compare implementation against approved business/product requirements and contracts |
| supply-chain-risk-auditor | `.agents/skills/trail-of-bits/supply-chain-risk-auditor/SKILL.md` | `83affaaf2841182c5eb610338256f7f540b270aa` | Assess npm, PyPI and Go dependency risk with its supplied collectors |

The upstream Trail of Bits repository is licensed CC BY-SA 4.0, not MIT. The license text and attribution are preserved. Do not relicense these copied skill files under the Jetson project license. Any modifications or adaptations must be reviewed for ShareAlike obligations before distribution.

## Continuous tools and workflows

See [CONTINUOUS_SECURITY_GATES.md](../security/CONTINUOUS_SECURITY_GATES.md) for the canonical tool inventory, versions, workflow policy and evidence rules.

| Tool | Installed / configured | Purpose |
|---|---|---|
| Semgrep CLI 1.187.0 | GitHub Actions workflow | Static application security rules |
| Gitleaks OCI image (digest-pinned) | GitHub Actions workflow | Scan Git history and working tree for secrets |
| zizmor action v0.8.0 + CLI v1.30.1 | GitHub Actions workflow | Audit workflow security |
| CodeQL action (immutable SHA) | GitHub Actions workflow | Semantic source analysis for Go, TypeScript/JavaScript and Kotlin/Java |
| OWASP ASVS 5.0.0 | Jetson checklist | Manual security requirement evidence |
| OpenSSF Scorecard | Follow-up, not activated | Repository posture and supply-chain practices |
| Renovate | Follow-up, not activated | Dependency update PRs; GitHub App installation required |

### Deprecated or not activated

- `semgrep/semgrep-action` is archived/deprecated. Do not use it; the native Semgrep CLI is configured instead.
- OpenSSF Scorecard is documented as a follow-up only; no new permissions or result publication are enabled.
- Renovate requires an external GitHub App authorization. A config file alone would not install or activate it.
- No third-party action receives write permissions unless a documented requirement exists.
