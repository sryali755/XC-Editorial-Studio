# Strategy Canvas prefill and human-owned Brief Line verification

Repository: XC Editorial studio. Branch: `insight-discovery-poc`. Existing HEAD: `9c8134a`.

Scope: new-draft Insight/JTBD initialization, preservation of existing drafts, field provenance and the requested Brief Line guidance. No layout redesign, new AI request, schema migration, prompt/model change or approval change.

## Actual root causes

1. **Insight:** `seedStudioDiscovery` only mapped an explicitly labeled audience/consumer tension or the first research paragraph. The selected-research initializer could fill it from selected research. Real Movers and Xfinity Pro do not have that explicit tension/research input, and without selected research there was no useful fallback. The generic textarea hint was visible because the stored value was genuinely empty—not because content was hidden behind the UI.
2. **JTBD:** the initializer only used `originalJTBD` / a heading heuristic or supplied proposed-job records. Neither real campaign supplies a formally labeled original JTBD. There was no campaign-specific proposed-V0 fallback. The prep agent's selected `xcAdaptation` is an **RTB** adaptation, not a JTBD, and must not be relabeled as one.
3. **Human line:** the previous UI task already made current new drafts empty. Older drafts may retain source/Spark-filled values from the earlier implementation. Those existing values must be preserved, not cleared by migration.
4. **Restoration risk:** `prefillWorkspaceSuggestions` used blank-string checks to fill older records without the initialized marker. This could overwrite an intentional clear. An unopened saved provenance snapshot could also be treated as a fresh first-open selection review. These were real lifecycle gaps, not field-name mismatches.

## Targeted correction

`workspace-canvas-prefill.ts` creates deterministic, offline Suggested V0 content using the existing pack and provenance contracts:

- Insight prefers an eligible saved finding present at initial canvas creation, then explicitly selected supplied audience evidence. An explicit IMC insight takes priority over an AI-synthesized research point. Otherwise, adequate objective/audience context supports a clearly labeled working interpretation. Actual audience/message wording and only explicitly selected Spark hypotheses shape the proposal. Missing-source/retrieval-gap points and title metadata are not promoted into consumer evidence.
- A saved finding is eligible only at the current pack version and with source-supported evidence resolvable by the existing exact source/locator/excerpt validator. Stale, foreign-source and research-gap findings do not become supported insights. Later saved findings do not silently change opened/saved fields.
- JTBD uses an explicitly selected proposed-JTBD data point when present, otherwise the exact supplied original, otherwise an audience/message/objective-grounded proposal. Original and proposed source records remain untouched. Unselected internal-testing addenda and selected RTB framing are not treated as original JTBD.
- The application has no separate JTBD-adaptation selector in its current prep contract. This task does not invent one or repurpose the RTB checkbox. Existing explicitly selected data can carry a proposed-JTBD category; where no such selected job exists, the fallback is honestly marked as a proposal.
- Source-poor drafts remain empty with visible **Needs validation** provenance. UI hints are not saved as field values.

Existing `WorkspaceStarterField.kind` and `.label` distinguish supplied content, selected proposals, interpretations and missing evidence. Generated Insight labels include **Suggested interpretation · Validate with research**. Generated jobs include **AI-assisted proposed JTBD · not original or approved**. An original job explicitly retains **approval not established**.

New drafts retain a blank `humanBriefLine`; the optional separate Strategic Starting Point and explicit adoption action remain intact. The human editor now has exactly the requested helper and placeholder:

> Write your single-minded strategic direction. Use the canvas and selected insights to shape your line.

> Write your brief line here...

Existing authored, adopted and legacy AI-filled lines retain their exact values and existing provenance. Restoring a saved draft seals the initial-only review window; it does not populate missing fields. Human edits, intentional clears and all historical versions remain intact. Approved snapshots are not even relabeled during restoration. Saving, restoring a version and continuing to Tab 3 do not approve anything.

**Important:** an existing draft with blank fields is intentionally not backfilled on refresh. These new suggestions apply to new drafts / the existing first unopened new-draft review, not to a destructive migration of saved work.

## Files changed relative to this task's starting worktree

