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
