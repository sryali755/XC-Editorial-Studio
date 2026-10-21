# Requirement 5 — independent offline verification

Repository: XC Editorial studio. Branch: insight-discovery-poc.
Verification completed October 17, 2026 (America/New_York).
Scope: R5 only; no full application certification or live-model evaluation.

## 1. Initial audit

Every criterion began UNVERIFIED. Existing green tests were not treated as sufficient proof.

Inspected:

- `components/InsightDiscoveryStudio.tsx`: four tabs, confirmation fingerprint, explicit approval, frozen snapshots, inclusion controls, packaging, campaign archive, brief versions and error display.
- `lib/discovery-handoff.ts`, `lib/types.ts`: approved canvas and human strategy boundary.
- `lib/discovery-studio.ts`: original Input Pack, campaign archive, recovery, selected preparation provenance and deterministic final packaging.
- `lib/studio-brief-input.ts`: confirmed structured handoff.
- `lib/brief-document.ts`, `components/BriefDocumentPreview.tsx`: existing section model and preview.
- `components/StrategyPanels.tsx`, `lib/export-brief-pdf.ts`, `lib/export-brief-word.ts`: lazy local export, failure/retry and print.
- Persistence, source scoping, feature flags, provider guard, browser configs and existing tests.

Actual final-stage behavior is local deterministic packaging, NOT a paid AI final-brief call.
Kevin reviews/edits in Working Space, confirms explicitly, then packages the snapshot.
PDF, editable Word and print are the existing export formats. No slide-deck requirement/schema was introduced.

Reproduced defects:

1. Approved audience focus, supporting proof and human tension were omitted from the canvas/handoff. Final audience/proof could ignore Kevin's edits.
2. Packaging lacked an empty-line guard and its own Input Pack snapshot check.
3. A selected preparation RTB adaptation was absent from the output; original source context also needed to remain separate when human fields override it.
4. Selected mock preparation provenance was not propagated into the brief's demo label.
5. Missing approval snapshots showed an actionable error, but the unchanged confirmation fingerprint disabled the very reconfirmation needed to recover.
6. A delayed Word export downloaded the old campaign after switching to another campaign.
7. Screen styling overrode print hiding; navigation was printed and the collapsed source appendix needed explicit print visibility.
8. At 390px the Movers brand header extended to x=353.30 while the version badge began at x=309.92. The final-brief header needed containment, not a redesign.

Baseline checks: 167/167 existing AI/unit tests and 3/3 existing final-brief browser cases passed, demonstrating the coverage gaps.

## 2. Acceptance table

Evidence keys: U = new `tests/ai/requirement5-final-brief.spec.ts`; B = new `tests/strategy-studio-final-brief.spec.ts`.
U1/U3: human fidelity (Movers/Pro). U2/U4: original source and structure. U5: guards.
U6: adaptation. U7: selected finding provenance. U8: missing values. U9: mock preparation.
B1: print. B2/B3: actual PDF campaign flows. B4: failure/retry. B5: delayed export.

