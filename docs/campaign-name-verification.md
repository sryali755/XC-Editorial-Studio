# Campaign identity — targeted offline verification

Repository: XC Editorial studio. Branch: `insight-discovery-poc`.
Base worktree HEAD: `9c8134a`. Existing modified and untracked work was preserved.
Scope: campaign-name identification, explicit confirmation, propagation and preservation only.

## Root cause and actual source evidence

The actual authorized `BLK_FRI.pptx` reproduced the missing-name problem. Its 14 slides were imported using the application's existing local PowerPoint text extractor. The old parser recognized explicit campaign fields and campaign-extension titles, but did not have a separate cover-title candidate. The deck has no labeled Campaign field, so its original campaign field was correctly `Not supplied`, while useful title evidence was lost at the display boundary. The existing missing-name-only input offered neither that candidate nor its source attribution. Naming metadata also shared the research-content version basis, making display corrections liable to stale otherwise unchanged context.

Exact imported evidence:

```text
Source: BLK_FRI.pptx

## Source slide 1
Black Friday
Toolkit
September 2025
```

Later slides repeat `Black Friday toolkit`. Slide 3 separately identifies `Creative Platform` and `“The Smart Switch”`. Neither that platform nor the product Xfinity Mobile is an official campaign-name field. The filename remains a filename. Slide 13's toolkit project/timeline identifier is not the application's internal campaign ID.

The suggested display name is **Black Friday Toolkit**, grounded in the exact two-line slide-1 excerpt at `imc:slide:1`. Because this is a cover title rather than an explicit campaign field, a human must confirm it. Original imported text and original extraction status are not rewritten to pretend that the source supplied a formal name.

## Before and after

| Concept                        | Before                                                                                | After                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Original parsed Campaign field | Not supplied                                                                          | Still Not supplied: source truth preserved                                      |
| Source candidate               | None                                                                                  | Black Friday Toolkit; exact `Black Friday\nToolkit` excerpt; `imc:slide:1`      |
| Source document title          | Not surfaced separately                                                               | Black Friday Toolkit                                                            |
| Source file                    | Present only in imported text                                                         | BLK_FRI.pptx, explicitly separate from the name                                 |
| Current campaign display name  | Empty / Campaign not supplied                                                         | Human-confirmed Black Friday Toolkit                                            |
| Creative platform              | Must not become campaign identity                                                     | The Smart Switch remains separate                                               |
| Internal ID                    | No explicit display-independent naming contract                                       | Deterministic local ID based on exact selected source                           |
| Later display correction       | Not supported for source-named campaigns; metadata could invalidate research versions | Same source ID, research version and work retained; correction history recorded |

Screenshots captured from the isolated mock browser, not localhost:3000:

- [Before: Input Pack](campaign-name-verification/before-black-friday-input-pack.png)
- [Before: Discovery missing name](campaign-name-verification/before-black-friday-discovery.png)
- [After: Campaign Identity](campaign-name-verification/after-black-friday-campaign-identity.png)
- [After: Input Pack](campaign-name-verification/after-tab1-input-pack.png)
- [After: Discovery and Working Space](campaign-name-verification/after-tab2-discovery-working-space.png)
- [After: Finalize Strategy](campaign-name-verification/after-tab3-finalize-strategy.png)
- [After: XC Brief](campaign-name-verification/after-tab4-xc-brief.png)

## Implementation and preservation boundaries

`resolveCampaignIdentity` is the single naming resolver. It retains an explicit source name exactly, or offers a conservative attributed cover-title candidate without promoting it. Filename-only, product-only, platform-only, objective prose, generic template titles, placeholder names and conflicting multiple names do not become official campaign names. Partial JSON input cannot crash the preview; the existing Build parser still reports malformed source input.

Tab 1 now always shows **Campaign Identity**: detected candidate, editable name, document title/file, source locator, original excerpt, confirmation status and **Confirm campaign name**. Explicit source names are described as confirmed against source, not human-approved. Ambiguous or absent names require human confirmation. Multi-campaign documents require an explicit campaign selection before confirmation/build. Existing exploration remains possible while unresolved; approval/packaging cannot silently treat that identity as confirmed.

The same identity reaches the global header in all four tabs, Input Pack summary/expanded context, the five submitted agent foundations, Working Space, new finding/run source snapshots, approval snapshot, brief preview and exports. The four tabs remain **Input Pack → Insight Discovery → Finalize Strategy → XC Brief**.

