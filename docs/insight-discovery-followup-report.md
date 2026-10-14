# Insight Discovery implementation report — October 14, 2026

Branch: `insight-discovery-poc`. Starting state: `3da72b5`. Local implementation and commits only; no push, merge, deployment or new service. Model and reasoning settings are unchanged. Validation used deterministic mock providers and transport fixtures, without live generation calls. The application was started on localhost:3000 at the user's request using the existing `.env.local`; HTTP 200 was verified.

## Architecture and completed behavior

The existing preparation flow, Dynamic Input Pack, Sparks, creative Round Table, brief-line selection/blending, execution form, final brief preview and exports are reused. Discovery remains an optional portal/workspace controlled by `NEXT_PUBLIC_INSIGHT_DISCOVERY`. All Discovery UI, orchestration, copy and prompts live in isolated modules. Shared integration points add optional contracts, a Discovery-only evidence validator, and an optional final-brief adapter. Creative callers without a Discovery approval receive the original brief object unchanged.

- A supplied-source provider/catalog verifies case-sensitive, contiguous excerpts against their named sources, allowed locators, original source values and metadata. Generated research planning, adaptations, Sparks, edited review text, prior agent interpretations and human hypotheses cannot supply independent proof. Connected/restricted-source claims are rejected. Original RTB approval remains separate.
- All five lenses receive the same selected snapshot. Each run retains that full snapshot and canonical cards with the requested observed finding, evidence references, interpretation, limitations, next question, lens, input version, run and timestamp fields. The fingerprint includes the complete contextual foundation, including reviewed context, research emphasis and approval metadata.
- Available supplied context is distinguished from analyzed supplied context. Enterprise and web/case-study sources remain not connected. Contrary-evidence, recency and absent-case mock actions return honest gaps. Model/provider failures remain failures; no live-to-mock fallback was introduced.
- Lens and finding threads are separate and retain investigation, pack, finding and run references. A failed request retains its exact action, selected finding and guidance for an independent retry. Cancellation preserves earlier outputs; interrupted requests require explicit retry.
- Unsent lens/finding/connection drafts, route choices, working notes and canvas fields persist across lens switches, history navigation and reopening. Drafts are scoped by source brief; unmatched legacy drafts remain archived intact instead of mixing into another campaign.
- Saved findings and Set aside retain exact versions. Saved references can be inspected in full and reopen the original run. Connection notes retain exact source versions and clear demo/interpretation status.
- The whole human canvas can be opened during pending or failed research. Explicit approval freezes its human content and hands it to the existing execution/XC Brief workflow. Source evidence and confirmed execution requirements supply packaging fields; unapproved model strategy is excluded. Private working notes do not enter the final brief. Later edits do not silently rewrite a previous approval. Discovery remains accessible from later stages.
- Keyboard lens navigation, modal focus containment/return, Escape handling and compact mobile selectors are implemented. Discovery CSS is scoped to prevent changes to the creative UI; the original CSS prefix matches the parent commit.

## Files changed