| ID    | Outcome                      | Initial status | Final status | Evidence                                                                                                                                                                                   |
| ----- | ---------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R5-01 | Explicit approval gate       | UNVERIFIED     | PASS         | B2/B3; existing four-tab and confirmation tests; navigation/running/saving do not approve.                                                                                                 |
| R5-02 | Human strategy fidelity      | UNVERIFIED     | PASS         | U1/U3, B2/B3: distinctive line, audience, proof, job, tension, direction, insight and execution text.                                                                                      |
| R5-03 | Approved version integrity   | UNVERIFIED     | PASS         | U1/U3/U5, B2/B3: frozen values, snapshot checks, two approvals/outputs, restore/export prior version.                                                                                      |
| R5-04 | Campaign isolation           | UNVERIFIED     | PASS         | B2/B3/B5: actual Movers/Pro switch, no approval/finding/brief leakage, restoration, delayed-export cancellation.                                                                           |
| R5-05 | Original IMC truth           | UNVERIFIED     | PASS         | U2/U4, B2/B3: original RTB, absent original JTBD, source background/product, constraints, channels, key messages, timing and records.                                                      |
| R5-06 | Human-controlled inclusion   | UNVERIFIED     | PASS         | U6/U7, B2/B3: research, Spark, finding and adaptation choices; omissions do not delete original selections/history.                                                                        |
| R5-07 | Evidence/provenance          | UNVERIFIED     | PASS         | U7/U9, B2/B3: exact excerpts/locators, versions, simulated labels, limitations, unknown RTB approval and disconnected sources.                                                             |
| R5-08 | Execution requirements       | UNVERIFIED     | PASS         | U1/U3/U8, B2/B3: human counts, desktop/mobile sizes, copy limit, deliverables and instructions survive unchanged.                                                                          |
| R5-09 | Missing information          | UNVERIFIED     | PASS         | U8, B2/B3: blank timing, missing original JTBD, optional execution blanks and unknown approval remain honest.                                                                              |
| R5-10 | Human review/editing         | UNVERIFIED     | PASS         | B2/B3 plus five Working Space regressions: editing/versioning, reload, latest edits and campaign scope.                                                                                    |
| R5-11 | Brief structure              | UNVERIFIED     | PASS         | U2/U4, B1/B2/B3: intended existing headings/order, no duplicate headings, all sections preserved by preview/export.                                                                        |
| R5-12 | Export/artifact verification | UNVERIFIED     | BLOCKED      | DOCX content checks pass. Installed Word 16.114 PDF rendering timed out (-1712); no Word-rendered pages were available for inspection. Manual Word review remains required; see section 9. |
| R5-13 | Persistence/history          | UNVERIFIED     | PASS         | B2/B3: reload, navigation, campaign archive, approval records, field history, prior brief selection and export.                                                                            |
| R5-14 | Failure/retry/stale safety   | UNVERIFIED     | PASS         | U5/U7, B4/B5: missing snapshot, unavailable finding, stale confirmation, export failure/retry, inclusion/version changes and delayed export. Packaging itself is synchronous.              |
| R5-15 | UI/regressions               | UNVERIFIED     | PASS         | B1–B5, 1440/390px checks, full Discovery and legacy suites, extra final Working Space/export/layout reruns.                                                                                |

No PASS is a claim about live-model quality or enterprise access.

## 3. Changes made

Exactly seven existing files changed relative to the start-of-task snapshot:

| File                                    | Reason                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/types.ts`                          | Optional approved human fields and selected preparation-provider metadata; legacy records remain compatible.                                                        |
| `lib/discovery-handoff.ts`              | Freeze the existing human audience/proof/tension fields during explicit approval.                                                                                   |
| `lib/studio-brief-input.ts`             | Use approved audience/proof/tension; separate proposed JTBD from preparation RTB adaptation.                                                                        |
| `lib/discovery-studio.ts`               | Selected mock provenance, empty-line/snapshot guards, faithful human mapping, separate original context/adaptation, source availability, Spark version attribution. |
| `components/InsightDiscoveryStudio.tsx` | A missing snapshot invalidates the current-confirmation UI state so reconfirmation can recover.                                                                     |
| `components/StrategyPanels.tsx`         | Key export state by brief identity; cancel obsolete asynchronous downloads/errors after unmount or version/campaign change.                                         |
| `app/studio-wireframe.css`              | Print-only completeness/hiding; narrow-screen header containment scoped exclusively to the XC Brief screen.                                                         |

Added:

- `tests/ai/requirement5-final-brief.spec.ts`: nine focused tests.
- `tests/strategy-studio-final-brief.spec.ts`: five focused browser tests using the actual client PDF and both campaigns.
- `docs/requirement5-verification.md`: this report.

No existing test file, prompt, model, reasoning effort, credential, environment file, UI label/button or stage workflow was changed.
The new source-context headings use the existing brief section model, not a new schema.
Original RTB/JTBD remain distinct from approved human interpretations. Private notes are not packaged.

## 4. Verification evidence

Isolated copies:

- Discovery: `/private/tmp/xc-r5-audit.l2yxfV`, port 3231.
- Legacy/build: `/private/tmp/xc-r5-legacy.ee7VWF`, port 3232.

Copies excluded .git, node_modules, .next, .env*, and existing reports; reused installed dependencies/Chrome.
No existing live development server was used.

Common environment for all test/build commands:

```sh
export AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

Commands (relative to the indicated isolated copy):

