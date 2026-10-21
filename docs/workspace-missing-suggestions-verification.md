# Working Space: Insight/JTBD suggestions and optional supporting context

Repository: XC Editorial studio. Branch: `insight-discovery-poc`. Starting HEAD: `9c8134a`.

## Root causes and limits of diagnosis

The user's screenshot was reproduced in an isolated browser using the real Movers source fixture and a controlled saved draft. Problem/Audience retained their source-derived values, while Insight/JTBD contained saved empty strings and the older `Not in the Input Pack · add your own` provenance. The pre-change browser test captured this state and failed because the requested **Fill missing suggestions** action did not exist.

This is not evidence that Movers lacks enough context for a proposed insight or job:

- `seedStudioDiscovery` already calls `canvasPrefill` for genuinely new drafts. It directly maps `pack.objective` → Problem and `pack.audience` → Audience, and independently derives Insight/JTBD proposals. Current fresh-source mappings worked before this change.
- `readStudio` / `readDiscoveryDraft` restore source-scoped saved values. `preserveRestoredWorkspace` marks a restored draft as opened. `prepareWorkspaceDraft` deliberately refuses to reseed an opened/restored/edited draft. An empty string cannot safely be assumed to be an accidental omission rather than Kevin's intentional edit. Re-uploading the same source can restore the same source-scoped draft.
- A historical missing-field label was rendered verbatim, incorrectly implying that usable campaign context was unavailable today. It now displays **No starting suggestion saved · preview one or add your own**, without rewriting stored historical provenance.
- There was no explicit, previewable upgrade path for such older blanks. Automatic hydration/backfill would have broken the user's preservation requirements; that is not the correction implemented here.

The actual private localhost:3000 tab/storage was not accessed, so its precise saved record versus loaded-bundle identity remains unverified. The screenshot's state is reproduced, not claimed to have been read from that tab.

### JTBD agent / Input Pack mapping

The prep card's title says JTBD & Reason to Believe, but the current `outputSchemas.rtb` contract supplies `originalRtb`, `xcAdaptation`, approval status and review notes—not a distinct generated JTBD property. `studioPack` correctly places the selected `xcAdaptation` in `proposedRTB`, and Working Space uses it as Proof / RTB. It must not be copied blindly into Job to Be Done.

`originalJTBD` / `jtbdContext.original` retain explicitly labeled source jobs. Supplied proposed/test jobs remain in `jtbdContext.proposed`, unapproved and distinct. An explicitly selected proposed-job item in `selectedResearch` (recognized Proposed JTBD / XC JTBD Adaptation categories) takes priority in the editable job. Otherwise the preserved original is used; absent that, a Proposed V0 is constructed from audience/situation and key-message context. Movers and Pro have no formally labeled original job in these fixtures. No original JTBD or new prep-agent output field was invented, and no unrelated agent contract was changed.

## Implemented behavior

### New draft proposals

Insight fallback now leads with a **working hypothesis / consumer tension**, not a restated objective. For Movers, the proposed tension concerns wanting continuity during a move while arranging the connection may become another decision to manage. For Pro, it concerns protecting the activity that matters versus a feature/equipment list that may not explain the benefit. These are explicitly unverified interpretations, not customer-research findings. Actual selected Spark hypotheses can inform the proposal, but unselected ideas cannot. A selected research item identical to the objective, audience or campaign metadata no longer masquerades as an Insight.

Existing source-insight / selected supplied research / relevant saved-finding priorities are retained. Saved findings must match the current pack version and have valid located source excerpts before initial suggestion use. Stale, unsupported and research-gap findings do not become source-backed insights. The existing tests exercise those guards.

JTBD priority remains explicit selected proposed job → separately preserved source original → inferred **Proposed V0 JTBD · not original or approved**. Fallback grammar uses a first-person situation, intended action and desired outcome. `You can` messaging is normalized without producing `I want to I can…`. The original/proposed source wording itself is never reformatted or erased. Insufficient context leaves the value empty with a Needs validation label; no placeholder is saved as research.

The human-owned Brief Line is never part of either fill allowlist and new drafts remain empty. The separate Strategic Starting Point / Canvas / Brief Line order is retained. Existing human lines, intentional clears, saved findings, notes and all history records stay intact.

### Explicit legacy repair

**Working Space → Strategy Canvas → Fill missing suggestions** generates a local preview only after a click. Both offered choices start unchecked. Kevin can select Insight, JTBD or both; Cancel changes nothing. Only chosen, still-empty fields receive values. Existing explicit versions are not replaced or cleared; the new value remains an editable draft until the existing Save Draft action creates a new version.

