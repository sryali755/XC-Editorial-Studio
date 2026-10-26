# Campaign pipeline reliability

## Architecture audit, recorded before production changes (2026-10-23)

| Stage               | Existing implementation                                                                                                                         | Audit finding                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload              | `DocumentFileImport.read`, `document-import.extractDocument`                                                                                    | Browser-local extraction; uploaded text includes filename/import notes. No model call is needed.                                                                                                                                                   |
| DOCX/PPTX           | `document-import.word`, `powerPoint`, XML paragraphs/table cells                                                                                | Preserves original Unicode and reconstructs table labels; embedded pictures/charts are not interpreted.                                                                                                                                            |
| PDF                 | `document-import.pdf`                                                                                                                           | Local PDF.js text and page markers; layout/reading order can differ from the document. No OCR.                                                                                                                                                     |
| Campaign extraction | `imc-parser.parseIMCBrief`, `upstream.getParsedIMC/getUpstream`, `studio-imc-records.extractStudioIMCRecords`, `imc-campaign-scope`             | Separate heading maps disagree. Canonical parsing misses composite proof headings while display records recognize them. Unknown sections can be omitted or absorbed into a preceding field.                                                        |
| Source catalog      | `discovery-sources.imcSourceSpans/suppliedDiscoverySourceProvider`                                                                              | Source names and physical line/page locators exist, but content-stable document/passage IDs do not. Some multi-section source fields have no single contiguous source span.                                                                        |
| Input/preparation   | `preparation.compileInputPack/preparationService`, `campaign-rebuild.stageCampaignRebuild`                                                      | Source snapshot, original fields and selected versions are retained. All three replacement agents are staged and committed atomically.                                                                                                             |
| Dynamic Input Pack  | `discovery-studio.studioPack`, `DynamicInputPackDetails`                                                                                        | UI displays selected composition. Original JTBD, RTB and proposed adaptations are separate. Seven visible fields must remain unchanged.                                                                                                            |
| Model context       | `ai/context.selectedFoundation`, `discovery-context.discoveryFoundation`, `ai/prompts.buildAgentPrompt`, `ai/discovery-prompts.discoveryPrompt` | All five roles receive source/selected context, but there is no shared typed campaign/registry contract. The catalog gives names/locators without copyable passage text.                                                                           |
| Validation          | `ai/discovery-submission.foundationIssue`, `ai/discovery-evidence.validateDiscoveryEvidence`, `discovery-sources.locatedDiscoveryCitation`      | Strong source/campaign checks exist. Quote matching uses raw substring comparison; ordinary vs non-breaking spaces or Word punctuation can produce false negatives. Error messages identify a finding but not consistently the exact failed field. |
| Failure boundary    | `ai/provider.generateAgentResponse` Discovery branch                                                                                            | One invalid finding rejects the whole batch after one corrective generation. Rejected content is not persisted as valid findings. Existing successful versions are retained.                                                                       |
| Role quality        | `discovery-lens-quality.crossLensIssue`                                                                                                         | Checks duplicates/peer overlap, but can accept an analogous-case gap under Consumer. Roles and personalities must remain unchanged.                                                                                                                |
| Saving              | `discovery-state`, `discovery-persistence`, `discovery-connections`                                                                             | Versioned source snapshots and finding IDs are preserved; storage and stale-response protections must remain intact.                                                                                                                               |
| Finalize Strategy   | `workspace-canvas-prefill`, `workspace-suggestions`, `discovery-handoff.approveDiscoveryCanvas`, `studio-brief-input.buildStudioBriefInput`     | Human edits/approval snapshots and selected finding references are preserved. Source suggestions must never silently become human authorship or approval.                                                                                          |

### Reproduced causes

- The actual Gateway IMC uses a plural RTB heading; the separate creative reference uses a composite proof heading. These are generalized label-classification gaps, not campaign-specific facts.
- The creative reference has non-breaking spaces in proof text. Changing only those to ordinary spaces reproduces the exact citation error. Using its true document title instead of the registered source name also fails.
- Consumer can accept an analogous-case research gap because successful schema/evidence validation does not establish role relevance.
- Controlled offline model fixtures do not establish live model reliability. No paid model calls are authorized for this implementation.

### Implementation boundaries

Use shared constrained classification, a typed campaign view, registered document/passage IDs, and reversible formatting normalization that resolves to original source text. Preserve exact source provenance and reject invented claims, wrong-document/page attribution, ambiguous matches and generated text cited as source evidence. Keep the seven-field Input Pack, all five roles, saved human work, approvals and transaction safety. No Team Round Table or external integration work.

