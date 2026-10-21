# XC Strategy Studio — end-to-end QA and campaign identity

Date: October 18, 2026. Repository: `XC Editorial studio`. Branch: `insight-discovery-poc`. Baseline HEAD: `9c8134a`. No commit, push or deployment.

## 1. Decision

**NO-GO for unconditional four-tab / all-artifact certification.** The campaign-identity corrections and tested mock-mode application journeys pass. Native Word visual rendering remains BLOCKED. One non-reproduced development-browser warning remains explicitly recorded below; it has not been silently dismissed as a quota or application problem.

**Input Pack → Insight Discovery → Finalize Strategy:** both approved real campaigns completed the continuous offline browser journey, including five lenses, follow-up, a saved finding, all 19 canvas fields, draft version restoration, reload and explicit approval. This supports a controlled mock-mode demonstration of those tested paths, not a zero-glitch or live-production guarantee.

Live model output quality: **LIVE VERIFICATION PENDING — not authorized**. Enterprise integration readiness is separate and not claimed. Application AI API spending: **$0**.

## 2. Baseline and scope

- Read the supplied full QA brief, repository AGENTS.md, installed Next 16.3.8 testing/environment/client-component guides, existing four-tab verification and Requirement 5 reports.
- Correct target repository verified; the tool's default `Editorial Agent/editorial-agent` directory is a different application and was not edited.
- Recorded the original git status and SHA-256 manifest of 267 non-secret repository files in `/private/tmp/xc-final-qa.gPSxoT/before.json`. Environment files, git internals, dependencies and generated caches were excluded. No credential value was read or printed.
- All work and test servers used separate temporary copies, without `.env*`, `.git` or existing `.next`. Reused already-installed dependencies; installed nothing.
- Discovery isolation: `/private/tmp/xc-final-qa.gPSxoT`, port **3271**. Legacy/build isolation: `/private/tmp/xc-final-qa-legacy.dQr3jl`, port **3272**. `reuseExistingServer=false`.
- The in-app Browser skill's `scripts/browser-client.mjs` is missing from the installed plugin. Existing repository Playwright 1.63 / local Chrome was used, as requested, not a new browser service.
- The user's localhost:3000 instance and its existing browser session were not contacted, restarted or inspected. Consequently this report does not pretend to identify the contents or exact corruption of that earlier live browser session.

Initial existing acceptance: offline guard + actual-source extraction **7 passed**; existing four-tab and final-brief browser baseline **8 passed**. The supplied two-campaign PDF already produced the correct selected names in that baseline. Additional regressions exposed genuine failures in other supported input/name-resolution paths.

## 3. Campaign-name lineage and root causes

Source → `DocumentFileImport` / `extractDocument` → `detectIMCCampaignScopes` → explicit campaign selection → `applyStudioSource` → `parseIMCBrief` / `getParsedIMC` → `studioPack` → preparation request metadata / `discoveryFoundation` → campaign-scoped stored findings and Working Space → `approveDiscoveryCanvas` frozen pack → `buildStudioBriefInput` / `packageDiscoveryBrief` → preview + `buildBriefDocument` → existing PDF/Word exporters / `briefFilename`.

Canonical campaign scope/storage identity is not the display name: source-scoping IDs identify the chosen portion of the document, and `discoveryStorageKey` isolates state using the scoped original source. The source-derived or human-confirmed display name is metadata carried with that pack, not a replacement for the product or filename.

Verified root causes:

1. `Campaign title:` was absent from canonical parser aliases. A clearly named pasted brief produced an empty campaign field. Added the alias; parser version 4 invalidates older cached extraction without deleting generation history.
2. PDF heading normalization replaced en/em dashes with a hyphen. It now repairs collapsed PDF separator spacing **without replacing the original separator glyph, capitalization or wording**. Original document text remains unchanged.
3. Campaign scoping covered the supplied multi-page PDF layout but not separate, explicitly labeled campaigns pasted into one document. Those pasted campaigns now use the existing explicit selection control, and the state boundary refuses a still-multi-campaign source.
4. Missing or placeholder campaign names could reach human approval and packaging. The source-aware metadata-confirmation step appears only for unresolved identity. `None`, `undefined`, `N/A`, `Not supplied` and equivalent empty placeholders are not named campaigns. Approval and deterministic packaging reject unresolved identity, including programmatic calls to those functions.
5. Resolving metadata after opening Working Space could leave its untouched Context starter saying the campaign name was missing. Only that untouched, unsaved starter is refreshed. Human edits, intentional clears, saved versions and the original Suggested V0 remain intact.
6. Historical saved reports with unresolved identity had no export review gate. Their original records remain unchanged, but PDF/Word/print actions require a reviewed, newly confirmed named package; no silent historical metadata rewrite occurs.
7. Visual review found an appendix heading orphaned at a print page boundary. A print-only `break-after` correction keeps appendix headings with the following content. Screen design is unchanged.

