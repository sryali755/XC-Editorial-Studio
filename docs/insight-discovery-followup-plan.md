# Insight Discovery prompt implementation — follow-up

## Inspection and reuse

- Branch: `insight-discovery-poc`; starting commit `3da72b5`; clean working tree.
- Reuse the existing Dynamic Input Pack and preparation outputs, provider/model abstractions, five independent Discovery lenses, version history, optional Discovery session state, explicit approval handoff, execution direction and XC Brief/export components.
- Keep the restored creative source files and eight legacy specs exactly equal to `fc4dfd3^`. Keep the existing public flag and creative entry untouched. Discovery-specific changes belong in isolated modules; shared contracts may receive additive Discovery fields only.
- No live source connector, enterprise identity, or document-ingestion integration is present. The existing provider performs model generation, not retrieval. Do not introduce an assumed connection, change models/reasoning effort, or incur live-model test spending.

## Gaps and implementation order

1. Add a supplied-source catalog/adapter boundary used by Discovery validation and source coverage. Verify exact excerpts against their named source; exclude generated Sparks, adaptations and unsourced model interpretations as evidence. Preserve upstream approval status and treat unavailable sources as research gaps.
2. Persist agent, finding and connection drafts and routing choices. Keep agent and finding threads separate, record question/type/pack/finding/run references, preserve failed requests for scoped retry, and add Set aside/restore plus exact-version saved finding inspection.
3. Fingerprint the complete contextual snapshot. Retain input snapshots on research runs; distinguish available sources before analysis from analyzed sources after a successful response.
4. Make the whole human strategy canvas available during pending/failed research, preserve its drafts, and carry only explicitly approved human strategy into the existing final brief through an isolated handoff adapter. Preserve source RTB/JTBD and approval metadata separately.
5. Improve Discovery modal keyboard/focus handling and compact mobile navigation using the existing design system.
6. Add new Discovery unit/browser specs for the gaps, run full legacy browser suites with the flag off and on, AI tests, lint/typecheck/build, and verify the restored-file diff remains empty. Commit locally; do not push or deploy.

## Limits requiring future decisions

Authorized retrieval, source permissions beyond supplied local content, documented outside-industry case retrieval, and enterprise persistence need actual approved connections/identity infrastructure. Adapter boundaries and honest gaps are deliverable now; those integrations are not claimed as functional.