The IMC document is the Gateway workflow input. The completed creative brief is a separate reference artifact and must never be merged into that input's evidence.

## Implementation and verification

Completed on `insight-discovery-poc`, 2026-10-23. The audit above was recorded before the implementation. Existing plural-RTB/JTBD corrections and unrelated local changes were preserved; they are not all new changes attributable to this task. No production logic contains Gateway/Helix facts, filenames or source IDs.

### Generalized changes

1. `campaign-field-classifier` supplies a shared alias/concept classifier for canonical parsing and the existing display-record parser. It recognizes heading variations and two-column field/value tables. Short, nominal labels can be classified by explicit concepts; prose containing words such as “product proof” is not automatically a heading. Multi-purpose labels such as “Proof and metrics” remain reviewable rather than arbitrarily becoming RTBs or leaking into the previous objective, in both plain text and tables. Parser version 7 causes old parser caches to be re-extracted through the existing preservation path, not by deleting drafts.
2. `canonical-campaign` derives a typed, versioned view of campaign name, background, separate business/communication objectives, audiences/segments, JTBD, RTBs, insights, barriers, research, creative considerations, key messages, CTA, deliverables, constraints, KPIs, timing, products and channels. Fields have explicit `supplied`, `not_supplied`, `needs_review` or `intentionally_excluded` states. Source values, human edits and unapproved AI suggestions remain separate. The seven visible Input Pack fields and four-tab UI were not redesigned.
3. `source-registry` registers document and passage IDs, original text, readable locators and aliases. Document identity does not depend on the uploaded filename; passage identity does not depend only on physical line numbers. Import metadata is skipped by its explicit label, not a fixed number of lines, so optional missing import notes do not swallow the first campaign field. IDs are deterministic content identifiers, **not authentication or proof of independent truth**. PDF pages and PPTX slides keep their physical locators; text/DOCX paragraphs use line spans as a readable fallback alongside stable IDs.
4. All three preparation prompts and all five Discovery roles receive the canonical context. Discovery also receives the actual registered passage text and document/passage IDs. Models use these existing `source` and `locator` string fields; they no longer need to invent citation labels. Legacy readable references still validate. The canonical source view is checked against source text, while current human metadata and attachment references are recomputed before prompting, not trusted from a stale cached suggestion.
5. Excerpt matching preserves case, words, qualifications and attribution. It permits whitespace/NBSP, soft-hyphen/zero-width-space and curly/straight quote formatting differences, then returns the **original** source substring with an auditable match method. It does not fuzzy-match paraphrases, swap documents/pages, combine passages or remove meaningful joiner characters. Ambiguous document attribution, fabricated quotations/statistics, generated proposals cited as evidence and disconnected-source claims remain rejected. Sparks and saved-finding comparison use the same original-source matching rules.
6. Discovery keeps the existing single corrective generation limit. If a batch still contains invalid findings, only individually validated, role-relevant, non-duplicated findings from the actual model responses are retained. Invalid findings are withheld with field paths and reasons in `validationIssues` and the saved retrieval note. No application-authored replacement finding or invented research gap is inserted. If none is valid, the run still fails actionably; earlier successful versions/selections remain intact.
7. A narrow role guard rejects an analogous-case gap passed off as a Consumer/Culture/Category/Brand finding. The five existing role instructions and personalities are unchanged. Evidence-supported findings, explicitly tentative interpretations and honest research gaps remain valid outputs.
8. A document with no identifiable usable campaign context stops before generation and asks for review. Original extracted text is retained. There is no silent promotion of a filename, missing value or AI suggestion into an authoritative campaign fact or human approval.

### Actual tests and results

| Verification                                                                                                                       | Result                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Full AI/unit/integration regression suite, including R1–R5, source isolation, retries, stale responses, human drafts and approvals | **380 passed, 0 failed, 0 skipped**         |
| Phase 1 component/transaction suite plus offline transport guard checks                                                            | **26 passed, 0 failed, 0 skipped**          |
| Isolated system-Chrome browser pipeline                                                                                            | **7 passed, 0 failed, 0 skipped**           |
| TypeScript, no emit / no incremental file writes                                                                                   | PASS                                        |
| Repository-wide ESLint                                                                                                             | PASS                                        |
| Isolated production webpack build, including TypeScript/static-page generation                                                     | PASS                                        |
| `git diff --check`                                                                                                                 | PASS                                        |
| Formatting of task-touched files                                                                                                   | PASS                                        |
| Repository-wide Prettier                                                                                                           | Existing unrelated issues remain; see below |

