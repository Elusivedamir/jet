# zizmor baseline audit — 2026-11-27

**Status:** findings recorded; remediation not yet completed.  
**Source run:** https://github.com/Elusivedamir/jet/actions/runs/46032883696  
**Audited merge commit:** `892532f0f726548587b41e3a9ec3eb40867c2184` (PR #46 test merge ref).  
**Tool:** zizmor CLI `v1.30.1`, zizmor-action `v0.8.0`, auditor persona, minimum severity medium.

## Result

The initial full-repository scan reported **40 findings total**, of which **14 were ignored** by zizmor's configuration. The active severity summary was **15 high** and **11 medium**. This is a repository baseline, not a finding set introduced by PR #46.

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

The table records confirmed examples visible in the run log; it is not asserted to enumerate every one of the 40 findings. The exact run log remains the primary evidence.

## Required follow-up

1. Review the two AI-engineer workflows separately before changing them: they may have been intentionally designed to create branches/PRs. Replace workflow-wide write permissions with the narrowest job-level permissions and require explicit review of any Codex action invocation.
2. Pin every third-party action to a reviewed immutable commit SHA; do not blindly apply auto-fixes.
3. Pin PostgreSQL service images by verified digest, keeping the intended PostgreSQL 17.12 version.
4. Set `persist-credentials: false` on checkout steps that do not need authenticated Git operations.
5. Put sensitive AI-agent execution behind a protected GitHub Environment with required reviewers where practical; preserve the secret names and never expose values in logs.
6. Rerun the full baseline audit and update this report with exact findings remaining and evidence of remediation.

No existing workflow was modified as part of this baseline record. The findings remain open pending a separate scoped remediation review.
