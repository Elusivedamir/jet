# Jetson AI Engineer — staged automation

Status: foundation prepared; model execution is disabled until an explicit provider credential is configured.

## Budget and provider decision

Target operating budget: RUB 500/month. Do not assume this budget buys a continuously running hosted model. Codex/API-key usage is billed separately from ChatGPT plan allowances. The GitHub Actions workflow therefore checks for `OPENAI_API_KEY` and exits safely when it is absent.

Initial provider: OpenAI Codex GitHub Action (`openai/codex-action@v1`). Use a project API key stored only as the GitHub Actions secret `OPENAI_API_KEY`; never put keys in repository files, Termux scripts, prompts, logs, or commits. Before enabling it, configure provider-side usage limits/alerts and verify current API prices. The 500 RUB target is a spending ceiling chosen by the owner, not a guarantee that the API platform enforces a hard cap at that exact amount.

## Runtime topology

- GitHub Actions: ephemeral worker for model execution, linting, tests, and artifact capture.
- Codex: coding/reasoning engine invoked by the official GitHub Action.
- GitHub: source of truth for tasks, branches, commits, pull requests, and CI evidence.
- Termux monitor: notification/control endpoint only; it does not store model credentials and does not run the model.
- Repository docs: durable project memory and engineering constraints.

## Autonomy policy

The first integration is manual-dispatch only. This is deliberate: GitHub requires workflow files to exist on the default branch before certain cross-workflow triggers can run, and the owner has not authorized changes to `main`.

When enabled, each run:
1. checks out the selected non-main base branch;
2. creates a unique `agent/*` work branch;
3. gives Codex the task plus repository instructions;
4. runs whitespace/diff validation and configured focused checks;
5. pushes only the agent branch;
6. opens a draft PR against the selected project branch;
7. leaves review and merge to the owner.

No automatic merge, no pushes to `main`, no secret access beyond the model key, no deployment, no billing changes, and no unbounded repair loop.

## Resource and retry limits

- One agent job per manual dispatch.
- GitHub Actions timeout: 20 minutes.
- One Codex execution per job; no recursive self-triggering.
- No automatic retry loop in this foundation.
- Use focused tests first; full Android emulator E2E is not run automatically by the agent until its cost/time and emulator reliability are understood.
- Keep the owner-set monthly budget at RUB 500; stop model execution if usage approaches that amount.

## Enablement checklist

1. Confirm the repository is on the intended project branch and review this foundation.
2. Create an OpenAI API project/key only if API billing is acceptable.
3. Configure provider-side usage limits/alerts and add the key as GitHub Actions secret `OPENAI_API_KEY`.
4. Manually dispatch `AI Engineer (manual)` on `feature/ai-engineer-foundation` or another approved non-main branch.
5. Review the generated draft PR and CI evidence.
6. Only after a successful pilot, consider adding automatic triggers for trusted CI failures.

## Known limitation

A GitHub Actions job cannot silently use a ChatGPT Free/Plus sign-in allowance as an API key. API-key execution is billed separately. If the owner does not add an API key, the workflow remains safely disabled and the existing Termux monitor continues to operate without AI repair.