```sh
# Full AI/unit suite
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-ai

# Full Discovery suite, including opt-in capture and three available local document imports
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_CAPTURE_SCREENSHOTS=1 XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3231 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-discovery

# Full legacy suite in the separate copy
NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3232 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-legacy

# Final expanded R5 and Working Space regression rerun
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3231 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-final-brief.spec.ts tests/strategy-studio-working-space.spec.ts --output=test-results-focusedfinal

# Final legacy export/layout rerun after final-brief-only CSS correction
NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3232 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/brief-export.spec.ts tests/workflow.spec.ts --grep 'PDF|preview fits mobile|layouts stay within' --output=test-results-legacyfinal

# Expanded focused unit assertions
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/requirement5-final-brief.spec.ts --output=test-results-ai-focused

npm run lint
npm run typecheck
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
./node_modules/.bin/prettier --check app/studio-wireframe.css components/InsightDiscoveryStudio.tsx components/StrategyPanels.tsx lib/types.ts lib/discovery-handoff.ts lib/studio-brief-input.ts lib/discovery-studio.ts tests/ai/requirement5-final-brief.spec.ts tests/strategy-studio-final-brief.spec.ts
./node_modules/.bin/prettier --check app components lib tests *.ts *.mjs *.json
git diff --check
```

| Check                            | Actual result                                                |
| -------------------------------- | ------------------------------------------------------------ |
| Full AI/unit                     | 176 passed, 0 failed/skipped.                                |
| Full Discovery browser           | 66 passed, 1 skipped, 0 failed; 67 discovered.               |
| Full legacy browser              | 41 passed, 1 skipped, 0 failed; 42 discovered.               |
| Final R5 + Working Space rerun   | 10 passed, 0 failed/skipped; overlaps full Discovery.        |
| Final legacy export/layout rerun | 3 passed, 0 failed/skipped; overlaps full legacy.            |
| Expanded focused R5 unit rerun   | 9 passed, 0 failed/skipped; overlaps full AI/unit.           |
| Lint/typecheck                   | Passed.                                                      |
| Production build                 | Passed using supported webpack mode, with Discovery enabled. |
| Focused Prettier                 | Passed.                                                      |
| Repository-wide formatting       | Four unchanged baseline failures, listed below.              |
| Whitespace checks                | Passed for the applied patch and new tests/report.           |

Unique totals: 176 AI/unit + 107 browser = 283 distinct test cases executed and passed.
The browser configs list 109 entries because the two feature-flag cases appear in both suites. Each opposite-mode entry is skipped once and actually passes in its intended mode. There are no unexecuted unique cases in those two full suites.
Overlapping reruns are not counted as additional unique tests.
The optional walkthrough and all three local document imports were enabled, not skipped.

Reproduction history, not hidden rerun results:

- New unit baseline: 2 passed / 7 failed. Corrected implementation: 9 passed.
- Initial new browser run: 0 passed / 4 failed. Three were test-selector mistakes; one was the stale-export application defect.
- Next run: 1 passed / 3 failed. Two were PDF comparison harness issues (page furniture/zero-width formatting); one was the missing-snapshot recovery application defect.
- Added print test run: 2 passed / 3 failed. One reproduced print navigation visibility; two exposed the PDF heading character-spacing comparison.
- Following run: 2 passed / 3 failed. Remaining failures were print ligature text-item spacing and two test flows that selected a campaign but omitted Build Input Pack.
- Corrected harness/full suite: all five R5 browser tests passed.
- Expanded inclusion/mobile run: 1 passed / 1 failed. Movers reproduced the measured header overlap; Pro passed.
- Final corrected run: all five R5 + five Working Space tests passed.
  No unresolved test flakiness was observed; passing reruns followed identified code or harness corrections. Existing assertions were not weakened.

PDF artifact inspection:

- Actual downloads and print output were parsed locally with PDF.js.
- Word ZIP/XML, full section content, campaign, approval timestamp, source versions and selected material were checked.
- Nine-page Movers PDF, six-page Pro PDF and ten-page print output were rendered locally and visually reviewed; no clipping/overlap was found in those artifacts. Changed support-content pages were re-rendered/rechecked.
- Installed PDF.js/native canvas supplied the local renderer; no external renderer/service was introduced.
- At the initial verification, full DOCX visual QA was BLOCKED: `soffice` was not on PATH and the conventional LibreOffice application path was absent. Microsoft Word was not opened/automated in that initial pass. The subsequent authorized Word attempt is documented in section 9.
- No slide export was built or claimed.

Untouched repository formatting failures:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

## 5. Prior-requirement regression confirmation

Actually executed:

