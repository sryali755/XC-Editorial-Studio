# XC Strategy Studio — four-tab UI and Working Space verification

Repository: XC Editorial studio. Branch: `insight-discovery-poc`.
Scope: the attached reviewed UI brief; existing application, not a replacement.
Verification date: October 18, 2026. No commit, push, deployment or live AI work.

## Implementation and before/after

| Area                       | Before                                                                 | After                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary navigation         | Already four correctly named tabs                                      | Retained exactly: Input Pack, Insight Discovery, Finalize Strategy, XC Brief. No fifth tab or new route.                                                                                                                                                |
| Desktop Working Space      | Modal overlay over the investigation                                   | Nonmodal right-side panel using approximately half the usable width; research remains visible and interactive at left. Agent cards scroll horizontally rather than compressing five cards into that space.                                              |
| Small/short screens        | Narrow overlay                                                         | Full-screen, focus-trapped sheet with Close/Back, independent content scrolling and focus restoration.                                                                                                                                                  |
| Drawer actions             | Individual field saves                                                 | Retained field saves plus Save Draft for all 19 fields, Back to Discovery and Continue to Finalize Strategy. Footer stays within available viewport height.                                                                                             |
| Suggested V0               | Raw-brief starter seeded before selections; no starting-context record | First explicit workspace opening/review uses current selected framing, data and Sparks, with source labels, snapshot identity and recoverable V0 values.                                                                                                |
| Existing drafts            | Existing persistence/history                                           | Preserved, including cleared fields, previous versions, saved support and old drafts without provenance metadata. No inferred overwrite of legacy human writing.                                                                                        |
| Changed upstream selection | Research staleness warnings                                            | Research warnings retained; workspace additionally identifies changed framing/data/Sparks, provides starting/current context for review and does not automatically replace an opened draft.                                                             |
| Brief inclusion            | New source-derived V0 text could retain an excluded Spark              | Explicit Finalize Strategy inclusion changes update only untouched, unsaved suggestions. Human-edited or saved text is protected; a visible note explains the update, and original V0 remains restorable. No change to exporter/packaging architecture. |

The reference `XC-Strategy-Studio-Reference-Style-Wireframe.pdf` was rendered locally and all five pages inspected. It was used only for layout, never campaign facts; its obsolete “Finalized Strategy” wording was not copied.

## Suggested V0 lifecycle and human ownership

- A new source-scoped campaign gets an unapproved source-aware starter. Opening Working Space, or opening Finalize Strategy, initializes its untouched starter from the latest selected Input Pack.
- Only `selectedSparks`, `selectedResearch` and the selected adaptation are used; legacy aggregate Spark/research text is not used as an unselected-content fallback.
- Original supplied RTB stays separate from the proposed adaptation and retains its independently tracked approval status. Structured original JTBD takes precedence over a raw-text heading heuristic; genuine absence is labeled as such.
- Source facts, selected proposals, interpretations, missing evidence and human edits have separate labels. Hypotheses/insights are not promoted to validated customer facts. Enterprise sources remain disconnected.
- The optional `workspaceSuggestionContext` records Input Pack identity, campaign, selections, field provenance and V0 text. It does not introduce another strategy draft or change the 19 existing field names.
- Once opened, manually changed or saved, the existing draft is restored without upstream-driven regeneration. A new saved finding changes supporting material only. Existing campaign/source-scoped storage and archive behavior are retained.
- There is no new automatic refresh action. Starting/current selections can be reviewed without changing text. Original V0 and saved field versions can be explicitly restored as drafts.
- A separate, explicit Finalize Strategy inclusion choice can revise only unsaved, unedited source-derived proposals. Original V0 is retained. Text the human changed or saved is never silently rewritten; the inclusion help asks the human to review references in their own text.
- Save Draft versions all 19 fields atomically, including intentionally empty values, without approval or duplicate versions for unchanged values. Per-field saves and restoration remain available.
- Drawer and full-width Finalize Strategy use the same parent state, existing persistence store and field versions. Approval remains an explicit existing action and freezes the approved snapshot. No agent can approve.

### All 19 editable fields retained

`humanBriefLine`, `problemStatement`, `humanTension`, `workingAudience`, `workingJTBD`, `workingRTB`, `evidenceInsights`, `hypothesis`, `strategicDirection`, `openQuestions`, `executionConsiderations`, `notes`, and `wholeBrief.context`, `.objective`, `.audience`, `.thoughtStarters`, `.deliverables`, `.mandatories`, `.timelines`.