**413 automated tests passed in the three final suites.** The 27-test new pipeline contract suite is included in the 380 total, not counted twice. Its seven independent campaign fixtures each exercise all five agent contracts (35 role/campaign combinations). They cover renamed headings, missing fields, two-column tables, NBSP, PDF wrapping, multiple audiences/RTBs and ambiguous information. A separate unusable-document test verifies a pre-generation stop. Negative checks cover wrong document/page, ambiguous attribution, fabricated passages/quotations, stale derived suggestions, source-only vs human metadata, partial response retention, total failure and persistence/Finalize handoff.

The browser tests perform real browser-local DOCX/table/NBSP/PDF/PPTX extraction. The actual `Gateway IMC Brief KM.docx` is used as input. The actual `Gateway CB Helix Test.docx` is extracted in a **separate disposable test context** as reference only; its extra battery-backup proof never enters the IMC context. The IMC test verifies four RTBs; the separate reference verifies its own five RTBs.

The complete browser workflow uploads the actual IMC, explicitly confirms its suggested document title as display metadata, accepts the existing rebuild warning, builds all three preparation agents, selects framing/a Spark, runs all five Discovery agents, saves one finding from each, navigates to Finalize Strategy, verifies the new Brief Line is empty, enters an exact human test line, saves it, and explicitly confirms that strategy. It asserts exactly three preparation and five Discovery POSTs, their campaign source, and exclusion of reference-only claims. These POSTs reach **only the isolated mock server**, not an AI provider.

Browser screenshot inspected after the successful workflow:

`/private/tmp/xc-pipeline-browser-verified/document-pipeline-reliabil-d7c38-uman-owned-Finalize-handoff/gateway-offline-finalize.png`

### Commands and isolation

Working repository: `/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio`.

The disposable application copy is `/private/tmp/xc-pipeline-app.tv96wt`; it contains app/components/lib/configuration and a symlink to already-installed dependencies, **not application `.env` files or credentials**. Browser tests launch/stop their own port **3217** process. `localhost:3000` was not accessed, stopped or restarted.

Final test commands (run from the XC repository):

```sh
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
NODE_OPTIONS='--conditions=react-server --require ./tests/helpers/phase1-no-api.cjs' \
XC_GATEWAY_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' \
XC_GATEWAY_IMC_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' \
XC_GATEWAY_REFERENCE_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway CB Helix Test.docx' \
./node_modules/.bin/playwright test -c playwright.ai.config.ts --reporter=dot --output=/private/tmp/xc-pipeline-all-ai-verified

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' \
./node_modules/.bin/playwright test -c playwright.phase1.config.ts --reporter=dot --output=/private/tmp/xc-pipeline-components-verified

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
XC_PIPELINE_APP_DIR=/private/tmp/xc-pipeline-app.tv96wt XC_PIPELINE_PORT=3217 \
XC_GATEWAY_IMC_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' \
XC_GATEWAY_REFERENCE_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway CB Helix Test.docx' \
./node_modules/.bin/playwright test -c playwright.pipeline.config.ts --output=/private/tmp/xc-pipeline-browser-verified

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 ./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint .
git diff --check
./node_modules/.bin/prettier --check app components lib tests '*.ts' '*.mjs' '*.json'
```

Production build command, run in the disposable application directory:

```sh
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true \
NODE_OPTIONS='--require "/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/XC Editorial studio/tests/helpers/pipeline-offline-network.cjs"' \
./node_modules/.bin/next build --webpack
```

Unit/component preloads deny fetch, HTTP and sockets before transport. The browser server preload refuses non-mock mode/nonempty OpenAI keys and blocks external fetch/HTTP/socket transport while allowing necessary local framework connections. Separate negative tests verify OpenAI, Writer, Anthropic and Google endpoints are denied before transport. Browser routing blocks external requests, supplies empty **test-only** CSS for the existing Google Fonts URL, and rejects local API requests except the explicitly enabled mock-agent route in the full workflow. Metadata from that isolated route must report `mode: mock, provider: mock` before any POST is allowed. No new application AI API usage occurred.

### Failures encountered and classification

