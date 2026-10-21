# Working Space initialization, rendering and restoration investigation

Repository: XC Editorial studio. Branch: `insight-discovery-poc`. HEAD before work: `9c8134a`.

## Findings before production changes

The initial attachment showed **Xfinity Pro's Input Pack**, including a failed Sparks preparation run. Follow-up Working Space crops show the exact historical Spark-origin caption and the expanded context-change warning. Those crops corroborate the reproduced presentation, but do not expose the tab's saved state or served bundle. No connection to the user's localhost:3000 process, browser storage, cache, bundle or runtime configuration was made. The exact state of that live tab therefore remains **unverified**; the following conclusions distinguish direct reproduction from plausible explanations.

| Candidate cause                                                       | Evidence and outcome                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New-draft initialization copying the top Spark                        | **Not reproduced in current source.** A fresh isolated browser context, real Movers source and two selected Sparks produce an empty human Brief Line. The same is true for Xfinity Pro. These tests passed before application changes.                                                                                                                         |
| Wrong Working Space component in the four-tab UI                      | **Not present in the inspected route.** `/` → `InsightDiscoveryStudio` → page-mode `InsightDiscoveryFeature` → `DiscoveryRoundTableV2` → `components/WorkingSpace.tsx`. Finalize Strategy imports that same WorkingSpace component. `/creative` retains a separate legacy path, not the normal four-tab route.                                                 |
| Legacy stored Spark-derived Brief Line                                | **Reproduced exactly.** Restoring a source-scoped earlier draft with the old field origin produces `From the top selected Spark · suggestion · edit freely` and its nonempty existing value. That is restoration, not fresh initialization. Re-uploading the identical source can restore its existing source-scoped draft; it is not necessarily a new draft. |
| Missing Starting Point / Canvas                                       | **Not reproduced as absent rendering.** Both sections render before the Brief Line. Remembered drawer scrolling can put both headings above the viewport and leave the Brief Line visible. The replay reproduced that exact visibility pattern, then scrolled to the top and captured both sections. No section was removed or hidden conditionally.           |
| Stale browser bundle, different running checkout, or other live state | **Unverified.** Offline tests use the current repository in fresh contexts. They cannot establish which bundle/session the prohibited live tab has loaded. No cache or user storage was cleared as a workaround.                                                                                                                                               |
| Four saved vs zero fields with saved versions                         | **Expected independent counters, reproduced.** Four saved finding references do not create explicit field versions. Human writing still restores through automatic draft persistence with zero field-version records.                                                                                                                                          |
| Supporting-context review can clear an older line                     | **Confirmed application defect.** A pre-change regression test restored an unversioned legacy source-derived line, changed supporting-context selection, and received `""` instead of the existing exact text. The correction is described below.                                                                                                              |

Baseline results: fresh/restored rendering and count replay **4/4 passed** before production changes. The first count-test setup mistakenly assumed Brand had two findings; this source produced one. The setup was corrected to save one actual finding from each of four lenses. It did not change application logic, mock outputs or evidence validators.

The initial targeted unit reproduction ran **5 passed / 1 failed**. The failure demonstrated the actual line-clearing defect; it was not ignored or converted to an expected failure.

## Narrow corrections

1. `reviewWorkspaceSupport` no longer includes `humanBriefLine` among automatically revised source-derived fields. Inclusion checkboxes can update their existing proposal fields, but never replace or clear the authoritative human line, including an autosaved older Spark-origin value without explicit history. Explicit writing, adoption and version restoration remain the user's actions.
2. The top badge and Open Working Space action now explicitly say **saved findings**, with correct singular/plural wording. The drawer explains that **Save Draft creates field versions; saved findings are counted separately**. The underlying counters and data contracts are unchanged.
3. An existing nonempty line whose retained seed explicitly identifies Spark/IMC-message origin receives a small **restored from an earlier draft** explanation. Its visible caption now says **Restored earlier draft · edit freely**, not the old Spark-prefill instruction. This is presentation only: its exact text, stored origin, history and approval state remain unchanged. A modern new draft or a human-edited line does not receive this notice. The copy does not falsely declare a previously approved strategy unapproved.
4. Following the user's additional screenshot, the large auto-expanded context-change panel was removed from above the strategy. Its complete change comparison remains available on demand inside **Strategic Starting Point → Starting context & provenance → Review selection changes**. Both disclosure levels start collapsed. Selection fingerprints, frozen V0, current selections and source/approval protections are unchanged; this does not silently refresh or replace draft text.