### Actual before/after examples

| Input / campaign                                    | Before                            | Verified after                                                                                                                                                |
| --------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real PDF, first campaign                            | Correct in baseline               | `Movers - Campaign Extensions Refresh Brief` in selected pack, header, drawer, all five request foundations, frozen approval, preview, PDF, DOCX and filename |
| Real PDF, second campaign                           | Correct in baseline               | `Xfinity Pro - Campaign Extensions` at the same boundaries; no first-campaign fields imported                                                                 |
| `Campaign title: Bright Days — Autumn 2026`         | Empty parsed campaign             | Exact supplied name; persists after selection and reload                                                                                                      |
| `Bright Days – Campaign Extensions Brief`           | Dash changed to `-`               | Original `–` retained                                                                                                                                         |
| `Campaign: None`                                    | Placeholder could be approved     | Unresolved identity; approval disabled until explicit human name confirmation                                                                                 |
| Human confirms `Kevin’s move review — October 2026` | No dedicated supported resolution | Header, Context, frozen approval, preview and both exports use the confirmed metadata; provenance says human-confirmed, **not source-extracted**              |
| Old saved report with `campaign: None`              | Export controls available         | Historical record preserved; actionable warning and export review gate                                                                                        |

Human confirmations are bound to the exact original source and archived/restored with that campaign. They cannot override a different explicitly supplied name, rename an arbitrary product into a campaign, or migrate to a different source. A later confirmation invalidates current confirmation fingerprint but does not mutate past approved snapshots.

## 4. Defect and investigation ledger

| ID     | Severity    | Reproduction / boundary                                                                                             | Correction / final regression                                                                                                                                                                                                                          |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA-01  | High        | `campaign-identity.spec.ts`: explicit Campaign title returns empty                                                  | Alias + cache version; PASS                                                                                                                                                                                                                            |
| QA-02  | Medium      | Two source headings change dash punctuation                                                                         | Glyph-preserving spacing normalization; PASS                                                                                                                                                                                                           |
| QA-03  | High        | Two labeled pasted campaigns accepted as one source                                                                 | Existing picker extended; build boundary rejects ambiguity; PASS                                                                                                                                                                                       |
| QA-04  | High        | Unnamed source approves without error                                                                               | Human metadata confirmation + approval/handoff/package validation; PASS                                                                                                                                                                                |
| QA-05  | Medium      | Confirmed name leaves stale untouched Context starter                                                               | Source-aware starter correction with edit/version protection; PASS                                                                                                                                                                                     |
| QA-06  | High        | Old unnamed report can be exported as a finished artifact                                                           | Preserve history and require reviewed regeneration before exports; PASS                                                                                                                                                                                |
| QA-07  | Low         | Movers print page 14 ends with Saved discoveries heading; body starts page 15                                       | Print-only heading break control; focused browser content/page assertion and changed-page visual review PASS                                                                                                                                           |
| ENV-01 | Setup       | Initial sandbox refuses binding 127.0.0.1:3271 (EPERM)                                                              | Approved isolated local test execution; same offline configuration retained                                                                                                                                                                            |
| ENV-02 | Environment | Browser plugin automation file missing                                                                              | Existing local Chrome/Playwright suite available and executed                                                                                                                                                                                          |
| ENV-03 | Blocker     | Installed Word 16.114 native PDF export times out (-1712)                                                           | No Word-rendered PDF produced; DOCX visual layout BLOCKED, not a false PASS                                                                                                                                                                            |
| OBS-01 | Unverified  | One `[browser] unhandledRejection: [object Event]` message during full-suite deliberately delayed Word-chunk export | Existing test passed; 3 trace-enabled independent repeats passed without that warning. Traces contain no page error/crash, only the intentionally blocked font-resource error. Exact initial cause remains unverified; no speculative code suppression |