The internal ID is a stable **local source-grouping key**, not an enterprise campaign number, globally unique database ID or security credential. Changing source content/campaign selection changes source identity; changing only display metadata does not. Validation still reconstructs metadata from the complete selected source. It does not rely on the short hash alone.

Display corrections preserve prep outputs/history, selected adaptation/research/Sparks, conversations, findings, saved finding IDs, human fields, Suggested V0 and field versions. Research-content versions exclude display-name corrections while retaining source content and selections. Original source names and candidate attribution remain independently validated; forged names, locators, excerpts, IDs and cross-campaign context are rejected. Actual campaign changes still use existing isolated archives and stale-response guards.

Earlier findings, approvals and briefs remain frozen under their recorded names and source snapshots. They are not rewritten after a rename. The current identity header updates; an older saved brief shows an explicit original-name notice. Packaging a new brief under the corrected name requires explicit strategy reconfirmation. That clears only the current approval receipt, not prior approvals/history. This is intentional approval integrity, not lost work.

An older source-named snapshot retains its historical research-version basis. A legacy manually named, originally unnamed session created before this identity contract may retain its old historical version rather than being silently relabeled. No records are deleted or rewritten. New confirmations and subsequent display corrections are covered by the new preservation tests.

## Exact code and test files changed in this task

These are changes relative to the initial dirty worktree, not the entire accumulated branch diff. Some pre-existing files were already untracked; they were extended, not replaced wholesale.

| File                                                     | Targeted change                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/campaign-display.ts`                                | Retain existing display utilities; add the shared usable-name predicate without a circular dependency.                                        |
| `lib/campaign-naming.ts` (new)                           | Source ID, candidate/locator extraction, confirmation resolution, metadata validation and display label.                                      |
| `lib/campaign-identity.ts`                               | Validate complete new identity before approval/packaging; retain legacy compatibility and human-field protection.                             |
| `lib/types.ts`                                           | Additive identity metadata and optional frozen brief identity.                                                                                |
| `lib/discovery-studio.ts`                                | Resolve authoritative display identity, preserve rename history/campaign archives, permit metadata-only correction, freeze/export provenance. |
| `lib/discovery-context.ts`                               | Keep display metadata separate from research-content versioning.                                                                              |
| `lib/ai/schemas.ts`                                      | Accept optional, validated identity fields without changing agent outputs.                                                                    |
| `lib/ai/discovery-submission.ts`                         | Validate metadata against source and retain source-based, not name-based, campaign isolation.                                                 |
| `lib/studio-brief-input.ts`                              | Carry the approved identity snapshot into existing brief packaging.                                                                           |
| `components/CampaignIdentityPanel.tsx` (new)             | Visible attributed confirmation panel.                                                                                                        |
| `components/DiscoveryInputPack.tsx`                      | Panel wiring, controlled metadata draft and authoritative summary label.                                                                      |
| `components/DiscoveryRoundTableV2.tsx`                   | Authoritative Dynamic Pack and Working Space naming.                                                                                          |
| `components/InsightDiscoveryStudio.tsx`                  | Shared header, metadata-aware approval receipt, prior-brief name notice.                                                                      |
| `app/studio-wireframe.css`                               | Scoped panel layout, long-text containment and narrow-screen metadata grid.                                                                   |
| `tests/fixtures/black-friday-campaign-identity.ts` (new) | Exact source-excerpt fixture; full actual PPTX independently exercised in browser.                                                            |
| `tests/ai/campaign-name-contract.spec.ts` (new)          | 18 contract, preservation, source-fidelity and negative cases.                                                                                |
| `tests/strategy-studio-campaign-name.spec.ts` (new)      | 3 real-upload/missing-name/multi-campaign browser cases, four-tab flow, rename, exports and reload.                                           |
| `tests/requirement3-primary-ui.spec.ts`                  | Synchronize one existing request assertion with the actual clicked Discovery action; no assertions removed.                                   |

This report and the linked screenshot/export/page-render artifacts are also new. No dependency, model, reasoning effort, credentials, environment file, export format or other stage workflow was changed.

## Offline verification and commands

All application tests/builds used this environment explicitly:

```sh
AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1
```

Isolated copies excluded `.git`, `.env*`, Next output, test reports and dependencies, and reused only installed dependencies. The actual repository's live environment was inspected only for sanitized mode/key-presence checks. It was not modified, and its live server was never used.

Locations:

- Baseline reproduction: `/private/tmp/xc-campaign-baseline.JdP9OP`, port 3303.
- Implementation/Discovery: `/private/tmp/xc-campaign-identity.HigS3x`, port 3304.
- Legacy/build: `/private/tmp/xc-campaign-legacy.BRt4WK`, port 3305.

Commands below are relative to those copies; each application command also receives the environment above:

```sh
# Original Black Friday missing-name reproduction in the untouched baseline copy
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3303 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/strategy-studio-campaign-identity-before.spec.ts --output=test-results-campaign-before

