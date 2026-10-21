# Phase 1 — Input Pack refinement and exact selected framing

Date: 2026-10-19. Application: XC Editorial studio, branch `insight-discovery-poc`, starting HEAD `9c8134a`.

## A. Architecture findings

The supplied shell workspace is a different repository. The XC application was located at `/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio`; the requested branch was already active. Existing modified and untracked work was preserved. Implementation and initial verification used a separate source snapshot in `/private/tmp/xc-phase1-test.8X7pbh`, with installed dependencies reused, no environment files copied, and no application server started.

The application uses Next 16.3.8, React 19.3, and TypeScript 6. The installed Next server/client, forms, and CSS guides were reviewed. No dependencies, configuration, production AI integrations, or credentials were changed.

| Stage              | Actual implementation                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four-tab entry     | `app/page.tsx` selects `InsightDiscoveryStudio` by default. Its `inputs`, `discovery`, `strategy`, and `brief` screen state retains Input Pack → Insight Discovery → Finalize Strategy → XC Brief.                                  |
| Upload/extraction  | `components/DocumentFileImport.tsx` calls `lib/document-import.ts` locally in the browser. Extracted text remains editable. `sourceDocumentText` retains the composite document.                                                    |
| Campaign selection | `lib/imc-campaign-scope.ts` scopes the selected campaign and shared platform context. `selectedCampaignScope` does not change when the display name changes.                                                                        |
| Campaign naming    | `CampaignIdentityPanel` displays source candidate, source excerpt and attribution. `confirmStudioCampaignName` validates human display metadata without rewriting source evidence.                                                  |
| Preparation        | `DiscoveryInputPack.run` calls the unchanged `preparationService.generate`. RTB/JTBD, Data and Sparks versions live in `session.preparation.outputs`; current versions must match `sourceSnapshot`.                                 |
| Selected inputs    | `selectedRtbVersionId`, `selectedResearchIds`, `selectedSparkIds`, kept Sparks, current version IDs and immutable preparation versions retain their existing meanings.                                                              |
| Composition        | `lib/discovery-studio.ts:studioPack` composes source facts, original RTBs, original/proposed source jobs, selected XC framing, research and validated selected Sparks.                                                              |
| Discovery          | `discoveryFoundation` extends `selectedFoundation`. All five Discovery request prompts receive the selected foundation, including `currentRtb.proposal`, selected version IDs, source text and selected context.                    |
| Strategy           | `seedStudioDiscovery`, `workspace-canvas-prefill.ts` and `workspace-suggestions.ts` create initial suggestions separately from human edits. Existing Working Space behavior was not redesigned or rewritten.                        |
| Persistence        | `InsightDiscoveryStudio.changeSession`/`persist`, `browser-workspace-store.ts` and `discovery-persistence.ts` retain sessionStorage/IndexedDB storage, source-scoped drafts, pack histories, field versions and approval snapshots. |

### Verified defects

1. `studioPack` called `.trim()` on the selected version's complete `xcAdaptation`. Internal paragraphs survived, but outer whitespace was lost. Step 3 showed only a summary tile, with the full proposal hidden inside expandable context and labeled as an RTB adaptation rather than visible JTBD.
2. Unrun cards displayed original-JTBD absence and disconnected-source labels before preparation. A new campaign could also surface an earlier campaign's stored preparation error; the history disclosure iterated all versions rather than the already source-filtered versions used by the picker.
3. The campaign-name confirmation button held necessary validation. Simply removing it would leave edits unapplied at Build time.
4. Preparation success/failure callbacks lacked a current-source check. A delayed response could write status/output into a different campaign after a source switch.

## B. Changes implemented

### Input Pack UI

- Removed the separate Confirm Campaign Name button. Existing editable naming, original excerpt and attribution remain. Blur/Enter commits an existing campaign's valid edit; Build atomically validates and applies the current name before starting preparation. Invalid names cannot publish a partial change.
- Removed the supplied/fictional sample loader controls and UI-only sample imports. Sample source files and all fixtures remain.
- Added compact Regenerate/Retry actions beside each preparation heading and compact Regenerate All Agents beside Prep Agents. These call the existing individual/combined handlers. Removed the duplicate Sparks regenerate-all button. The distinct steering-and-save control remains when steering text is present.
- Added truthful derived unrun/generating/ready/failed presentations. Source absence and disconnected-source disclosures appear after an applicable result, not as premature analysis on an unrun card. Optional source-interest controls remain available.
- Filtered displayed preparation history by active source without deleting historical versions. Edited/unbuilt source cannot display prior campaign outputs as current results.

### JTBD mapping