Preview identity checks the source-scoped storage key, campaign, selected Input Pack version, saved-finding references and both target values/version histories. A later edit, restored version, different campaign or selection makes the preview stale. Apply is disabled, and the pure apply function also refuses the stale preview. A legacy draft without provenance retains its text/history and receives only the chosen field origins; existing human text is not promoted into a new AI starting point. No destructive migration or hydration backfill was added.

`prepareWorkingSpace` also avoids even recomputing a new seed on reopening an already-opened/restored draft. The existing first-unopened selection review for a genuinely new untouched draft remains, so its initial selected context is captured once. Rendering and hydration do not run the new fill action.

### Category Truth

Category Truth was a read-only projection of **persisted selected Input Pack research**, not a separately editable DiscoveryState field or versioned strategy requirement. That same underlying data and selection persistence are retained. The view is now under collapsed **Supporting Strategy Context**, after the human Brief Line rather than inside the core Canvas. Original supplied JTBD wording is also available there when present, separately from the editable job.

The empty state is concise: **Needs validation · no category evidence selected.** Unavailable-source/Not supplied placeholders do not become category facts. Selected source-grounded category text remains accessible and survives reload. Category Truth adds no save, approval or finalization gate; those existing checks were not changed. No competitor research was fabricated or retrieved.

## Exact changed files

| File                                                       | Change                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lib/workspace-canvas-prefill.ts`                          | Tension-led Insight fallback, metadata-duplicate exclusion, clearer Proposed V0 job label and first-person normalization. |
| `lib/workspace-missing-suggestions.ts` (new)               | Read-only preview, explicit two-field allowlist and stale-safe selective application.                                     |
| `lib/workspace-presentation.ts`                            | Pure Category Truth projection excludes unavailable-source placeholders; Input Pack state untouched.                      |
| `components/WorkingSpace.tsx`                              | Explicit preview/checkbox/apply/cancel flow; honest legacy-empty caption; optional supporting context.                    |
| `components/InsightDiscoveryStudio.tsx`                    | Skip initialization computation for an already-opened/restored or provenance-less draft.                                  |
| `app/studio-wireframe.css`                                 | Narrow full-width preview/choice styles; existing layout/styling retained.                                                |
| `tests/ai/workspace-missing-suggestions.spec.ts` (new)     | Twelve offline initialization/consent/history/stale-context/quality/category cases.                                       |
| `tests/strategy-studio-missing-suggestions.spec.ts` (new)  | Five browser scenarios using real campaign fixtures and deterministic mocks.                                              |
| `docs/workspace-missing-suggestions-verification.md` (new) | This report and linked screenshot evidence.                                                                               |

Screenshot artifacts are new PNGs in `docs/workspace-missing-suggestions/`. No existing tests or assertions were edited to obtain passes. No model/provider settings, API schema, external connector, credentials, extraction source text or campaign-isolation validator was changed.

## Verification setup

All application/testing occurs in temporary copies, excluding `.env*`, `.git`, existing Next output and installed dependencies; the existing node_modules and Chrome installation are reused. The frozen baseline is `/private/tmp/xc-canvas-fill-base.gqmqpD`; development copy `/private/tmp/xc-canvas-fill-test.VXehrV`; production copy `/private/tmp/xc-canvas-fill-prod.XANQsU`.

Every application/test process is forced to:

```sh
AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

The existing `playwright.offline.config.ts` forces those server flags, prevents server reuse and blocks external browser DNS. The new browser cases assert `/api/ai/agent` reports mock mode, abort non-loopback requests and fail an unexpected external AI host. Existing server-side `generateOpenAI` refuses creation of a real client under `XC_OFFLINE_TEST=1`. No live or paid test was authorized or invoked.

Commands below use that prefix:

```sh
# Pre-change reproduction: expected missing-action failure, screenshot captured.
XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3341 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-missing-suggestions.spec.ts --grep 'legacy blanks' --output=test-results-missing-before

# Full unit regression, final code.
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-missing-ai-final

# Focused existing regressions plus the five new browser scenarios.
XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3341 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-missing-suggestions.spec.ts tests/strategy-studio-canvas-prefill.spec.ts tests/strategy-studio-workspace-regression.spec.ts tests/strategy-studio-premium-workspace.spec.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-working-space.spec.ts --output=test-results-missing-final

# Production copy only; wrapper retains the existing offline config safeguards.
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3342 ./node_modules/.bin/playwright test -c playwright.canvas-production.config.ts --output=test-results-canvas-production

./node_modules/.bin/tsc --noEmit --incremental false
npm run lint
```