No application change was made for the proposed pending-preparation race: the browser demonstrated that Build Input Pack is correctly locked while preparation is pending, even after navigating away and staging a different brief. The test now verifies that supported behavior, then verifies rebuilding after completion. It does not force disabled controls or weaken a genuine race assertion.

## 5. Four-tab acceptance matrix

PASS means executed assertions at the stated offline boundary, not merely an existing UI element.

| Area              | Acceptance                                                                                          | Result / evidence                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Navigation        | Exactly Input Pack / Insight Discovery / Finalize Strategy / XC Brief                               | PASS; accessible names and count; no Working Space tab                                            |
| Input Pack        | Actual PDF import and both campaign selections                                                      | PASS; browser PDF worker + real fixture; no implicit first selection                              |
| Input Pack        | Paste and labeled multi-campaign selection                                                          | PASS; both scopes, source exclusion and reload                                                    |
| Input Pack        | Campaign name / objective / audience / original RTB / JTBD / constraints / source records           | PASS; field fixtures + canonical extraction suite; true absences remain distinct                  |
| Input Pack        | Three V0 preparations, six exact-excerpt selectable Sparks                                          | PASS; all six source matches asserted; mock labels retained                                       |
| Input Pack        | Independent errors/retries, steering, Keep/Improve/Replace, selection/version restore               | PASS; existing state and browser regression suites                                                |
| Input Pack        | Readiness, selected adaptation rather than full analysis, data/Spark handoff                        | PASS; focused R1 and full browser regressions                                                     |
| Discovery         | Explicit question and Start; five distinct lenses receive identical full selected pack              | PASS; exact campaign/source/question assertions for both PDF campaigns                            |
| Discovery         | Individual follow-up, deeper/contrary intent, failure/retry, comparisons and saved findings         | PASS; R2/R3 browser + request/memory suites                                                       |
| Discovery         | Talk to All and duplicate submission / rapid selection edges                                        | PASS; exact five-request question/context, duplicate-click lock, selections and browser history   |
| Discovery         | Delayed cross-campaign answer/comparison/suggestion and stale-context safety                        | PASS; existing real-PDF R2/R3/R4 tests                                                            |
| Working Space     | Desktop right drawer, accessible mobile sheet, usable research alongside it                         | PASS; actual desktop/mobile captures, focus and layout tests                                      |
| Working Space     | All 19 fields; source-aware V0; edits/clears/saves/versions/findings/reload/campaign isolation      | PASS; R4 + selected-V0 + four-tab browser suites                                                  |
| Finalize Strategy | Same draft inline; explicit approval; frozen snapshot and reconfirm after changes                   | PASS; exact approved text and version-history checks                                              |
| XC Brief          | Selected research, RTB adaptation, Sparks, findings; private notes excluded                         | PASS; R5 source/inclusion/approval regressions and export content checks                          |
| Exports           | PDF, print and DOCX content match the structured brief and campaign                                 | PASS; local parsing of all sections, exact approved line, filenames and other-campaign exclusions |
| Exports           | PDF / print visual pages                                                                            | PASS within reviewed layouts; print-heading fix verified separately; no clipping/overlap found    |
| Exports           | Native DOCX visual rendering                                                                        | **BLOCKED**; Word native export timeout, no rendered Word pages reviewed                          |
| Persistence       | SessionStorage / IndexedDB fallback, failed saves, latest human draft, history and source integrity | PASS; storage and R3/R4 browser suites                                                            |
| Regression        | Feature flag ON and OFF / legacy creative flow                                                      | PASS; complete supported suites, with opposite-mode skips explained below                         |
| Security          | Mock provider, empty key, fail-closed guard, no external source retrieval                           | PASS; preflight guard tests, server-mode assertions, browser host blocking                        |
| Live / enterprise | Paid model quality and enterprise connectivity                                                      | **UNVERIFIED / NOT AUTHORIZED**; not represented as working integrations                          |

Both real fixtures genuinely lack a distinct original JTBD and an explicit GTM RTB approval record. Original RTBs are supplied and retained; approval is **unknown**, not approved and not missing proof. All six enterprise sources remain `not_connected`.