Primary strategy fields include hypothesis and open questions. Additional working fields, private notes and whole-brief source/deliverable context are expandable. Private notes default open for compatibility and can be collapsed; they remain excluded from the brief.

## Exact source/test/report changes

| File                                              | Change                                                                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/studio-wireframe.css`                        | Scoped side-by-side layout, readable horizontal agent cards, mobile/short-screen sheet, visible actions, provenance/context notices.                                                                                          |
| `components/DiscoveryRoundTableV2.tsx`            | Responsive drawer, campaign/status, bounded independently scrolling content, Save Draft/continue actions, opener focus restoration. Existing agent markup is reindented under the research container, not rewritten.          |
| `components/WorkingSpace.tsx`                     | Provenance, V0 restore, changed-selection comparison, bulk save, empty-value saving, primary fields, collapsible notes, saved-finding investigation context.                                                                  |
| `components/InsightDiscoveryStudio.tsx`           | Shared first-open initialization, existing navigation wiring, protected proposal review for explicit brief-inclusion changes.                                                                                                 |
| `components/InsightDiscoveryFeature.tsx`          | Optional workspace-open/continue callbacks through the existing research controller.                                                                                                                                          |
| `components/InsightDiscoveryWorkspace.tsx`        | Additive optional callback contracts; legacy orchestration unchanged.                                                                                                                                                         |
| `components/useDiscoveryDialog.ts`                | Modal/nonmodal keyboard behavior; preserve Escape closing and restore opener focus.                                                                                                                                           |
| `lib/types.ts`                                    | Optional starter provenance metadata only; no existing strategy field renamed/deleted.                                                                                                                                        |
| `lib/discovery-studio.ts`                         | Delegate selected starter enrichment and prefer supplied structured original JTBD. Existing source extraction, campaign archive and packaging retained.                                                                       |
| `lib/workspace-suggestions.ts` (new)              | Pure selected-context seeding, non-destructive initialization, context comparison, protected inclusion review and atomic draft versioning. No model call.                                                                     |
| `tests/ai/workspace-selected-v0.spec.ts` (new)    | Ten deterministic tests covering both real source scopes, selected-only inputs, all 19 fields, human/empty/version preservation, inclusion review, original JTBD and isolation.                                               |
| `tests/strategy-studio-four-tab-ui.spec.ts` (new) | Two actual-PDF campaign scenarios and a mobile keyboard/scroll/notes scenario; five screenshots per campaign.                                                                                                                 |
| `tests/strategy-studio-working-space.spec.ts`     | Retain the no-rewrite-on-finding-save assertion before opening; separately assert the new first-open V0 against the current selected pack. All existing human edit/version, evidence, restore and approval assertions remain. |
| `docs/four-tab-ui-verification.md` (new)          | This evidence report.                                                                                                                                                                                                         |

No existing legacy spec, agent prompt, provider, model, reasoning setting, credential, environment file, document fixture or exporter was changed.

## Required scenario results

| Scenario                           | Result and evidence                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Exactly four named tabs         | PASS — new actual-PDF cases assert count/order/exact accessible names.                                                                                          |
| 2. Selected Input Pack             | PASS — selected adaptation, one research point, two of six Sparks; original proof/unknown approval preserved.                                                   |
| 3. Discovery handoff               | PASS — same selected context, explicit question, all five distinct agents.                                                                                      |
| 4. Working Space opening           | PASS — 45–55% desktop width, research stays visible/interactive, independent scroll, footer fit, Close/Escape/focus restoration.                                |
| 5. Selected Suggested V0           | PASS — both campaigns; selected framing, data, Sparks only; honest source/proposal labels; no approval.                                                         |
| 6. Human edits/save/reopen         | PASS — exact problem, insight, direction and brief line; atomic save and persisted versions; existing full 19-field regressions retained.                       |
| 7. Upstream selection change       | PASS — changed Spark is flagged; existing writing and versions unchanged; no automatic refresh.                                                                 |
| 8. Saved findings                  | PASS — optional attributed support, investigation focus and exact evidence retained, no automatic field rewrite; original Discovery records remain recoverable. |
| 9. Full-page review/approval       | PASS — same draft/versions, exact explicit approved snapshot, existing brief generation/export controls.                                                        |
| 10. Movers / Xfinity Pro isolation | PASS — separate source context, starters, human drafts, versions, findings and approvals; return restores original values.                                      |
| 11. Regressions                    | PASS — 186 unit/AI, 69 Discovery and 41 legacy browser cases; 13 affected browser cases additionally rerun after the final hint-row layout correction.          |

## Actual verification commands and results

Isolated copies (no `.env*`, `.git`, `.next` or installed-dependency copy):

- Discovery/unit: `/private/tmp/xc-four-ui.r0Gcvc`, port 3251.
- Legacy/build: `/private/tmp/xc-four-ui-legacy.6oNCAn`, port 3252.
- Installed repository dependencies/Chrome reused, no installation or new service.

All test/build processes explicitly used:

```sh
export AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

