# Insight Discovery isolation plan

## Current state and reuse map

- The existing preparation flow, Dynamic Input Pack, Sparks, creative Round Table components, brief-line selection/blending, approval gate, execution direction, and XC Brief are implemented in the current application.
- `StrategyWorkspace` previously orchestrated the creative Round Table and downstream stages. The current WIP replaces its step 1 with Insight Discovery and changes the preparation CTA and several existing labels; it is not an isolated mode yet.
- The new `InsightDiscoveryWorkspace`, `lib/discovery.ts`, discovery prompts, provider schemas, mock responses, and discovery tests are useful feature-specific work and should be retained in isolated modules.
- Source connectors are not present for the named research systems. Discovery must continue to say it only analyzes supplied context until an authorized retrieval adapter is actually available.

## Approved implementation sequence

1. Restore the pre-WIP creative workflow from the parent commit for existing creative files, preserving unrelated demo-state changes already in that parent. Re-enable the original Round Table, refinement, shortlist/blending, brief-line approval, and downstream behavior; restore its tests instead of skipping them.
2. Keep discovery-specific components and services in new isolated files. Add a feature-flagged mode selector/navigation entry without replacing, relabeling, or conditionally mutating the creative Round Table implementation.
3. Route Insight Discovery through a separate workspace path while sharing only stable input-pack, persistence, and explicitly human-approved handoff contracts. Keep upstream RTB/JTBD distinct from editable investigation questions.
4. Add or adapt tests for both modes: creative Round Table regression coverage must remain enabled; discovery tests cover lens-specific context, evidence provenance, versions, threads, source statuses, and navigation/draft persistence.
5. Run typecheck, lint, relevant unit/browser suites, and production build. Document actual source connector gaps and any incomplete acceptance criteria. Do not deploy or push.

## Review and status

The WIP commit `fc4dfd3` is the local restore point on `insight-discovery-poc`. The audit found that `StrategyWorkspace` and existing workflow tests had been changed to make Discovery the only active stage. Commit `43cacd5` restored the creative files and specs exactly from `fc4dfd3^`. Discovery now lives in new components/services, and the page-level feature flag adds the separate entry without editing the restored files.