| File                                                 | Change                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/workspace-canvas-prefill.ts` (new)              | Pure deterministic source-aware Insight/JTBD proposals and provenance; exact-citation gate for initial saved findings.                       |
| `lib/discovery-studio.ts`                            | Calls new-draft helper; respects explicit original-JTBD absence; removes blank-based legacy hydration filling; preserves approved snapshots. |
| `lib/workspace-suggestions.ts`                       | Retains typed field provenance, seals restored initialization and preserves nonempty legacy lines during first-open review.                  |
| `components/InsightDiscoveryStudio.tsx`              | Seals restored campaign drafts; supplies current saved findings only to the initial canvas preparation path.                                 |
| `components/WorkingSpace.tsx`                        | Requested human-line helper/placeholder and visible missing Insight/JTBD provenance; same fields, layout and buttons.                        |
| `tests/ai/workspace-canvas-prefill.spec.ts` (new)    | Fourteen focused offline source/provenance/selection/legacy/clear/history cases.                                                             |
| `tests/strategy-studio-canvas-prefill.spec.ts` (new) | Six browser cases using real Movers/Pro source text, original-JTBD sample, sparse source and legacy hydration.                               |
| `tests/ai/discovery-studio.spec.ts`                  | Replaces outdated legacy auto-backfill expectation with preservation of intentional empty Insight.                                           |
| `tests/ai/workspace-selected-v0.spec.ts`             | Replaces two outdated empty-JTBD expectations with explicit proposed-V0/provenance assertions.                                               |
| `docs/strategy-canvas-prefill-verification.md` (new) | This report; screenshots linked below.                                                                                                       |

One additional legacy spec changed: `tests/strategy-studio-four-tab-ui.spec.ts`. Its two source-copy-only Insight expectations were updated for the requested fallback interpretation: they now assert campaign-specific audience grounding, selected Spark hypothesis and explicit validation provenance. Supplied/selected text still has its verbatim assertions. All later preservation, source isolation, history, approval and export assertions remain intact.

No CSS, primary navigation, button, provider, API schema, model/reasoning setting, prompt, dependency, credential, extraction fixture or approval/export code was changed. The same 13 active editors and six already-retired historical fields remain preserved by existing contracts; no field/history was removed.

## Safety and exact commands

Before editing, the actual XC repository and `insight-discovery-poc` were verified; its existing dirty/untracked status was recorded. The shell's initial cwd was a separate Editorial Agent repository, so no task changes were made there.

Implementation/testing used isolated copies:

- Baseline: `/private/tmp/xc-canvas-baseline.r64sY8`
- Main test copy: `/private/tmp/xc-canvas-offline.76sOGp`, loopback port **3321**
- Build/legacy copy: `/private/tmp/xc-canvas-build.7BgCyQ`, loopback port **3322**

Copies excluded `.git`, `.env*`, installed dependencies, Next output and previous test output. Installed dependencies and Chrome were reused. The existing supported Playwright config forces mock mode and an empty key, forbids server reuse and blocks external DNS. New browser tests also abort non-loopback requests, fail an attempted external AI host and verify the mock status endpoint. Existing fail-closed provider guards are unchanged.

All commands were prefixed with:

```sh
AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

```sh
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-canvas-ai-verified
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3321 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-canvas-prefill.spec.ts --output=test-results-canvas-browser-final
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_CAPTURE_SCREENSHOTS=1 XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3321 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-canvas-discovery-full
NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3322 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-canvas-legacy
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3322 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-canvas-prefill.spec.ts --output=test-results-canvas-affected-final
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
./node_modules/.bin/prettier --check lib/workspace-canvas-prefill.ts lib/discovery-studio.ts lib/workspace-suggestions.ts components/InsightDiscoveryStudio.tsx components/WorkingSpace.tsx tests/ai/workspace-canvas-prefill.spec.ts tests/strategy-studio-canvas-prefill.spec.ts tests/ai/discovery-studio.spec.ts tests/ai/workspace-selected-v0.spec.ts docs/strategy-canvas-prefill-verification.md
git diff --check
```

## Actual results

| Check                                     | Result                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full AI/unit suite, R1–R5 included        | **279 passed**, no failures/skips.                                                                                                                                                        |
| Focused source/initialization/R4 unit run | **37 passed**.                                                                                                                                                                            |
| New focused browser suite                 | **6 passed**, no skips.                                                                                                                                                                   |
| Full Discovery browser regressions        | **96 passed / 2 outdated assertions failed / 1 expected mode skip** on the full run. Both corrected cases passed in the affected rerun; 98 distinct Discovery cases verified across runs. |
| Full legacy browser regressions           | **41 passed**, one expected opposite-feature-mode skip, no failures.                                                                                                                      |
| Production webpack build                  | Passed after correcting optional legacy-state handling.                                                                                                                                   |
| Typecheck                                 | Passed (`tsc --noEmit --incremental false`).                                                                                                                                              |
| ESLint                                    | Passed on final source and focused browser tests.                                                                                                                                         |
| Focused Prettier / final whitespace check | All ten changed TS/TSX files passed focused formatting. Final applied-repository whitespace check recorded below.                                                                         |

The affected final browser run passed **9/9**: six new canvas cases plus all three four-tab cases. The complete executed coverage is **279 passing unit cases and 139 distinct passing browser cases across the full suites and affected rerun**, with two expected opposite-feature-mode skips. Focused/overlapping repeats are not added to those totals. This is not a claim that the initial full Discovery run passed without failures.

Development failures were not counted as passes:

- First 265-case unit run: 260 passed / 5 failed. One obsolete hydration-backfill expectation and two obsolete empty-JTBD expectations were corrected to the new requirements. Two approval-snapshot equality failures revealed that sealing restored metadata must not touch an already approved draft; that production defect was fixed, preserving the exact frozen state. Full corrected unit run passed.
- First browser launch was blocked by sandbox `listen EPERM` on isolated port 3321. The supported loopback test command was rerun with scoped execution permission; no live server or environment was reused.
- First six-case browser run: 5 passed / 1 failed due to a wrongly nested new test locator for field history. The locator was corrected without dropping the restore/value/history assertions; rerun passed 6/6.
- First build found optional `humanBriefLine` access on a legacy state. The optional-safe guard was corrected; standalone TypeScript and the repeated production build are reported above.
- Full Discovery run: 96 passed / 2 failed / 1 skipped. The two four-tab cases still required every nonempty Insight to be copied verbatim from source/research, which excluded the newly required explicitly unverified fallback. Those obsolete assertions were updated with grounding/provenance checks; both complete journeys then passed in the 9-case affected rerun. Source validators were not changed or disabled.

Repository-wide Prettier still reports exactly four pre-existing unrelated files; none was reformatted:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

## Final applied-repository checks

Applied only after branch/HEAD and byte-for-byte baseline checks confirmed no concurrent target edits. All **11 changed text files** exactly matched the tested copy after application. All **four screenshots** matched their reviewed source artifacts. Comparing every other baseline file found **379 unchanged existing files and zero non-target differences**.

The applied repository remained on `insight-discovery-poc`, HEAD `9c8134a`; no commit was created. `git diff --check` passed, and focused Prettier passed across all 11 changed text files. A final mock-only run from the actual applied repository passed **14/14** new unit cases, with its output isolated in `/private/tmp/xc-canvas-offline.76sOGp/test-results-canvas-applied`. The five production files match the successful isolated production-build copy. Existing modified and untracked work was preserved; no reset, stash, clean, revert or wholesale overwrite was used.

## Acceptance A–H

| Test                   | Verified behavior                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — New Movers         | Real supplied source text builds nonempty Problem/Audience/Insight/JTBD; empty human line; interpretation/proposal labels and unknown RTB approval retained. |
| B — Existing draft     | Exact edited Insight/JTBD/Brief Line survive saving, close/reopen, navigation and refresh.                                                                   |
| C — Intentional clear  | Empty Insight/JTBD survive save/reload/reopen; original versions remain restorable.                                                                          |
| D — Different campaign | Real Xfinity Pro has its own activities/benefit and no mover job leakage; returning to Movers restores Kevin's edits.                                        |
| E — Original job       | Supplied original remains exact in source/pack; selected proposed job is separately labeled, not approved; RTB adaptation is never repurposed as JTBD.       |
| F — Missing source     | No invented audience need or job; empty values with Needs validation provenance.                                                                             |
| G — Versions/approval  | Save/restoration/continue preserve the same values and recoverable empty versions; no automatic approval.                                                    |
| H — Regression         | Actual totals above; no live-model quality claim.                                                                                                            |

## Screenshots and limitations

Visually reviewed renderings from the full offline browser run:

- [Movers Strategy Canvas](strategy-canvas-prefill/movers-canvas.png)
- [Movers empty human Brief Line](strategy-canvas-prefill/movers-empty-brief-line.png)
- [Xfinity Pro Strategy Canvas](strategy-canvas-prefill/xfinity-pro-canvas.png)
- [Xfinity Pro empty human Brief Line](strategy-canvas-prefill/xfinity-pro-empty-brief-line.png)

They show actual rendered mock-only draft state using the real campaign source text, not hardcoded campaign examples. The existing textarea scrolling and drawer layout are unchanged.

Actual generated Movers job in the controlled test:

> When I am moving, I want to transfer my services in a snap with the Xfinity app, so I can stay connected to what I love.

Actual generated Xfinity Pro job:

> When my activities include work-from-home, streaming, and gaming, I want to boost my streaming, gaming, and working with our best features and equipment with Xfinity Pro, so I can decide how this benefit supports my needs in that situation.

Both are explicitly labeled AI-assisted proposals, not original/approved jobs. Both real campaigns retain `originalJTBD: ""`; the new human Brief Line is also exactly `""`. The original-source sample separately verifies an exact supplied JTBD. These are actual executed test outputs, not live-model results.

These suggestions are deterministic editable starting hypotheses, not independently verified consumer research or new live AI generation. Existing saved drafts intentionally retain their previous contents. Disconnected research integrations remain disconnected. No unrelated live Sparks quotation-repair or final-brief packaging work is included.

No localhost:3000 access, use, stop or restart. No user's existing process was touched. No paid/live AI or enterprise calls, environment/credential changes, commits, pushes or deployment. New application AI usage during this work: **$0**. Stop after these focused corrections.