Commands relative to the applicable isolated copy:

```sh
# Fail-closed safety checks before browser work
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/offline-guard.spec.ts --output=test-results-guard

# Final full unit/AI suite: deterministic mocks and registered in-memory SDK stubs only
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-ai-verified

# Full Discovery, including screenshot walkthrough and all three authorized local document imports
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_CAPTURE_SCREENSHOTS=1 XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3251 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-discovery-verified --global-timeout=600000

# Full legacy, separate copy
NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3252 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-legacy-verified --global-timeout=600000

# Final affected UI/R4/R5 rerun after screenshot review found a hint paragraph occupying a field-grid cell
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3251 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-working-space.spec.ts tests/strategy-studio-final-brief.spec.ts --output=test-results-visual-final --global-timeout=300000

npm run typecheck
npm run lint
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
./node_modules/.bin/prettier --check app/studio-wireframe.css components/WorkingSpace.tsx components/DiscoveryRoundTableV2.tsx components/InsightDiscoveryFeature.tsx components/InsightDiscoveryStudio.tsx components/InsightDiscoveryWorkspace.tsx components/useDiscoveryDialog.ts lib/types.ts lib/discovery-studio.ts lib/workspace-suggestions.ts tests/ai/workspace-selected-v0.spec.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-working-space.spec.ts
./node_modules/.bin/prettier --check app components lib tests *.ts *.mjs *.json
git diff --check
```

| Check                                       | Actual final result                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safety preflight                            | 3 passed, 0 failed/skipped.                                                                                                                                                                                   |
| Full unit/AI                                | 186 passed, 0 failed/skipped, 17.9 seconds. Includes 10 new starter-lifecycle tests.                                                                                                                          |
| Full Discovery browser                      | 69 passed, 0 failed, 1 opposite-mode skip; 70 discovered, 5.5 minutes.                                                                                                                                        |
| Full legacy browser                         | 41 passed, 0 failed, 1 opposite-mode skip; 42 discovered, 2.5 minutes.                                                                                                                                        |
| Final affected browser rerun                | 13 passed, 0 failed/skipped, 1.9 minutes; overlaps the full Discovery suite.                                                                                                                                  |
| TypeScript / ESLint                         | Passed on the final source.                                                                                                                                                                                   |
| Supported production build                  | Passed, webpack with Discovery enabled.                                                                                                                                                                       |
| Focused Prettier                            | Passed for source/tests and this report.                                                                                                                                                                      |
| Repository-wide Prettier                    | Four unchanged baseline failures below.                                                                                                                                                                       |
| Final patch whitespace / preservation check | Passed: git diff --check and focused Prettier; task-start hashes confirm only the 10 listed existing files changed, with 4 new source/test/report files and 10 new screenshots. No existing file was removed. |

Two feature-flag specs are discovered in both browser modes; each skips only in the opposite mode and executes in its intended mode. No skip is a substitute for executing a required case. Optional screenshots and authorized local PDF/DOCX/PPTX imports were enabled.

Unique passing cases: **186 unit/AI + 110 browser = 296**. Preflight and targeted reruns overlap these totals; they are not counted twice. The final change after the full suites was a scoped CSS rule making the Finalize Strategy hint span the full field-grid row, plus its layout assertions. The affected 13 browser cases, final typecheck/lint/build and focused formatting were rerun successfully afterward.

### Failure investigation, not hidden retries

