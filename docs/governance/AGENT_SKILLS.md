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

Before committing implementation changes, the coding agent should run the skill's iterative review:
1. Inspect the complete task-scoped diff and untracked files without changing staging.
2. Start a fresh reviewer sub-agent without the author's conversation history.
3. Require concrete findings with location, failure scenario, impact and evidence.
4. Fix only accepted material findings, run relevant tests, and request a fresh review round.
5. Stop after a clean round or five rounds, whichever comes first.
6. Record the score history, rounds, checks, unresolved risks and whether the result is `passed` or `open`.

High-risk changes require the strongest available independent reviewer at high effort. The complete rules are in the installed `SKILL.md` and governing `docs/governance/MASTER_PROMPT.md`.

### Capability limitation

The skill's core workflow requires actual sub-agent spawning. A coding environment that does not expose sub-agent orchestration cannot execute that part literally. In that case, the agent must disclose the limitation and may perform a manual review as a fallback, clearly labelled as non-independent. It must not claim to have started sub-agents or report invented reviewer models/scores.

### Updating the skill

To update, inspect the upstream source and license, record the new immutable commit SHA, review the diff, then update the installed files and this provenance record together. Do not silently track a moving `master` branch. Preserve the MIT copyright and permission notice in redistributed copies.