- **Verified implementation defects found during regression:** over-broad heading inference split narrative text mentioning proof/audiences; an overly strict derived-view comparison rejected legitimate human clarifications/added attachments. Corrected before final passing runs. Negative source-tampering tests still pass.
- **Harness issues:** sandbox prevented local server binding; approved isolated execution resolved it. Shell quoting of paths with spaces was corrected. The existing rebuild confirmation was initially auto-dismissed by Playwright; the new full-flow test now explicitly accepts it. A component run incorrectly used React Server conditions; the final component command omits those conditions. `npm run typecheck` attempted to write the existing incremental file outside the session writable root; the final no-incremental command passes without changing app configuration.
- **Expected contract update:** five quotation-repair tests previously assumed that one invalid finding must discard valid siblings. They now supply only the offending finding to retain their total-rejection assertion. Separate new tests require partial valid findings to survive **and** require invalid findings to remain excluded. No source-validation assertion was disabled.
- **Strict-schema fixture update:** the legacy non-strict schema's expected diagnostic names the newly encountered optional `validationIssues` field rather than `locator`; strict model schema validation remains tested.
- **Offline resource handling:** the existing Google Fonts CSS request initially made the extraction tests fail their external-request audit. It is fulfilled locally with empty CSS in the test only. Production font loading was not altered and no external stylesheet was downloaded.
- **Formatting:** after formatting only task-touched files, the repository-wide check still reports six unrelated files: `components/StrategySuggestions.tsx`, `lib/ai/perspective-quality.ts`, `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`, `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`, `tests/strategy-studio-phase3.spec.ts`, `tmp-dump.mjs`. These were not reformatted. The current result is six, not a reused count from an earlier audit.

### Files affected by this task

Existing dirty files not listed here were preserved. Some listed files already contained unrelated local edits; those were retained, not overwritten.

- New shared model/registry/classifier: `lib/campaign-field-classifier.ts`, `lib/canonical-campaign.ts`, `lib/source-registry.ts`.
- Extraction and mapping: `lib/document-import.ts`, `lib/imc-parser.ts`, `lib/studio-imc-records.ts`, `lib/input-pack-presentation.ts`.
- Shared contracts/context/state: `lib/types.ts`, `lib/ai/schemas.ts`, `lib/ai/context.ts`, `lib/discovery-context.ts`, `lib/discovery-studio.ts`, `lib/discovery.ts`.
- Prompts: `lib/ai/prompts.ts`, `lib/ai/discovery-prompts.ts`, `lib/ai/sparks-prompts-v1.ts`.
- Grounding and resilience: `lib/discovery-sources.ts`, `lib/ai/discovery-submission.ts`, `lib/ai/discovery-evidence.ts`, `lib/discovery-connection-evidence.ts`, `lib/ai/spark-quality.ts`, `lib/discovery-lens-quality.ts`, `lib/ai/provider.ts`.
- New tests/tooling: `tests/fixtures/pipeline-campaigns.ts`, `tests/ai/pipeline-reliability.spec.ts`, `tests/document-pipeline-reliability.spec.ts`, `tests/helpers/pipeline-offline-network.cjs`, `tests/phase1/pipeline-network-guard.spec.ts`, `playwright.pipeline.config.ts`.
- Existing test contract updates: `tests/ai/discovery-sdk.spec.ts`, `tests/ai/discovery-quotation-repair.spec.ts`.
- Report: `docs/campaign-pipeline-reliability.md`.

### Unfamiliar-document behavior and remaining limits

1. Supported searchable DOCX/PDF/PPTX and text/Markdown/CSV files are extracted locally. Original extracted Unicode/text remains available; headings/table cells are interpreted through shared constrained classification and canonical review states.
2. Recognized source values receive original passage references. Missing information stays missing. Ambiguous/unfamiliar labels are retained for review; no background model invents their meaning. A document with no identified usable campaign context cannot start generation until reviewed/corrected.
3. Agents use the current selected campaign, original registered sources and selected preparations. Unsupported research becomes an explicit gap, not fabricated competitor/consumer evidence. Validation failures identify the offending finding/field; an entirely invalid replacement does not erase a valid earlier version.
4. Saving/approval retain exact human text, source snapshots and finding references. No new automatic draft backfill or approval is introduced.

**Not claimed:** universal understanding of arbitrary documents or guaranteed live model success. Constrained classification is local label/concept matching, not unrestricted semantic inference. Long unlabeled narrative, unfamiliar languages/labels, ambiguous layouts and multi-column PDF reading order may need human review. Scanned/image-only PDFs, embedded image/chart meaning and OCR are unsupported. Encrypted/corrupt Office/PDF files and legacy binary `.doc/.ppt/.xls` need an unprotected supported-format export. External research connectors remain disconnected. Source validation checks consistency with the received extracted text, not cryptographic authenticity of an original upload or independent truth of every model sentence. No historical live response payload was replayed, so this audit does not assert which exact offending quotation produced each past screenshot.

**LIVE VERIFICATION PENDING:** paid-provider generation quality/availability. Offline transport/contract tests are not a substitute for live evaluation. No live requests, credentials changes, dependency installs, commits, pushes, deployment, UI redesign or Team Round Table implementation were performed.