- Initial new browser run: two harness errors expecting undecorated visible tab text instead of exact accessible names; one reproduced mobile opener-focus loss after making the research side inert. Test checks were corrected and the focus defect fixed.
- One targeted run was intentionally interrupted after identifying a new test locator querying the now-hidden Input Pack. The title is now captured while that page is visible; no application workaround.
- An abnormally stalled broader run had long timeouts, transient preparation/reload failures, help-copy mismatches and a new test missing the existing Build step when restoring a campaign. No timeout-driven application fallback was added. Those timeouts were not reproduced in bounded subsequent runs.
- R4's old first-open assertion used the pre-selection raw-source starter. It now explicitly proves saving findings preserves that text, then proves first opening uses current selected context. This is an acceptance change required by the new feature, not deletion of the preservation assertion.
- First full Discovery: 67 passed / 2 failed / 1 opposite-mode skip. The two reproducible defects were Escape after comparison disabled its focused button, and an excluded Spark leaking through untouched source-derived starter text. The implementation was corrected; neither validator nor assertion was weakened.

Untouched formatting failures:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

## Screenshots and visual review

Actual mock-mode browser captures from the real campaign PDF, not standalone wireframes:

| View                      | Movers                                                                                                                                                                                | Xfinity Pro                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input Pack                | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/movers/01-input-pack.png>)              | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/xfinity-pro/01-input-pack.png>)              |
| Insight Discovery         | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/movers/02-insight-discovery.png>)       | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/xfinity-pro/02-insight-discovery.png>)       |
| Discovery + Working Space | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/movers/03-discovery-working-space.png>) | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/xfinity-pro/03-discovery-working-space.png>) |
| Finalize Strategy         | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/movers/04-finalize-strategy.png>)       | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/xfinity-pro/04-finalize-strategy.png>)       |
| XC Brief                  | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/movers/05-xc-brief.png>)                | [View](</Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/docs/strategy-studio-four-tab-ui/xfinity-pro/05-xc-brief.png>)                |

All five view types for both campaigns were visually reviewed, including the final corrected Finalize Strategy grid and viewport-bounded drawer footer. No overlapping text or accidental empty grid cell remains in those captures. Long Input Pack cards and source-rich brief content retain their existing scroll/expand behavior; no campaign content was shortened or invented to make screenshots fit. The deliberately distinctive “Kevin 0/1” human lines are regression-test inputs, not strategy recommendations. Captures are from `test-results-visual-final`.

The optional in-app browser connection returned no available browsers; the user-requested existing repository Playwright/installed Chrome infrastructure produced the captures. No new browser service was introduced.

## Known issues and limits

- UI-01: Correct campaign titles are verified for both real fixture scopes. No label was inferred from moving-related words. The existing live browser's earlier “Campaign: Not supplied” state was not inspected or declared fixed.
- UI-02: Earlier-context findings remain visibly stale. Tests change selected Sparks and verify the warning and preservation of draft/history.
- UI-03: Both actual client campaign fixtures retain GTM RTB approval `unknown`. No product approval is inferred from approving strategy. Any earlier live-state `approved` value still requires its own source or human-record verification; no blanket correction was made.
- R5-12 DOCX visual rendering remains BLOCKED, unchanged from `requirement5-verification.md`. PDF/Word content/export regressions passing does not turn this into 15/15 R5 acceptance.
- Live-model quality remains LIVE VERIFICATION PENDING, explicitly unauthorized. No enterprise source is newly connected.

## Safety and preservation

All work stayed on `insight-discovery-poc`. Source/test changes were developed and verified in isolated copies first, then applied with a targeted patch after checking the original branch and all task-start file hashes. The final comparison found exactly the 10 listed existing files changed, 4 new source/test/report files and 10 new captures, with no removal. All other 236 pre-existing indexed/untracked source files retained their task-start hashes. The existing R5 report is unchanged.

`AI_MODE=mock`, empty `OPENAI_API_KEY`, `XC_OFFLINE_TEST=1` and telemetry disabled throughout all application test/build processes. Fail-closed provider tests pass before browser work; browser non-loopback DNS is blocked and new UI tests abort external HTTP(S), including static font attempts. API mock mode is checked by the tests.

No live/paid AI, enterprise research, external conversion, dependency installation, credential/environment edit, localhost:3000 access/restart, reset, stash, clean, unrelated revert, commit, push or deployment. Application AI API cost: **$0**. Both isolated test instances exited; final loopback checks returned ECONNREFUSED on ports 3251 and 3252.

Stop after these four-tab refinements and offline verification. No new requirement, integration or export architecture was started.