- Removed trimming from the authoritative selected adaptation mapping.
- Added a visible two-column JTBD row with complete selected proposal text and paragraph-preserving wrapping, no line clamp, overflow clipping or height limit. Narrow layouts stack the row.
- Added deterministic `selectedJtbdFraming(pack)` access to the existing value and selected version reference; no second persisted/editable JTBD copy was introduced.
- Explicitly labels this as AI-proposed, not original or approved. Original JTBD absence and original RTBs remain separate.

### Validation/error handling

- Preserved Sparks schemas, exact-excerpt validators and production request path unchanged.
- Targeted Spark retry preserves earlier successful versions/selections and unrelated agent outputs on failure.
- Added source guards to asynchronous completion/failure callbacks so stale work cannot modify another campaign.
- All mocks and network-denial code are test-only. No production integration was replaced by a mock.

## C. Exact files changed

Existing files changed relative to the pre-task snapshot:

1. `components/DiscoveryInputPack.tsx` — Input Pack controls, states, naming handoff, source-safe completion/history and full JTBD display.
2. `components/CampaignIdentityPanel.tsx` — remove redundant confirmation button, commit editable name on blur/Enter.
3. `lib/discovery-studio.ts` — preserve selected `xcAdaptation` verbatim rather than trimming it.
4. `app/studio-wireframe.css` — Input Pack-scoped compact action layout and full multiline JTBD row.

New files:

5. `lib/input-pack-presentation.ts` — derived card states, atomic build/name adapter and selected-framing reference.
6. `tests/fixtures/phase1-input-pack.ts` — deterministic versions based on approved Movers/Pro source fixtures; long proposal explicitly labeled synthetic.
7. `tests/helpers/phase1-no-api.cjs` — test-process preload that rejects fetch, HTTP(S) and socket connections before transport.
8. `tests/helpers/phase1-component-harness.ts` — actual component handler/React SSR tests using test-only injected generation. Browser PDF-worker initialization is isolated from SSR; the real upload control markup and parent's import callback remain tested.
9. `tests/phase1/input-pack.spec.ts` — 12 component/handler checks, no browser/server/API.
10. `tests/ai/phase1-input-pack.spec.ts` — 9 model, persistence, selection, source-validation and downstream prompt checks.
11. `playwright.phase1.config.ts` — existing runner used without browser fixtures or a webServer.
12. `docs/phase1-input-pack-verification.md` — this report.

No Round Table, Working Space, Finalize Strategy, XC Brief, API route, provider, schema, extraction, dependency or credential files were changed in this phase.

## D. Exact JTBD data flow

```text
preparation.outputs[reasonToBelieve].versions[selectedRtbVersionId]
  [same sourceBrief; valid rtb schema; original RTB matches source]
    .data.xcAdaptation                 (complete immutable selected output)
      → studioPack(session).proposedRTB (existing compatibility field, now untrimmed)
        → selectedJtbdFraming(pack).text → visible Dynamic Input Pack JTBD row
        → discoveryFoundation(pack).currentRtb.proposal
          → each of the five Discovery request schemas and prompts
          → foundationPack(...).proposedRTB
```

`pack.originalJTBD` and `jtbdContext.original` still contain only explicitly supplied original jobs. Movers and Xfinity Pro fixture sources contain no formal original JTBD; both remain empty. Original source RTBs retain their wording and prospect qualifications independently from approval status. The proposal is not promoted into `campaignContext.jobToBeDone` or a human-approved line. Phase 3 can reference the selected proposal through this existing pack/adapter without a duplicate persisted field.

Existing Working Space suggested prose may be normalized by its own presentation logic; this phase changes neither that initializer nor Kevin's editable JTBD/Brief Line. Restoring a pre-fix trimmed pack keeps the same source-scoped draft key and preserves exact human text, intentional empty fields and saved field histories.

## E. Test results

Final applied-source verification:

| Check                                                         | Actual result                                                                                                                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing offline AI suite plus 9 new model/persistence checks | **307 passed**, 0 failed, 0 skipped; 24.6 seconds. Includes real local PDF extraction and in-process mocked request handling, not HTTP API requests.                                                  |
| New actual-component rendering/handler suite                  | **12 passed**, 0 failed, 0 skipped; 1.7 seconds.                                                                                                                                                      |
| Unique offline tests                                          | **319 passed**: 298 existing tests and 21 added tests. Repeated setup/debug runs are not counted again.                                                                                               |
| Applied-source TypeScript                                     | PASS: `tsc --noEmit --incremental false`.                                                                                                                                                             |
| Applied-source ESLint                                         | PASS: `eslint .`, no warnings/errors.                                                                                                                                                                 |
| Isolated optimized production build                           | PASS: `next build --webpack`, including compilation, TypeScript, static generation and tracing, with the network-denial preload active.                                                               |
| Formatting of all 12 changed/new files                        | PASS.                                                                                                                                                                                                 |
| Repository-wide formatting                                    | FAIL: the same four unrelated baseline files listed below; not changed.                                                                                                                               |
| Preservation check                                            | PASS: all 281 non-target baseline files compared byte-for-byte unchanged. All four existing target files matched the pre-task baseline before applying; all 12 applied files matched the tested copy. |
| Live browser / responsive visual review                       | NOT EXECUTED: no browser connection available.                                                                                                                                                        |
| Paid model / external integrations                            | NOT EXECUTED: prohibited.                                                                                                                                                                             |