| File | Change |
| --- | --- |
| `app/globals.css` | Scope Discovery styles; canvas and compact mobile/inspection styles. |
| `components/InsightDiscoveryFeature.tsx` | Single authoritative draft, scoped orchestration, retries/cancellation and development-effect-safe startup. |
| `components/InsightDiscoveryPortal.tsx` | Per-brief persistence, current snapshot review, explicit canvas approval and later-stage reentry. |
| `components/InsightDiscoveryWorkspace.tsx` | Persistent composers, separate threads, source inspection, saved/aside references and whole-canvas navigation. |
| `components/SavedDiscoveryFinding.tsx` | New exact-version reference inspection. |
| `components/useDiscoveryDialog.ts` | New modal keyboard/focus handling. |
| `lib/discovery.ts` | Complete fingerprint, snapshots/canonical cards, original-version targeting, provider provenance and exact connection references. |
| `lib/discovery-sources.ts` | New supplied-source adapter and honest coverage catalog. |
| `lib/discovery-contract.ts` | New canonical persisted card contract, compatible with existing model/UI names. |
| `lib/discovery-state.ts` | New scoped thread, draft, retry and interrupted-run transitions. |
| `lib/discovery-persistence.ts` | New per-source storage keys and guarded legacy migration. |
| `lib/discovery-handoff.ts` | New immutable human-approval snapshot and existing execution handoff. |
| `lib/discovery-brief.ts` | New approval-only final packaging; excludes private notes and unapproved model strategy. |
| `lib/types.ts` | Additive optional Discovery metadata, drafts, retry and approved-canvas contracts. |
| `lib/ai/discovery-client.ts` | New cancellable client using the existing agent endpoint and output schemas. |
| `lib/ai/discovery-evidence.ts` | New exact source/excerpt/locator/metadata validator. |
| `lib/ai/discovery-prompts.ts` | Original-source rules, authority boundaries, provenance catalog and documented-case limitations. |
| `lib/ai/mock-discovery.ts` | Honest gaps and preserved original research/RTB quotes. |
| `lib/ai/provider.ts` | Delegate the Discovery-only validator into its isolated module. |
| `lib/ai/schemas.ts` | Optional Discovery finding provider metadata for follow-ups. |
| `lib/ai/format.ts` | Optional isolated Discovery adapter after original creative formatting. |
| `tests/ai/discovery-followup.spec.ts` | Seven new unit/contract/provenance/state/approval/cancellation tests. |
| `tests/discovery-followup.spec.ts` | Three new browser tests covering drafts/mobile/keyboard, scoped retries/history and canvas-to-final-brief navigation. |
| `tests/insight-discovery.spec.ts` | Existing Discovery test now verifies retrying the original failed action and selected version. |
| `docs/insight-discovery-followup-plan.md` | Inspection/reuse decisions and implementation plan, written before code changes. |
| `docs/insight-discovery.md` | Source, persistence, cancellation, approval and testing documentation. |
| `docs/insight-discovery-followup-report.md` | This completion report. |

## Final verification

| Check | Result |
| --- | --- |
| `npm run test:ai` | 54 passed. |
| Full browser suite, flag on, 2 workers | 44 passed; 1 flag-off-only test skipped. |
| Full browser suite, flag off, 2 workers | 41 passed; 4 Discovery-only tests skipped. |
| `npm run lint` | Passed, no errors or warnings. |
| `npm run typecheck` | Passed. |
| Production build with flag on | Passed; `/`, `/_not-found`, `/api/ai/agent` compiled. |
| `git diff --check` | Passed. |
| Restored source/spec diff from `fc4dfd3^` | Empty, 0 files changed. |

An earlier 5-worker browser run timed out while setting up a browser page for an unchanged legacy test, before its application assertions ran. That test passed alone, and both complete suites subsequently passed with 2 workers. No legacy specs, assertions or timeouts were weakened. Builds and browser suites ran in an isolated temporary copy on port 3102; the restarted port-3000 server was not stopped or rebuilt by validation.

The exact restored-file verification was:

```sh
git diff fc4dfd3^ --stat -- components/StrategyWorkspace.tsx components/AgentRoundTable.tsx lib/roundtable-prompts.ts lib/ai/sparks-prompts-v1.ts components/DynamicInputPack.tsx components/InputPackDetails.tsx components/PreparationWorkspace.tsx components/UpstreamContextPanel.tsx app/layout.tsx lib/ai/client.ts lib/ai/context.ts tests/agent-refinement.spec.ts tests/ai-workflow.spec.ts tests/input-pack.spec.ts tests/preparation-flow.spec.ts tests/sparks-refinement.spec.ts tests/upstream.spec.ts tests/workflow.spec.ts tests/workspace-improvements.spec.ts
```

The command produced no output. All eight legacy specs remain enabled in both flag modes.

## Unavailable integrations and POC limits

No authorized Tableau, iSpot, ACE, Datorama, Brand Hub, customer-research or external case-study/web connector exists in this repository. No new external evidence or documented outside-industry cases were retrieved. The supplied-context adapter and honest research gaps are implemented; actual retrieval needs real approved connectors. PDF/PPT ingestion, enterprise identity/entitlement enforcement and production persistence remain unavailable. Source permission validation here rejects connected/restricted claims and only accepts user-supplied sources; it does not claim enterprise authorization functionality.

Browser cancellation stops waiting, but a request already accepted by the server/provider may still finish. Storage is local to the current browser tab. Approval records human strategy, not evidence verification or GTM/product approval.

Pete/Samson decisions are needed before adding actual source connections: approved systems/access scopes, credentials and identity enforcement, retention/export permissions, documented analogous-case sources, and live retrieval/cost limits. These integrations were not invented or enabled as part of this implementation.
