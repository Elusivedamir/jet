# Repository inventory — greenfield reset

**Snapshot date:** 2026-11-23  
**Scope:** Git refs and tracked-file trees inspected through GitHub API. This is a structural inventory, not a full source-code, security or test audit.

## Current working references

| Branch | Commit | Status |
|---|---|---|
| `main` | `567931fe0af597e82543de3f583af2c533ee609d` | Stable reference; unchanged |
| `project/greenfield-reset` | `da073c24c5d90df8e400e99fcee3507fad8ad908` | Active discovery baseline |
| `research/repository-landscape` | advanced to the greenfield documentation baseline; temporary extraction payload was removed | Research work area |

## Main branch contents

Five tracked files:
- two GitHub Actions workflows;
- original business-plan PDF;
- README;
- an empty file named `Бизнес план` (blob SHA `8b137891791fe96927ad78e64b0aad7bded08bdc`, one newline).

No application source code is present on `main`.

## Greenfield baseline contents

Nine tracked files:
- original business-plan PDF (same blob SHA as main);
- README;
- master prompt;
- business-plan transcription (explicitly unverified);
- branch strategy;
- repository research method;
- provisional visual direction;
- two copied GitHub Actions workflows.

No production application source code is present on this branch. No technology or architecture has been selected.

## Historical implementation branch family

Structural inspection of these branches found approximately 59–61 tracked files:
- `project/foundation-and-juggleim-poc`;
- `feature/ai-engineer-foundation`;
- `architecture/greenfield-jetson-backend`;
- `docs/jetson-greenfield-lanset-alignment`.

The inspected trees contain:
- Android Java proof-of-concept client and Gradle build files;
- JuggleIM deployment/Compose configuration, SQL and reverse-proxy setup;
- Android emulator, transport-probe and JuggleIM E2E workflows;
- scripts for certificates, emulator setup, test-user provisioning and diagnostics;
- JuggleIM SDK/static audits and architecture proposals;
- LansetSpBot reuse audit;
- old master prompts, engineering rules and diagnostics.

**Classification:** historical PoC, technical experiments, automation and research. These are preserved as evidence, not treated as approved product implementation or a required foundation. No files or branches were deleted.

## Branch inventory

The repository currently has 12 branches:
- `agent/klinch-45250374246`;
- `architecture/greenfield-jetson-backend`;
- `chore/enable-ai-engineer-workflow`;
- `docs/jetson-greenfield-lanset-alignment`;
- `feature/ai-engineer-foundation`;
- `feature/klinch-codex-provider`;
- `feature/klinch-workflow-dispatch`;
- `fix/klinch-openai-secret-name`;
- `main`;
- `project/foundation-and-juggleim-poc`;
- `project/greenfield-reset`;
- `research/repository-landscape`.

Branch names alone do not establish whether their commits are useful, merged or safe. A later audit must inspect ancestry, open PRs, workflow runs and unique commits before any cleanup proposal.

## Automation risks found

- The copied KLINCH workflow defaults to `feature/ai-engineer-foundation`, an obsolete technical branch.
- Its base-branch allowlist does not include the new `research/*` or `work/*` naming scheme.
- The copied manual workflow defaults to `project/foundation-and-juggleim-poc`.
- GitHub Actions workflow dispatch uses the workflow definition on the default branch; editing copies on this working branch does not change the currently active workflow on `main`.
- Existing workflows have write permissions to contents and pull requests. They must not be run against an obsolete base or allowed to change product scope.

These workflow copies are corrected on the greenfield branch for future review. They are not activated on `main`, and no workflow was run as part of this inventory.

## Pull request and automation status checked

- PR #1 remains **open draft**, base `main`, head `project/foundation-and-juggleim-poc`. Its body explicitly describes a JuggleIM Android integration PoC and says it is not the Jetson MVP or a production stack decision. It contains an unfinished server-backed E2E verification checklist. It is therefore historical/experimental and must not be treated as the current project baseline. It was not closed because closing an owner-created PR is a separate repository action; no merge occurred.
- PR #7 is **closed, not merged**. Its former LansetSpBot/first-party backend alignment is superseded by the greenfield direction.
- Recent KLINCH workflow run #3 (run ID `45250374246`) is completed with failure after rerun; run #2 (ID `45249540771`) completed successfully. These are runs on `main` and do not validate the newly updated workflow copies on `project/greenfield-reset`. The failed run's precise cause still needs job-log inspection.

## Not yet verified

- Original PDF text and page-by-page business-plan traceability.
- Full branch ancestry and unique-commit relationships.
- Open/closed status and merge state of every PR.
- Workflow run history, current secrets/permissions and provider-side spend limits.
- Source-level correctness, vulnerabilities, license compliance and reproducibility of the historical PoC.
- Whether the previous Android/transport tests still run on current runners.

## Next gate

1. Read and reconcile the original PDF.
2. Complete branch ancestry/PR/workflow audit.
3. Decide which historical research files are worth extracting into technology-neutral lessons.
4. Begin repository discovery and screening only after the product requirements have source-page traceability.