No new-draft seeding rewrite or CSS reordering was necessary: those paths already satisfy the requested behavior. The Strategic Starting Point is still separate; Strategy Canvas follows it; the single human Brief Line follows the Canvas. No duplicate editor or new authoritative strategy state was added.

The existing Insight/JTBD source-aware V0 logic is retained and tested: supplied original jobs remain exact, selected proposed jobs remain distinct and unapproved, and real campaigns without a labeled original get clearly identified proposed V0. New human lines remain blank even when two Sparks are selected. Existing intentional clears, authored/adopted text and legacy values are never blanked by migration.

## What the counters actually mean

- `savedFindingIds.length`: bookmarks Kevin chose to retain from agent research. This is the source of “4 saved findings.” It is not a draft-version count.
- Nonempty entries in `state.fieldVersions`: how many fields have explicit saved history. “0 fields with saved versions” means no such histories exist yet, not that there are no saved findings or no persisted writing.
- Editing calls the existing `saveDiscovery` / `persist` / `WorkspaceStore.save` path. It stores the campaign-scoped draft independently of explicit field history, using sessionStorage and the existing IndexedDB fallback. Existing storage-error/pending indicators are unchanged; the counter is not a storage-health indicator.
- Explicit Save Draft invokes `saveWorkspaceDraft`, adding field-history records. The test shows an exact human-authored line surviving reload without Save Draft, then records its first explicit version while all four findings remain saved. Neither action approves a strategy.

## Exact files changed

| File                                                       | Targeted change                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `lib/workspace-suggestions.ts`                             | Remove the human line from automatic supporting-context proposal review; all other review protections retained.                    |
| `lib/workspace-presentation.ts`                            | Pure predicate for a restored line with actual historical source provenance.                                                       |
| `components/WorkingSpace.tsx`                              | Restored-origin explanation/caption; move verbose selection comparison into collapsed provenance. No editor or audit-data removal. |
| `components/DiscoveryRoundTableV2.tsx`                     | Clarify saved-finding label and field-version explanation.                                                                         |
| `components/InsightDiscoveryStudio.tsx`                    | Clarify top saved-finding counter.                                                                                                 |
| `tests/ai/workspace-restoration-regression.spec.ts` (new)  | Seven source/initialization/restoration/review/history/origin regression cases.                                                    |
| `tests/strategy-studio-workspace-regression.spec.ts` (new) | Four genuine fresh/restored campaign, count/persistence and rendering cases; actual screenshots.                                   |
| `docs/working-space-regression-verification.md` (new)      | This investigation and evidence.                                                                                                   |

New screenshots are stored in `docs/working-space-regression/`. No existing specs were edited. All existing local modifications and untracked files were preserved. No UI redesign, tab/button addition, model/reasoning/prompt/provider change, schema change, storage migration, dependency installation or source-validator weakening.

## Offline verification setup and commands

The shell initially opened the unrelated Editorial Agent repository. All application task work instead targets the verified XC repository above. Baseline snapshot: `/private/tmp/xc-workspace-regression-base.Pk7s0S`. Main test copy: `/private/tmp/xc-workspace-regression.q8e3yI`. Production test copy: `/private/tmp/xc-workspace-production.Iikm3F`.

Copies exclude `.git`, `.env*`, node_modules, Next output and previous test output; only installed dependencies and Chrome are reused. The existing Playwright offline config forces mock mode, empty API key, no server reuse and external DNS blocking. New tests additionally abort non-loopback browser requests and fail an attempted external AI host. Server-side fail-closed guards remain unchanged.

Every command uses this prefix:

```sh
AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

```sh
# Baseline reproduction, before production edits
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/workspace-restoration-regression.spec.ts --output=test-results-restoration-before
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3331 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-workspace-regression.spec.ts --output=test-results-rendering-baseline