- R1: input-pack AI tests, real extraction/fixtures, actual PDF campaign browser flow, document uploads (including local Black Friday PPTX/DOCX and template PDF), preparation/version/Spark tests.
- R2: all requirement2 AI/context/state/quality/evidence tests and real-fixture/roundtable/browser visual tests.
- R3: request/turn/memory tests, primary-card conversations, follow-up/retry/stale-comparison and campaign conversation browser tests.
- R4: all seven focused unit tests and all five Working Space browser tests; the browser suite was additionally rerun after final R5-only styling.
- Legacy: entire supported flag-off browser suite, plus the final export/layout rerun.

Shared changes are additive snapshot/provenance fields or a verified export cancellation/recovery correction.
Other-stage UI/prompt/orchestration was not redesigned or repurposed.

## 6. Security confirmation

- Offline guard remained active: XC_OFFLINE_TEST=1; mock mode; empty API key; telemetry disabled.
- Existing guard tests freshly passed, including rejection of real SDK execution and unregistered clients.
- “Live transport” unit tests use registered in-memory offline clients, not paid requests.
- Browser external host access was blocked by repository DNS rules; new R5 routes additionally abort external HTTP(S). Known static font attempts are aborted as well.
- No live AI, external research, enterprise connector, deployment, credential/environment change, localhost:3000 use/restart, commit or push.
- Application AI API cost: $0.
- Isolated Playwright instances exited; no intentional test server was left running.
- Original modified/added/untracked work was retained; final file-hash comparison limits changes to the seven listed existing files and three additions.

## 7. Final assessment

14 PASS / 0 FAIL / 1 BLOCKED / 0 UNVERIFIED.

R5 is NOT claimed 100% verified. Packaging, approval, context fidelity, selections, persistence, failure/retry, PDF/Word content and browser regressions pass offline. Full Word layout review remains blocked by the native rendering failure documented in section 9.

Live-model quality is LIVE VERIFICATION PENDING (not authorized).
Enterprise sources remain disconnected: Tableau, iSpot, ACE, Datorama, Brand Hub and Product / Audience Research. No integration readiness is implied by prototype completion.

## 8. Next action

Complete the controlled manual Word layout review in section 9, or resolve the installed Word automation failure without introducing a new service/dependency. Inspect every page of both campaign exports before closing R5-12.
Do not start full end-to-end certification, live AI work, integration work or another requirement without explicit approval.

## 9. R5-12 targeted follow-up — October 17, 2026

Scope: only the remaining DOCX visual verification blocker. No application, exporter, UI, test assertion, environment file or credential was changed. Branch remains `insight-discovery-poc`; no commit, push or deployment.

### Fresh isolated verification

Isolated copy: `/private/tmp/xc-r512-docx.St3Q8J`; temporary application port: `3241`. The copy excluded `.env*`, `.git`, `.next`, dependencies and previous test results, and reused installed repository dependencies. The existing development instance at localhost:3000 was not contacted or restarted.

Commands, run in that isolated copy:

```sh
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/offline-guard.spec.ts --output=test-results-offline-guard

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3241 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-final-brief.spec.ts --grep 'R5 real PDF' --output=test-results-r512
```

- Offline guard: **3 passed, 0 failed, 0 skipped**.
- Existing actual-PDF campaign export scenarios: **2 passed, 0 failed, 0 skipped** (33.4 seconds).
- These scenarios compare every generated structured section and campaign against DOCX ZIP/XML content, check approved human text and selected support, and verify prior-version exports. These are content checks, not visual rendering proof.
- Server mock mode is asserted by the browser tests. Existing provider guard blocks real SDK execution before client construction; external browser traffic is aborted and non-loopback host resolution is blocked. No paid/live AI or research requests were made; application AI cost was $0.
- No full end-to-end or unrelated requirement suite was started. The temporary Playwright server exited; no listener remained on port 3241.

### Renderer outcome

Microsoft Word **16.114** is installed at `/Applications/Microsoft Word.app`; its native scripting dictionary advertises PDF Save As. LibreOffice/soffice and Poppler were unavailable. No dependencies were installed and no external conversion service was used.

The generated test DOCX copies contain no external relationships. They were made filesystem read-only before the final Word attempt, and their SHA-256 values remained unchanged afterward. Word opened only the specified test file; its full path was checked before export. Native `save as ... file format format PDF` timed out after a 45-second AppleEvent timeout: **-1712, “AppleEvent timed out.”** No usable Word-rendered PDF was produced.

The native scripting interface also rejected closing the exact test document and its own window with **-1708, “doesn't understand the close message.”** One named-file opening attempt did not resolve to the intended document. The Word document count increased from 1 before testing to 3 afterward; temporary test windows may need manual closing without saving. No unrelated document was closed, edited or saved. Broad metadata enumeration was rejected by the tool safety reviewer and was not bypassed.