### Coverage A–I

| Requested check       | Offline evidence                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — new campaign      | Three unrun cards, no premature missing/disconnected output, upload and Build retained; prior campaign error/history excluded.                                                                       |
| B — existing campaign | Rendering leaves session/versions/selections unchanged; compact save/read preserves outputs; pre-fix pack restores exact human fields/history.                                                       |
| C — naming            | Actual blur-commit and Build handlers apply valid names without changing source/campaign selection; invalid names reject atomically; attribution retained.                                           |
| D — regeneration      | Each heading invokes only its own injected generator once; All invokes three; unrelated outputs/selections remain unchanged.                                                                         |
| E — full JTBD         | Nine-paragraph synthetic proposal, including outer whitespace, survives composition, SSR, persistence, selected-version changes and all five prompts.                                                |
| F — missing original  | Real Movers/Pro sources retain empty original JTBD; selected proposal remains available separately.                                                                                                  |
| G — composition       | One selected framing, two data points and two Sparks; deselect one Spark without changing other inputs; restore an older framing version.                                                            |
| H — Sparks            | Real exact-excerpt validator rejects fabricated grounding and incomplete sets; component failure keeps existing output and targeted retry recovers; stale completion cannot change another campaign. |
| I — regression        | Existing offline AI/source/persistence/approval/packaging suite, typecheck, lint, guarded build and changed-file formatting.                                                                         |

Test commands (run from repository root; all environment overrides apply only to the child process):

```sh
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs --conditions=react-server' ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=/private/tmp/xc-phase1-applied-ai
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase1.config.ts --output=/private/tmp/xc-phase1-applied-components
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/tsc --noEmit --incremental false
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/eslint .
```

The optimized build used the same child-process guard in the isolated source copy: `./node_modules/.bin/next build --webpack`. It did not start an application server or create artifacts in the active demonstration's `.next` directory.

Initial harness failures were test setup issues: browser-only PDF `import.meta` cannot load through CommonJS, and Playwright's normal TSX transform produces browser-serializable nodes rather than React SSR elements. The test-only harness now compiles actual component sources to React JSX and isolates the PDF accept constant. Application extraction was not modified to address these setup issues. Initial new-test typing/lint issues were corrected in the new helpers/fixtures. An initial applied-source command failed before tests started because the absolute preload path contained spaces; the relative preload commands above resolved this, and all applied-source checks were rerun successfully. The guard self-test proves fetch/HTTP calls are rejected before a connection; existing configuration-validation tests can exercise live-mode branches in memory without permitting transport.

Repository-wide Prettier still reports four **pre-existing, unchanged** failures, also reproduced against the frozen baseline:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

No unrelated formatting was performed. Existing PDF extraction emits font-interpreter warnings; its field assertions pass.

## F. Remaining limitations

- The browser skill could not connect to any browser (`agent.browsers.list()` returned an empty list). No claims are made about inspecting the live localhost page or pixel-level desktop/mobile layout. SSR markup and handler checks are not browser end-to-end tests.
- Browser suites that navigate/start an application or make HTTP API calls were intentionally not run under this task's no-API restriction. Older browser selectors for removed sample/confirmation controls need review before a separately authorized browser pass; they were not weakened or rewritten for a pass here.
- The screenshot's Sparks error maps to `sparkSetIssue` / `invalidSparkExcerptIndexes` and provider exact-excerpt rejection. The selected scoped source is what enters preparation. No captured failing live model payload/log was supplied, so the reason that particular model returned a nonmatching excerpt is **unverified**. No live request was made to guess at it, and validators were not relaxed. A future authorized diagnostic should inspect a captured failed response against its exact recorded source snapshot before considering any provider/prompt change.
- External enterprise/research sources remain disconnected and honestly labeled. No connector readiness or live model quality is claimed.
- Existing demonstration server, browser storage, drafts, credentials and model configuration were not changed. No HTTP API requests, paid generation, process termination, restart, commit, push or deployment occurred. New application AI usage: $0.

## G. Phase 2 readiness

The Phase 1 data/control changes are implemented and covered by offline tests. Full selected framing is accessible to the existing downstream consumers; human strategy remains separate. This is an offline implementation handoff, **not a 100% live/browser certification**. A connected-browser visual review remains outstanding. Phase 2 has not begun; wait for the user's review before changing Round Table states, conversation/history UX or saved-findings behavior.
