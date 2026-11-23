# Branch strategy — greenfield reset

## Stable and active branches

- `main`: stable reference only; no direct work.
- `project/greenfield-reset`: clean project baseline for discovery and approved requirements.
- `research/repository-landscape`: research index, candidate reviews and comparative evidence, branched from the current project baseline.
- `work/<stage>-<task>`: focused work branches created from the current approved project baseline.

## Rules

1. Do not base new work on branches whose purpose or contents are tied to JuggleIM or the earlier fixed-stack proposal.
2. Do not delete historical branches, commits, experiments or diagnostics as part of the reset. They are archived by status, not erased.
3. Do not create a permanent branch for every technology candidate. Keep comparisons in research records.
4. Architecture/stack ADR branches are not created until evidence supports a real decision.
5. Every PR states its base branch, scope, tests/evidence, unresolved questions and rollback path.
6. No merge/deployment/release without explicit owner approval.

## Superseded historical branches

Existing branches such as `project/foundation-and-juggleim-poc`, `feature/ai-engineer-foundation`, `architecture/greenfield-jetson-backend` and `docs/jetson-greenfield-lanset-alignment` are historical records. Do not use them as the starting point for new work. The prior Draft PR #7 was closed as superseded and was not merged.