The precise verified blocker is Word's native automated PDF-export timeout, not the absence of Word, a proven DOCX layout defect, or a proven licensing issue. The reason for Word's unresponsive/unsupported scripting operations could not be established safely. Manual operation of installed Word is required to determine whether an application permission/dialog or another local Word condition needs attention.

### Actual files for manual review

| Campaign    | Exact generated DOCX copy                                           | SHA-256                                                            | Word-rendered pages reviewed |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| Movers      | `/private/tmp/xc-r512-docx.St3Q8J/artifacts/R5-12-Movers.docx`      | `20660d3a2167f62f3903e1bbce76ef45cde542b77445823ef37456483823fad8` | 0 — BLOCKED                  |
| Xfinity Pro | `/private/tmp/xc-r512-docx.St3Q8J/artifacts/R5-12-Xfinity-Pro.docx` | `7ff8ffe008649942d7ecb952fc703470cfaabf1d32060417795fcbdf2bc4221a` | 0 — BLOCKED                  |

These are unchanged copies of `approved-0.docx` and `approved-1.docx` from the fresh existing browser scenarios, not reconstructed documents. They are deterministic mock-agent test exports from the actual client PDF, not live-model outputs. The prior/restored DOCX exports also passed the existing structured-content checks. No visual review of any DOCX page is claimed.

### Short manual visual-review checklist

Open each exact file above in Microsoft Word, use Print Layout, and inspect **every page**, recording the page count and any defect by page number. Use the existing generated document as-is; do not edit the approved text to make it fit.

1. Verify the correct campaign title: Movers - Campaign Extensions Refresh Brief / Xfinity Pro - Campaign Extensions. The approved BRIEF callout must show exactly `Kevin R5 / 0: approved human line — no rewriting.` / `Kevin R5 / 1: approved human line — no rewriting.` respectively. These are deliberately distinctive test-approved human lines, not production strategy recommendations.
2. Check all 26 section headings in order, with none missing or duplicated: Context; Objective; Audience; Insight / Opportunity; Job to be done; Proof / RTB; Selected research · AI synthesis; Selected Sparks; Thought-starters; Deliverables; Mandatories; Timelines; Problem; Strategic direction; Additional brief instructions; Working hypothesis — unvalidated; Open questions; Human / Consumer Tension; Audience — whole-brief context; Original upstream RTB; Original upstream JTBD; Proposed XC adaptation — not upstream-approved; Original IMC context; Source availability; Saved discoveries — worth considering, not verification; Approval Notes. Also check the separate approved BRIEF callout and group heading.
3. Confirm the selected preparation adaptation remains separate from Original upstream RTB and the human Proof / RTB field. Movers adaptation begins `Proposed XC framing: connect the supplied RTB to the needs of Existing customers & prospects who are moving. Both GM and multicultural audiences.` Pro adaptation begins `Proposed XC framing: connect the supplied RTB to the needs of Existing HSD Customers, Premium and Tech Enthusiast consumers, with an emphasis upon work-from-home, streaming, and gaming audiences.` Original JTBD absence, unknown RTB approval, mock labels and unavailable external sources must remain explicit.
4. Inspect source attribution, exact excerpts/locators and selected source/version references throughout the main document and source-context sections. Check the human execution text `2 display assets; 300x250 desktop, 320x50 mobile; copy <=20 words; no new claims.` Private notes (`PRIVATE-R5`) must not appear. Structured-content checks for these already passed; confirm the text remains visible in the Word layout.
5. Check the approved-line table, long paragraphs, headings, page headers/footers and page numbers on every page. Reject clipped/overlapping text, unreadable tables, inappropriate blank pages, lost/duplicated sections or headings orphaned from their content. Record whether page breaks and overall layout are reasonable. Close only these test documents without saving afterward.

If manual Word rendering succeeds, export locally to PDF, inspect all resulting pages and compare the rendered content with the already-validated DOCX/structured sections. Record actual reviewer, page counts, defects and results before changing acceptance status.

### Targeted result

**R5-12 remains BLOCKED. Overall Requirement 5 remains 14 PASS / 0 FAIL / 1 BLOCKED / 0 UNVERIFIED.** No visual defect was verified because no DOCX page could be rendered for inspection. There is no claim of 15/15, 100% visual completion or live-model validation. Stop after R5-12.
