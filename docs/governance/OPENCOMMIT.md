# OpenCommit integration

**Status:** documented developer-tooling option; not globally installed and no GitHub Action enabled.
**Upstream:** https://github.com/di-sukharev/opencommit
**Reviewed package version:** 3.3.12 (2026-11-27); upstream license: MIT.

## Purpose

OpenCommit generates commit messages from staged Git changes. It is an optional developer convenience, not a source of truth for what changed and not a substitute for review, tests or an accurate human-authored message.

## Local IDE / Git integration — recommended

OpenCommit's `prepare-commit-msg` hook runs during `git commit`, including commits initiated from IDE source-control interfaces. It prepares a suggested message before the editor opens, so the developer can inspect and edit it.

Install the CLI on a developer workstation:

```sh
npm install --global opencommit@3.3.12
```

Configure a supported provider. Example for a local Ollama instance (no hosted API key):

```sh
oco config set OCO_AI_PROVIDER=ollama OCO_MODEL=llama3:8b
```

Or configure the provider and key securely using the provider's documented settings. Do not commit API keys, tokens, local `.env` files or `~/.opencommit` configuration.

From the Jetson repository clone, install the hook:

```sh
oco hook set
```

Remove it when needed:

```sh
oco hook unset
```

The hook is installed into the local Git clone; it is not installed by editing GitHub files. Each developer who wants this behavior must install the CLI, configure a provider and run `oco hook set` in their own clone. Confirm the hook does not overwrite merge, squash, amend or explicitly supplied messages unexpectedly before adopting it as a team-wide convention.

## GitHub Action — deliberately not enabled

The upstream repository labels its GitHub Action **BETA**. Its documented behavior improves new commit messages on push by rewriting commit history (interactive rebase), changing commit SHAs. This can desynchronize local and remote branch histories and disrupt collaborators. The upstream README warns against running it on shared branches and demonstrates broad `write-all` permissions and an older action/runtime setup.

For Jetson, do not add or enable this action by default. In particular:
- never run it on `main`, release branches, shared integration branches or branches with multiple collaborators;
- do not grant `write-all` permissions where narrower permissions would suffice;
- do not introduce a force-push/rebase bot without an explicit owner-approved recovery and branch-protection plan;
- do not add an API key to repository secrets until the owner selects a provider and explicitly approves hosted API use;
- if reconsidered, first audit the exact action source and immutable revision, permissions, token behavior, branch filters, concurrency and failure/recovery behavior.

A safer default is to generate and review messages locally before commit, leaving pushed commit history immutable.

## Governance

- OpenCommit suggestions are drafts; the developer remains responsible for correctness and may edit or reject them.
- Never let generated commit text conceal breaking changes, security-sensitive changes, migrations or incomplete work.
- Do not use `oco --yes` as a default project-wide setting.
- Commit messages should follow the repository's agreed Conventional Commit policy if/when one is adopted.
- This tool does not replace the mandatory Loop Code Review/manual review procedure in `MASTER_PROMPT.md`.
- Do not claim OpenCommit is installed on a workstation unless the CLI and local hook were actually verified there.

## References

- Upstream README: https://github.com/di-sukharev/opencommit
- Upstream Git hook and GitHub Action documentation: https://github.com/di-sukharev/opencommit#git-hook-killer-feature
- Git `prepare-commit-msg` semantics: https://git-scm.com/docs/githooks#_prepare_commit_msg