## 6. Continuous campaign journeys and evidence

For **each** actual campaign, a fresh browser performed:

1. Upload the actual combined PDF, attempt building without a campaign (blocked), explicitly choose a campaign and build all three mock V0 outputs.
2. Review full campaign context; include the selected RTB adaptation, one Data record and two exact-excerpt Sparks; verify six total Sparks and source availability.
3. Enter a campaign-specific investigation question; explicitly run all five lenses; assert each request carries that exact selected source, question and campaign.
4. Challenge Consumer Agent, await its answer, save a finding separately to Working Space.
5. Open desktop drawer, enter a distinctive human line, save two versions and restore the first; inspect mobile sheet; continue to the same full-width canvas.
6. Reload; verify campaign, human draft, field history and saved finding; explicitly confirm the strategy.
7. Generate deterministic XC Brief, export PDF and DOCX, assert every structured section's content and campaign, reject other-campaign title, and produce print PDF with navigation hidden.

Actual approved test lines (test markers, not production recommendations):

- Movers: `Kevin QA 0: preserve this exact approved human strategy.`
- Xfinity Pro: `Kevin QA 1: preserve this exact approved human strategy.`

Artifacts and desktop/narrow-screen captures are under `docs/final-e2e-qa/`:

| Stage             | Movers desktop / mobile                                                                                                         | Xfinity Pro desktop / mobile                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Input Pack        | [desktop](final-e2e-qa/movers/01-input-pack-desktop.png) / [mobile](final-e2e-qa/movers/01-input-pack-mobile.png)               | [desktop](final-e2e-qa/xfinity-pro/01-input-pack-desktop.png) / [mobile](final-e2e-qa/xfinity-pro/01-input-pack-mobile.png)               |
| Discovery         | [desktop](final-e2e-qa/movers/02-discovery-desktop.png) / [mobile](final-e2e-qa/movers/02-discovery-mobile.png)                 | [desktop](final-e2e-qa/xfinity-pro/02-discovery-desktop.png) / [mobile](final-e2e-qa/xfinity-pro/02-discovery-mobile.png)                 |
| Working Space     | [desktop](final-e2e-qa/movers/03-working-space-desktop.png) / [mobile](final-e2e-qa/movers/03-working-space-mobile.png)         | [desktop](final-e2e-qa/xfinity-pro/03-working-space-desktop.png) / [mobile](final-e2e-qa/xfinity-pro/03-working-space-mobile.png)         |
| Finalize Strategy | [desktop](final-e2e-qa/movers/04-finalize-strategy-desktop.png) / [mobile](final-e2e-qa/movers/04-finalize-strategy-mobile.png) | [desktop](final-e2e-qa/xfinity-pro/04-finalize-strategy-desktop.png) / [mobile](final-e2e-qa/xfinity-pro/04-finalize-strategy-mobile.png) |
| XC Brief          | [desktop](final-e2e-qa/movers/05-xc-brief-desktop.png) / [mobile](final-e2e-qa/movers/05-xc-brief-mobile.png)                   | [desktop](final-e2e-qa/xfinity-pro/05-xc-brief-desktop.png) / [mobile](final-e2e-qa/xfinity-pro/05-xc-brief-mobile.png)                   |

[Movers PDF](final-e2e-qa/movers/campaign-brief.pdf), [Movers DOCX](final-e2e-qa/movers/campaign-brief.docx), [Movers print PDF](final-e2e-qa/movers/print.pdf).
[Xfinity Pro PDF](final-e2e-qa/xfinity-pro/campaign-brief.pdf), [Xfinity Pro DOCX](final-e2e-qa/xfinity-pro/campaign-brief.docx), [Xfinity Pro print PDF](final-e2e-qa/xfinity-pro/print.pdf).

The first Data record is campaign metadata; selecting it does not make it validated customer research. Mock Sparks are deterministic workflow fixtures, not evidence of live-model creative quality. The original PDF is one shared source document, so its filename may contain Movers even in correctly scoped Xfinity Pro provenance; campaign metadata and other-campaign fields are not imported on that basis.

## 7. Commands and actual test results

All verification commands used this process-local prefix, never an edited environment file:

```sh
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

The AI/unit command additionally sets `NODE_OPTIONS=--conditions=react-server`:

```sh
./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/offline-guard.spec.ts tests/ai/real-imc-extraction.spec.ts tests/ai/input-pack-offline-fixture.spec.ts --output=test-results-preflight
./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/campaign-identity.spec.ts --output=test-results-identity-before
./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-unit-verified --reporter=json
```

Discovery full-suite variables: `NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_PORT=3271 XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent'`.

```sh
./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-four-tab-ui.spec.ts tests/strategy-studio-final-brief.spec.ts --output=test-results-baseline --global-timeout=240000
./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-discovery-final --global-timeout=600000
./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-campaign-qa.spec.ts --output=test-results-qa-verified --global-timeout=240000
./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-campaign-qa.spec.ts --grep 'rapid selections' --output=test-results-interaction-edges --global-timeout=180000
./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-final-brief.spec.ts --grep 'a delayed export' --repeat-each=3 --trace=on --output=test-results-export-repeat --global-timeout=180000
```

Legacy variables: `NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3272`.

```sh
./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-legacy-verified --global-timeout=360000
```

Static/build commands:

```sh
npm run typecheck
npm run lint
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
./node_modules/.bin/prettier --check <the 17 changed source/test paths in section 9>
./node_modules/.bin/prettier --check app components lib tests '*.ts' '*.mjs' '*.json'
git diff --check
```

| Verification                                              | Result                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Final full AI/unit                                        | **197 passed**, 0 failed/skipped/flaky; 18.7 s                           |
| Full Discovery browser                                    | **75 passed**, 1 opposite-mode skip, 0 failed; 6.1 min                   |
| Final full legacy browser                                 | **41 passed**, 1 opposite-mode skip, 0 failed; 2.4 min                   |
| Final new QA / print correction rerun                     | **6 passed**, 0 failed/skipped; overlaps full Discovery; 45.0 s          |
| Additional rapid-interaction / Talk to All / history test | **1 passed**, 0 failed/skipped; 12.1 s                                   |
| Delayed-export diagnostic repeats                         | **3 passed**, no skips/failures; 38.8 s; one unique case already counted |
| Typecheck / lint                                          | PASS                                                                     |
| Supported production build                                | PASS, final print-only correction included                               |
| Focused Prettier                                          | PASS                                                                     |
| Repository-wide Prettier                                  | Four pre-existing failures below, left unchanged                         |
| Target whitespace / preservation check                    | PASS; no original file removed; only the 14 listed originals changed     |

Each of the two feature-flag tests executes and passes in its intended mode, and is skipped once in the opposite mode. No optional local import or walkthrough test was skipped: Black Friday PPTX, tactical DOCX and template PDF imports ran locally. Overlapping baseline, focused and repeated runs are not added again to unique counts.

Unique totals: **197 unit + 117 browser = 314 distinct passed cases**. The additional interaction test was executed separately after the full Discovery suite; it is not represented as a full-suite rerun. There are no automatic test retries in these totals.

Initial failures retained in the evidence trail:

- Four new campaign identity tests initially failed, reproducing QA-01 through QA-04.
- First full unit run: 194 passed / 2 failed because removing all separator normalization also removed required PDF spacing cleanup. Corrected while preserving punctuation; all 197 final unit tests pass.
- First new browser run: 5 failed. Three were strict-selector collisions with Next's own alert announcer; one was the test including PDF page furniture inside a cross-page content comparison; one attempted an intentionally disabled rebuild during pending preparation. Corrected the harness to test supported behavior, retaining content equality and pending-state safety assertions.
- Next new browser run: 3 passed / 2 failed because visual navigation text includes step numbers while accessible names do not. Asserted the exact four accessible labels, not weaker substring matching. Next run: all 5 passed.
- Expanded six-case run and full suite: all cases pass. Added print page-boundary assertion after visual review, then all six passed again.
- OBS-01 was not hidden: one full-suite warning; 3 trace-enabled repeats did not reproduce it. No app page crash or wrong download was seen.

Unrelated baseline formatting failures, unchanged:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

## 8. Artifact review and Word blocker

