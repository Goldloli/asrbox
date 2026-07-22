## Context

ASRbox is a brownfield public-beta product with working code, tests, user guides, release runbooks, legal records, and several completed Superpowers plans. Product requirements are currently mixed with dated verification counts, endpoint inventories, implementation instructions, and user-facing explanations. OpenSpec has been initialized, but only agent-development governance has been accepted into the main specs.

The migration must preserve useful audience-specific documentation while eliminating competing behavioral sources of truth. It must also avoid changing runtime behavior or treating historical test evidence as a permanent requirement.

## Goals / Non-Goals

**Goals:**

- Capture the current product's core observable behavior and risk boundaries as accepted baseline capabilities.
- Give each maintained document type one clear owner and lifecycle.
- Replace manually synchronized compatibility and quality snapshots with specs backed by code, tests, CI, or release evidence.
- Remove completed planning artifacts after their current constraints have been preserved.
- Keep public documentation useful to users and contributors.

**Non-Goals:**

- Specify every route, field, component, model implementation, or internal helper in prose.
- Replace FastAPI OpenAPI output, typed models, automated tests, CI configuration, legal notices, or user guides with OpenSpec.
- Rewrite application behavior, change supported platforms, or raise the product from beta to stable.
- Reformat or reorganize unrelated code and documents.

## Decisions

### Baseline behavior by capability, not by file tree

Main specs will describe externally meaningful workflows and protected invariants. They will not mirror source directories or copy whole user guides. This keeps future delta specs small and prevents implementation detail from becoming an accidental product promise.

Alternative considered: create one monolithic `asrbox-product` spec. Rejected because unrelated changes would repeatedly edit the same large file and make ownership unclear.

### Keep audience documents and remove competing policy snapshots

README, user guides, contributor guidance, privacy and security notices, release runbooks, legal records, release notes, and test evidence remain. Completed Superpowers plans, dated audit notes, and the backend maturity score are removed because they are neither current product specifications nor maintained operational guides.

### Split exact contracts from compatibility policy

FastAPI models and generated OpenAPI define exact API shape. Contract tests verify the frontend/backend boundary. OpenSpec records compatibility expectations and coordinated-change rules. The hand-maintained endpoint inventory in `backend/API_FREEZE.md` is removed after these requirements are captured.

### Treat verification output as evidence

Test counts, screenshots, model-run results, and release checks are evidence from a point in time. Stable acceptance requirements live in OpenSpec and executable gates; dated evidence remains under release or test-result locations when it is useful and reproducible.

### Preserve historical recovery through Git and OpenSpec archives

Superseded tracked plans can be deleted because Git retains them. Future accepted changes are preserved under `openspec/changes/archive/`, so active documentation does not need a second historical planning tree.

## Risks / Trade-offs

- [Risk] Baseline specs overstate behavior that is only aspirational. -> Derive requirements from current code, tests, public documentation, and shipped beta boundaries; keep future work out of the baseline.
- [Risk] User docs drift from accepted specs. -> Require behavior changes to update affected specs and owned public documentation in the same change.
- [Risk] Removing `API_FREEZE.md` makes endpoint discovery harder. -> Use generated OpenAPI for exact discovery and contract tests for the maintained compatibility surface.
- [Risk] Historical context becomes less visible in the working tree. -> Preserve release notes, real-model evidence, OpenSpec archives, and Git history while deleting only completed planning or dated score documents.

## Migration Plan

1. Archive the completed agent-guidance change and sync its delta spec.
2. Add baseline delta specs for core product capabilities and documentation ownership.
3. Update maintained guides and agent instructions to point to OpenSpec, generated contracts, tests, and focused runbooks.
4. Delete superseded plans and snapshots only after their active constraints are represented in specs.
5. Validate the change, check repository links and diffs, then archive to create the main baseline specs.

Rollback consists of restoring the removed Markdown files from Git and reverting the documentation references. No runtime or persisted-data rollback is required.

## Open Questions

None. New product behavior discovered during future implementation will be proposed as a separate OpenSpec change rather than added speculatively to this baseline.
