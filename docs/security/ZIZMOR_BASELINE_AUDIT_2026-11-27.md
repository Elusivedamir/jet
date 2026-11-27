# zizmor baseline audit — 2026-11-27

**Status:** findings recorded; remediation not yet completed.  
**Source run:** https://github.com/Elusivedamir/jet/actions/runs/46032883696  
**Audited merge commit:** `892532f0f726548587b41e3a9ec3eb40867c2184` (PR #46 test merge ref).  
**Tool:** zizmor CLI `v1.30.1`, zizmor-action `v0.8.0`, auditor persona, minimum severity medium.

## Result

The initial full-repository scan reported **41 findings total**, of which **15 were ignored** by zizmor's configuration. The active severity summary was **15 high** and **11 medium**. This is a repository baseline, not a finding set introduced by PR #46.

The baseline job is advisory while the existing workflows are triaged. A separate blocking job checks the workflow files changed by the current PR, so new workflow changes cannot inherit the old baseline debt as an unexplained green result.

## Confirmed finding families and locations

The visible job log included the following findings:

| File | Finding | Severity / note |
|---|---|---|
| `.github/workflows/ai-engineer-klinch.yml` | Workflow-level `contents: write` and `pull-requests: write` | High; broad permissions |
| `.github/workflows/ai-engineer-klinch.yml` | `actions/checkout@v4`, `openai/codex-action@v1`, `actions/upload-artifact@v4` are not SHA-pinned | High |
| `.github/workflows/ai-engineer-klinch.yml` | Secret references are outside a dedicated GitHub Environment | Medium |
| `.github/workflows/ai-engineer-manual.yml` | Workflow-level `contents: write` and `pull-requests: write` | High; broad permissions |
| `.github/workflows/ai-engineer-manual.yml` | `actions/checkout@v4`, `openai/codex-action@v1`, `actions/upload-artifact@v4` are not SHA-pinned | High |
| `.github/workflows/ai-engineer-manual.yml` | Secret references are outside a dedicated GitHub Environment | Medium |
| `.github/workflows/go-durable-message-poc.yml` | PostgreSQL service image uses `postgres:17.12` without a digest | High |
| `.github/workflows/kotlin-message-poc.yml` | PostgreSQL service image uses `postgres:17.12` without a digest | High |
| `.github/workflows/node-message-poc.yml` | PostgreSQL service image uses `postgres:17.12` without a digest | High |
| `.github/workflows/sqlite-adapter-tests.yml` | `actions/checkout@v4` and `actions/setup-python@v5` are not SHA-pinned | High |
| Existing checkout steps | Some do not set `persist-credentials: false` | Low-confidence `artipacked` warnings |

The table records confirmed examples visible in the run log; it is not asserted to enumerate every one of the 41 findings. The exact run log remains the primary evidence.

## Remediation completed on 2026-11-27

The workflows were remediated on branch `governance/continuous-quality-security-gates-2026-11-27`:

- Moved write permissions from workflow scope into the two manually dispatched AI workflow jobs; all workflows now default to read-only permissions.
- Pinned checkout, Codex action v1.14, upload-artifact and setup-python actions to immutable commit SHAs.
- Added `persist-credentials: false` to checkout steps. The two dormant manual agent workflows use `gh auth setup-git` with the job-scoped token only when a branch push is actually performed.
- Added the `ai-engineering` GitHub Environment to secret-consuming jobs. Environment protection reviewers/branch restrictions remain GitHub repository settings and were not configured by this repository-file change.
- Pinned PostgreSQL 17.12 service containers to the multi-platform manifest digest `sha256:cdbfb3de010ef603c29f10a5dfc79e023f66ad662ec6fddcda7130afe5d65e7b`.

Fresh full-repository zizmor audit: **PASS**, no findings to report (15 default-ignored findings), covering all eight workflow files. Fresh changed-workflow audit: **PASS**, no findings. Evidence: [continuous security workflow run #63](https://github.com/Elusivedamir/jet/actions/runs/46034027567), commit `bccb1135360245b77526e446bc575baea5b5aaa4`.

The 15 ignored entries are zizmor's default ignored rules, not 15 unresolved findings. This report preserves the historical initial scan and records the post-remediation result separately.

## Required follow-up

1. Review the two AI-engineer workflows separately before changing them: they may have been intentionally designed to create branches/PRs. Replace workflow-wide write permissions with the narrowest job-level permissions and require explicit review of any Codex action invocation.
2. Pin every third-party action to a reviewed immutable commit SHA; do not blindly apply auto-fixes.
3. Pin PostgreSQL service images by verified digest, keeping the intended PostgreSQL 17.12 version.
4. Set `persist-credentials: false` on checkout steps that do not need authenticated Git operations.
5. Put sensitive AI-agent execution behind a protected GitHub Environment with required reviewers where practical; preserve the secret names and never expose values in logs.
6. Rerun the full baseline audit and update this report with exact findings remaining and evidence of remediation.

The original scan was a baseline only. The listed workflow findings were remediated and the exact post-fix repository-wide scan returned no findings. Re-run zizmor on every subsequent workflow change; this result applies only to the exact commit above.