Existing PDF.js and installed native canvas rendered **52 pages** locally: Movers export 15 + print 15; Xfinity Pro export 9 + print 9; human-confirmed-name export 4. Initial pages were inspected throughout, not just covers; the identified print heading problem was corrected and changed pages re-rendered/reviewed. No clipped/overlapping text or missing section content was found. Full section content was also checked against parsed PDF text and DOCX XML. Long source-preserving paragraphs and repeated selected support make these artifacts verbose; no source text was rewritten to cosmetically shorten them.

Installed renderer check: Word **16.114** present; LibreOffice/soffice and Poppler absent. No new dependency or conversion service was installed.

A fresh native Word rendering was attempted with the existing guarded `/private/tmp/xc-r512-docx.St3Q8J/render-word.applescript`, on the exact read-only file `/private/tmp/xc-final-qa.gPSxoT/artifacts/word-review/Movers-QA.docx`, writing only a local temporary PDF. It again failed at **save Word-rendered PDF** with **AppleEvent timeout -1712**. No usable Word-rendered PDF exists. A separate exact-path-checked attempt to close only that test document without saving returned **-1708**. **Movers-QA.docx may remain open and needs manual closing without saving.** No unrelated Word document was closed, changed or saved.

Untouched SHA-256 values of the fresh read-only Word review copies:

- Movers: `5b5da97271d4610b726cdd528a4e402ded76e5932c9c6df847a2d8145fe8b076`.
- Xfinity Pro: `f554fce3f83ef31d4272e1afaf95830df5f51a8d50e9b95da291073691a74b5e`.

Both campaigns' DOCX content passes. **Zero native-rendered DOCX pages were visually reviewed.** Xfinity Pro was not opened in another failed automated Word attempt after the renderer failed for Movers. R5-12 remains **BLOCKED**; Requirement 5 remains **14 PASS / 1 BLOCKED**, not 15/15.

Manual follow-up: open each final DOCX in Word Print Layout, inspect every page against its structured/PDF content, verify exact campaign and approved line, original proof vs selected adaptation, source labels, section completeness, readable tables/headings, unclipped text and sensible page breaks. Record actual page counts/reviewer/defects before closing R5-12.

## 9. Exact source/test changes

Fourteen pre-existing files changed relative to the captured working tree:

1. `app/studio-wireframe.css` — print-only appendix heading pagination.
2. `components/DiscoveryInputPack.tsx` — conditional human name confirmation, provenance, readiness identity check, existing picker support for labeled pasted scopes and preparation metadata.
3. `components/InsightDiscoveryStudio.tsx` — unresolved-name approval button guard; update only untouched campaign Context starter on metadata resolution.
4. `components/StrategyPanels.tsx` — preserve historical unnamed reports, require review before packaged exports/print.
5. `lib/ai/provider.ts` — respect explicitly human-confirmed campaign metadata for research output while retaining original source values.
6. `lib/discovery-handoff.ts` — campaign identity validation at human approval.
7. `lib/discovery-studio.ts` — canonical source vs human-confirmed metadata, exact-source archive binding, ambiguity rejection, preparation metadata and package provenance/identity validation.
8. `lib/imc-campaign-scope.ts` — labeled pasted multi-campaign scopes; keep source punctuation.
9. `lib/imc-parser.ts` — Campaign title alias, punctuation fidelity, parser cache version 4.
10. `lib/studio-brief-input.ts` — reject unresolved identity in approved handoff.
11. `lib/types.ts` — optional additive campaign identity provenance metadata.
12. `lib/upstream.ts` — reparse cached pre-v4 extraction.
13. `lib/workspace-suggestions.ts` — truthful human-confirmed metadata starter label.
14. `tests/imc-parser.spec.ts` — only the two exact parser-version expectations updated from 3 to 4; all extraction/source assertions retained.

Four new text/code files:

- `lib/campaign-identity.ts` — usable-name validation and edit-safe metadata starter refresh.
- `tests/ai/campaign-identity.spec.ts` — 11 deterministic identity/provenance/preservation regressions.
- `tests/strategy-studio-campaign-qa.spec.ts` — actual campaign journeys, missing/confirmed identity, pasted scopes, pending-state safety, historical-report gate and interaction edge verification.
- `docs/final-e2e-qa-verification.md` — this report.

Generated QA screenshots and test export copies are under `docs/final-e2e-qa/`; they are local evidence, not a public deployment. No model, reasoning effort, prompt redesign, exporter rewrite, existing fixture, credential or environment file was changed. Reasoning effort remains **low**. All original working-tree work is preserved; no reset, clean, stash, revert, commit or push was used.