# Full AI/unit suite
NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-campaign-identity-ai-final

# Affected primary UI plus all three new campaign-name browser cases
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3304 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/requirement3-primary-ui.spec.ts tests/strategy-studio-campaign-name.spec.ts --output=test-results-campaign-identity-causal-request

# Full Discovery, real local document imports and opt-in screenshot walkthrough
NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery XC_CAPTURE_SCREENSHOTS=1 XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3304 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-campaign-identity-discovery-final

# Full legacy browser suite in its separate copy
NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3305 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-campaign-identity-legacy

npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack
./node_modules/.bin/prettier --check app/studio-wireframe.css components/CampaignIdentityPanel.tsx components/DiscoveryInputPack.tsx components/DiscoveryRoundTableV2.tsx components/InsightDiscoveryStudio.tsx lib/campaign-display.ts lib/campaign-identity.ts lib/campaign-naming.ts lib/types.ts lib/discovery-studio.ts lib/ai/schemas.ts lib/discovery-context.ts lib/ai/discovery-submission.ts lib/studio-brief-input.ts tests/fixtures/black-friday-campaign-identity.ts tests/ai/campaign-name-contract.spec.ts tests/strategy-studio-campaign-name.spec.ts tests/requirement3-primary-ui.spec.ts docs/campaign-name-verification.md
./node_modules/.bin/prettier --check app components lib tests *.ts *.mjs *.json
```

| Check                                        | Actual result                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Original Black Friday reproduction           | 1 passed: verified the pre-fix missing display name from the actual deck. |
| Full AI/unit suite, including R1–R5          | 254 passed; no failures/skips. Includes all 18 new naming tests.          |
| Affected primary UI plus new browser cases   | 12 passed; no failures/skips.                                             |
| Final full Discovery browser suite           | 88 passed; 1 expected opposite-mode skip; no failures.                    |
| Full legacy browser suite                    | 41 passed; 1 expected opposite-mode skip; no failures.                    |
| TypeScript, ESLint, production webpack build | Passed.                                                                   |
| Focused source/test formatting               | Passed; report formatting verified separately before handoff.             |
| Repository-wide formatting                   | Four unchanged baseline failures, listed below.                           |
| PDF campaign identity/content                | Passed; all five pages rendered and visually inspected locally.           |
| DOCX campaign identity/content/metadata      | Passed structured checks; full Word visual rendering remains unverified.  |

Unique passing acceptance/regression cases: **254 AI/unit + 129 browser = 383**. The two browser skips are opposite-feature-mode entries, each of which passed in its intended mode. All three optional local document imports and the screenshot walkthrough ran. Overlapping focused reruns and baseline diagnostics are not added to that unique total.

After applying the narrow patch, all 19 source/test/report files were compared byte-for-byte with the tested copy. The new 18-case contract suite was then rerun from the actual repository and passed again, without starting an application server:

```sh
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/campaign-name-contract.spec.ts --output=/private/tmp/xc-campaign-identity.HigS3x/test-results-applied-campaign-contract
```

The first full Discovery attempt reported 86 passed, 2 skipped, 1 failed. Its existing research-action test sampled `calls.at(-1)` immediately after clicking; a pending preparation `research` request was sometimes the last captured request before the requested Discovery fetch arrived. Three repeats on the untouched baseline all passed; that does not establish an application regression. The captured failure and immediate-read assertion identify a request-capture synchronization race. The test now registers a causal request wait before the click and checks that exact Consumer/find-contrary request with every original content/source assertion retained. Both the 12-test rerun and final full Discovery rerun passed. No application workaround was added.

During new-test development, an incorrect preview selector and a PDF.js cleanup API assumption caused test-harness failures; both were corrected without changing app behavior. A preliminary attempt to run the browser-only document importer in the AI suite hit its CJS/import.meta environment boundary; actual extraction was instead exercised through the repository-supported browser import flow. None of these results is represented as an application pass.

Repository-wide Prettier still flags these four pre-existing unrelated files; none was reformatted:

- `lib/ai/perspective-quality.ts`
- `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`
- `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`
- `tmp-dump.mjs`

## Campaign and preservation results

- Actual Black Friday: 14-slide upload; attributed unresolved candidate; explicit confirmation; same confirmed title in all four tabs, Dynamic Pack, drawer, all five requests and approval snapshot.
- Display rename tested as `Black Friday Toolkit — Retail Review`: same source ID, content version, source text, preparation history, RTB selection, research selection, Spark selection, saved findings, research runs, human line and field versions. Earlier approvals and briefs remain byte-for-byte equal in the test assertions. No AI action was triggered by naming, navigation, approval, packaging or export.
- Actual composite client PDF: explicit no-default campaign choice; exact source names `Movers - Campaign Extensions Refresh Brief` and `Xfinity Pro - Campaign Extensions`; name corrections stay in their selected campaign; returning restores the prior correction. Existing real-PDF handoff, stale-response, archive and final-brief regressions also run.
- Missing-name case: filename is not promoted; human entry and confirmation persist across reload; 390px page has no horizontal overflow and confirmation remains reachable.
- Negative checks reject forged candidate excerpts/locators, source names, status, IDs, source document title/reference, display-name mismatch and foreign campaign context.
- Offline Black Friday browser flow invokes exactly 8 mock agent actions: 3 preparation plus 5 Discovery. Confirmation and rename do not incur model calls.

## Export verification and limitations

Generated through the existing XC Brief export controls after an explicit **test UI** approval. These are **offline demo artifacts**, not approved client work:

- [PDF: Black Friday Toolkit — Retail Review](campaign-name-verification/offline-demo-exports/Xfinity-Creative-Brief-Black-Friday-Toolkit-Retail-Review.pdf)
- [DOCX: Black Friday Toolkit — Retail Review](campaign-name-verification/offline-demo-exports/Xfinity-Creative-Brief-Black-Friday-Toolkit-Retail-Review.docx)

All five visually reviewed PDF page renders are retained in `docs/campaign-name-verification/pdf-pages/` (`page-1.png` through `page-5.png`).

The browser test reads every PDF page and DOCX XML, validates the exact corrected name, exact test-authored human line, `BLK_FRI.pptx`, `imc:slide:1`, PDF title, Word core metadata and download filenames. It also confirms the old brief retains its old title until the corrected snapshot is explicitly reconfirmed and packaged.

The PDF and document skills guided artifact verification without changing the established export design. The PDF's five pages were rendered with the already-installed PDF.js/native canvas stack and all inspected: campaign heading/provenance readable, no naming-text clipping or overlap. DOCX contents and metadata passed, but there is no supported installed headless Word renderer. Microsoft Word is installed; the existing R5 report records its prior conversion timeout. No new conversion dependency/service was installed and no user Word session was disturbed. Full Word visual QA is **UNVERIFIED**, not PASS. For manual review, open the generated demo DOCX and inspect every page for title, exact human line, source appendix, headings, page breaks, clipping/overlap and duplication against the PDF.

This targeted change does **not** certify all Black Friday field extraction or final-brief prose quality. The existing numbered objective/Strategic Insight boundary and resulting repeated problem/objective text are unchanged; several non-naming source fields remain unextracted in this deck layout. Source-only/preparation snapshots may still honestly show an original Campaign field as `Not supplied`: confirming display metadata must not falsify source extraction. Old preparation findings and selected research are not silently rewritten. Generic mock insights are not live-model quality evidence. Live AI and disconnected enterprise services remain untested.

## Safety and handoff

The existing server-side `XC_OFFLINE_TEST=1` guard rejects real OpenAI client creation before transport. Provider injection accepts only the existing marked deterministic offline client in mock mode. Browser config forces mock mode, an empty API key, no reuse of existing servers, loopback-only isolated ports, disabled telemetry and external DNS blocking; the new campaign tests additionally abort non-loopback requests and assert the mock status endpoint. Existing offline guard tests are included in the passing AI suite. No safeguard was weakened.

No localhost:3000 access/restart/stop, paid AI calls, enterprise retrieval, external conversion services, credential modifications, dependency installation, git commits/pushes or deployment occurred. Application AI usage for this work: **$0**. Existing application environment files remain unchanged. Testing copies and generated artifacts are local only. Stop after this campaign-identity change; no unrelated implementation was started.