# Verification after the narrow correction
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-workspace-regression-ai
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3331 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-workspace-regression.spec.ts tests/strategy-studio-canvas-prefill.spec.ts tests/strategy-studio-premium-workspace.spec.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-working-space.spec.ts --output=test-results-workspace-regression-final
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3332 ./node_modules/.bin/playwright test -c playwright.workspace-production.config.ts --output=test-results-workspace-production
./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
git diff --check
```

The production-only Playwright wrapper exists only in the temporary production copy. It spreads the repository's supported offline config, retains its Chrome/network/provider safeguards and changes the server command to the existing `npm run start` on port 3332. No new browser service or dependency was introduced; the wrapper is not added to application files.

## Actual results

| Check                                          | Result                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pre-change targeted unit reproduction          | 5 passed / 1 confirmed defect failed.                                              |
| Pre-change current-rendering/count replay      | 4 passed; current new-draft path was already correct.                              |
| Full post-correction AI/unit suite             | **286 passed**, no failures/skips.                                                 |
| Final relevant development browser suite       | **22 passed**, no failures/skips (2.5 min).                                        |
| Production rendering/restoration browser suite | **4 passed**, no failures/skips (18.4 sec).                                        |
| Production build                               | Passed.                                                                            |
| Standalone TypeScript                          | Passed, with incremental output disabled.                                          |
| ESLint                                         | Passed.                                                                            |
| Focused formatting                             | All eight changed text files passed Prettier.                                      |
| Applied-source equality / whitespace checks    | Tested source matches applied files; git diff --check and focused Prettier passed. |
| Targeted tests against applied repository      | **7 passed**, no failures/skips.                                                   |
| Preservation check                             | 389 non-target baseline files unchanged; all 16 screenshot copies match.           |

An intermediate development run passed 21/22 and failed only because the running test worker had loaded the earlier restored-notice wording while the revised UI copy was applied. The original note was revised to avoid suggesting that restoration changes an existing approval state. An attempted final run inside the sandbox could not bind isolated port 3331 (`listen EPERM`), so no browser cases executed in that attempt; the same offline command was rerun with scoped local-listening permission. Final frozen-patch runs are recorded separately. No evidence, preservation or approval assertion was weakened.

The focused suites exercise all 19 retained historical field records, 13 current editors, private notes, saved findings, comparison, intentional clears, source isolation, stale-response safety, explicit approval and export journeys. These are targeted regressions plus the full unit suite, not a claim that every repository browser spec was rerun this turn. No live-model reliability claim is made.

The final browser tests additionally verify that selection-change details are initially hidden inside provenance, can still be opened and inspected, and never replace the existing line. The underlying old Spark-origin label remains byte-for-byte in stored provenance even though its visible field caption has been clarified.

The eight text files and sixteen PNG artifacts were applied to the actual XC repository only after isolated verification. The application step rejected any source target that differed from the frozen baseline and refused to overwrite new-file or screenshot targets. All five existing application-file changes were applied as patches on top of the user's work, not replaced from Git. Branch and HEAD remained unchanged. The seven new unit cases were then rerun directly against the applied repository with the same strict offline environment and `--output=/private/tmp/xc-workspace-regression.q8e3yI/test-results-applied-source`; no application server was started there.

## Screenshot evidence

These screenshots show actual production-browser rendering of deterministic mocks using the approved real campaign source text. The replayed legacy record is a controlled test fixture, not a copy of the user's private tab storage.

- New Movers: [Starting Point](working-space-regression/new-movers-starting-point.png), [prefilled Canvas](working-space-regression/new-movers-canvas.png), [empty human Brief Line](working-space-regression/new-movers-empty-brief-line.png).
- New Xfinity Pro: [Starting Point](working-space-regression/new-pro-starting-point.png), [prefilled Canvas](working-space-regression/new-pro-canvas.png), [empty human Brief Line](working-space-regression/new-pro-empty-brief-line.png).
- Existing human writing: [exact autosaved line restored without explicit field history](working-space-regression/existing-human-line-restored.png).
- Independent counters: [four findings and zero explicit field histories](working-space-regression/four-findings-zero-field-versions.png), [before label clarification](working-space-regression/before-count-labels.png).
- Historical source-derived draft: [Starting Point](working-space-regression/legacy-starting-point.png), [Canvas](working-space-regression/legacy-canvas.png), [line preserved and origin explained](working-space-regression/legacy-line-preserved.png), [remembered scroll](working-space-regression/legacy-remembered-scroll.png), [top sections still present](working-space-regression/legacy-top-sections.png), [before caption clarification](working-space-regression/before-legacy-caption.png).
- Changed Input Pack: [no expanded warning above the strategy](working-space-regression/context-changes-not-prominent.png). The browser test also opens provenance and verifies the full selection comparison remains available.

## Live-tab limitation and safety

The report demonstrates current source behavior and reproduces legacy-caption/remembered-scroll symptoms. The follow-up crops match those symptoms. It does **not** establish that the user's actual tab is that exact legacy record, has an old bundle, or is served from another checkout. An explicitly provided diagnostic state would be needed to settle that attribution without breaking the no-localhost:3000 constraint. Changes were tested in isolation before application to the repository; the running user tab was not updated or restarted during testing.

Do not clear user storage or erase an older Brief Line to make the new-draft test pass. Existing lines are intentionally retained. No user's app process was accessed, stopped or restarted. No localhost:3000 interaction, paid/live AI calls, external enterprise calls, credentials/environment changes, commits, pushes or deployment. Application AI usage for this work: **$0**.