The production wrapper exists only in the temporary production copy. It spreads the supported offline config, limits testMatch to the new spec and starts the existing production command on port 3342. It is not added to the repository. No new dependencies/browser service were installed. No localhost:3000 requests, process management or cache/storage changes were performed.

## Actual results

| Check                                                     | Result                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Pre-change legacy reproduction                            | One expected failure: Fill missing suggestions did not exist. Screenshot captured before timeout; not called a pass. |
| Initial focused browser scenarios                         | 4 passed.                                                                                                            |
| Expanded browser regressions before final copy refinement | 27 passed; no skips.                                                                                                 |
| Final full unit suite                                     | 298 passed; no skips/failures.                                                                                       |
| Final development browser regressions                     | 27 passed; no skips/failures (3.1 min).                                                                              |
| Production browser / screenshot verification              | 5 passed; no skips/failures (22.1 sec).                                                                              |
| Production build                                          | Passed.                                                                                                              |
| TypeScript and ESLint                                     | Passed.                                                                                                              |
| Focused formatting                                        | All nine changed text files passed.                                                                                  |
| Final applied-source / worktree preservation              | Applied files match tested source; 276 non-target baseline files unchanged; all 12 screenshot copies match.          |
| New unit cases rerun against applied repository           | 12 passed; no skips/failures.                                                                                        |
| Applied whitespace / focused formatting                   | git diff --check and all nine focused Prettier checks passed.                                                        |

The existing regression set covers both real campaigns, first initialization versus restoration, original/proposed JTBD distinctions, explicit draft versions, deliberate clears, 19 retained historical field records, saved findings and private notes, source isolation, stale agent/suggestion responses, mobile drawer accessibility, explicit approval and brief/export journeys. This is a focused browser regression set plus the full unit suite, not a claim that every repository-wide browser suite or paid live-model behavior was retested.

Visual inspection found a heavy inherited border after Category Truth moved outside the core field grid. A narrowly scoped 1px border/padding rule corrected it, and the affected browser/production checks were rerun. Final JTBD copy also removes brand-voice “our” only from inferred proposals; selected and original source jobs remain exact. No existing assertions were weakened for either correction.

Application to the actual repository checked `insight-discovery-poc` / `9c8134a`, required every existing target to match its frozen pre-work bytes, and refused to overwrite new-file or artifact targets. Five existing files were patched on top of all local work; four text files and twelve screenshots were added. The twelve new unit cases were then run directly against the applied repository, still with the strict offline prefix, using `--output=/private/tmp/xc-canvas-fill-test.VXehrV/test-results-applied-missing`. No app server was started there. Branch/HEAD remained unchanged. No pending local test failures or skips remain in the recorded final runs.

## Before / after screenshots

All screenshots are real browser captures of controlled offline fixtures, not rendered mockups or the user's private browser data.

- [Before: legacy missing Insight/JTBD and old caption](workspace-missing-suggestions/before-legacy-missing.png).
- New Movers: [prefilled Canvas](workspace-missing-suggestions/new-movers-canvas.png), [empty human Brief Line](workspace-missing-suggestions/new-movers-empty-line.png), [optional supporting context](workspace-missing-suggestions/new-movers-supporting-context.png).
- New Pro: [prefilled Canvas](workspace-missing-suggestions/new-pro-canvas.png), [empty human Brief Line](workspace-missing-suggestions/new-pro-empty-line.png), [optional supporting context](workspace-missing-suggestions/new-pro-supporting-context.png).
- Existing Movers: [blanks preserved before consent](workspace-missing-suggestions/legacy-before-choice.png), [explicit preview](workspace-missing-suggestions/legacy-preview.png), [chosen suggestions filled](workspace-missing-suggestions/legacy-filled-after.png), [exact human line retained](workspace-missing-suggestions/legacy-human-line-preserved.png).
- [Source-grounded selected Category Truth still accessible](workspace-missing-suggestions/selected-category-preserved.png).

## Handoff and remaining limits

For an existing draft, use **Fill missing suggestions**, choose the fields, then **Apply selected suggestions**. The existing **Save Draft** action creates versions. New drafts require no repair click when adequate source context is available. Do not clear browser storage or delete existing human writing as a workaround.

The running user app was not accessed/restarted, so its loaded source/session remains unverified. All model-assisted behavior was simulated deterministically; no claim is made about paid/live generation quality or enterprise research availability. Total new application AI API usage for this pass: **$0**. No commits, pushes, resets, stashes, clean operations or deployments.