## 10. R1–R5 regression assessment and remaining work

| Requirement               | Freshly exercised offline evidence                                                                                                                       | Assessment                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| R1 Campaign Context       | Real PDF/PPTX/DOCX import, expected source fields, all preparation workflows, source fidelity, readiness, six Sparks, steering/history/selection/handoff | PASS for exercised offline acceptance; live-model behavior pending |
| R2 Five Thinking Partners | Shared selected full context, all five lenses, evidence claims, independent execution/retry, source integrity and stale-response suites                  | PASS offline; no claim of connected research                       |
| R3 Conversation           | Explicit human trigger, follow-ups, deeper/contrary actions, per-finding threads, memory, comparison, cancellation, persisted campaign conversations     | PASS offline; see separately recorded OBS-01 diagnostic warning    |
| R4 Working Space          | All 19 fields, optional sources/findings, edit/clear preservation, versions, drawer/full-width shared state, approval snapshots and quota fallback       | PASS offline                                                       |
| R5 XC Brief               | Human-approved snapshot, selected support, exclusion rules, revisions/history, structured PDF/Word content and print                                     | Content/workflow PASS; native DOCX visual gate BLOCKED             |

Disconnected sources: **Tableau, iSpot, ACE, Datorama, Brand Hub, Product / Audience Research**. Web/case-study search is also not connected. No unauthorized connector was added, queried or counted as verified research.

This is a local prototype: explicit human approval is enforced by the existing application/state and packaging contracts, not a new signed enterprise approval/audit service. This task did not add authentication or claim server-verifiable nonrepudiation of human identity.

Before unconditional full-demo signoff:

1. Complete and record all-page native Word review for both campaigns, or explicitly exclude DOCX layout from the demonstration with stakeholder risk acceptance.
2. Keep OBS-01 visible until its exact cause is identified or the non-reproduced development warning is explicitly accepted for the controlled demo. Do not promise no possible complaints based on passing tests.
3. Rebuild the selected Input Pack and explicitly reconfirm affected old unnamed reports; historical records are intentionally not silently rewritten.
4. Run live-model quality/latency verification only with separate explicit permission; it was not performed here.

## 11. Safety confirmation

The offline guard remained active in every test/build process: `AI_MODE=mock`, empty `OPENAI_API_KEY`, `XC_OFFLINE_TEST=1`, telemetry disabled. Existing in-memory SDK transport tests intentionally exercise failure classification without constructing a real network client. The guard tests reject real SDK execution and unregistered clients even if a test temporarily exercises a live-mode configuration branch with a non-secret fixture value.

The browser used repository non-loopback DNS blocking; new QA routes additionally abort external HTTP(S) before transmission. The pre-existing Google Fonts CSS attempt was deliberately blocked; no font or external research fetch was allowed. No API key was logged or put into a client bundle by this work. No paid/live AI, external research API, public document conversion service, deployment, credential change or localhost:3000 use occurred.

Application AI API cost: **$0**. Stop after QA/corrections/report; no live integration or redesign begins automatically.

### Subsequent explicit restart request

After QA finished, the user explicitly requested restarting the application. The earlier localhost:3000 restriction applied throughout the QA/testing pass. The subsequently authorized restart uses process-local mock/offline settings and does not modify `.env` files or credentials; no live provider access is enabled.

Application running again at `http://localhost:3000` from `insight-discovery-poc`; home HTTP 200 and `/api/ai/agent` reports `mode=mock`, `provider=mock`, `configured=true`. No listener was found on 3000 before launch, so no unrelated process was killed. Isolated QA ports 3271/3272 both return ECONNREFUSED after testing. The requested dev process remains running.

Post-application manifest: all 267 original non-secret files remain; precisely the 14 source/test originals listed in section 9 changed. Four new text/code files and 26 QA screenshot/export artifacts were added. Target `git diff --check` passed. No original untracked file was removed or replaced wholesale, and all source/test patch contents match the isolated verified versions.

A non-fatal webpack cache rename ENOENT warning appeared during startup in the existing `.next/dev/cache` directory. Both health endpoints still returned HTTP 200. No cache deletion, credential edit or unrelated repair was performed to hide it.
