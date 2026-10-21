# Insight Discovery primary workflow — October 15, 2026

The user explicitly requested that the application be converted to the supplied Insight Discovery POC engineering brief. This replaces the previous optional launcher with the primary application at `/`. The current branch is `insight-discovery-poc`; `9c8134a` is the existing committed restore point. This conversion is local work, without a push, merge or deployment.

## Application flow

`Dynamic Input Pack ↔ Insight Discovery ↔ Human-led whole brief → Finalize XC Brief`

- The home screen is Insight Discovery. Persistent navigation offers Input pack, Insight Discovery, Whole brief and Finalize XC Brief. There is no candidate-line generation, automatic strategy selection, weighting/blending or strategy-review panel in this flow.
- Preparation retains original RTB/JTBD, Data Analysis & Synthesis and Evidence-led Sparks. Preparation is optional for opening research and writing. Evidence-led Sparks analyzes documented cases in supplied material and reports gaps when cases are absent. It uses the existing Discovery request/provider, rather than the creative-territory Sparks prompt.
- All five investigative lenses inherit the same selected input pack, source brief, original RTB and supporting documents. Scope controls choose enabled lenses; Explore is explicit. Completed results appear independently. Lens rubrics are visible and included in prompts.
- The investigation supports a problem or hypothesis, selected/all-lens findings, tensions/questions, per-agent and per-finding volleys, contrary-evidence requests, routing to another lens, saved/aside findings, editable saved/rejected connection notes and links to exact finding versions.
- The compact My Thinking panel holds hypotheses, notes, open questions and saved evidence. The whole brief opens at any time with problem, insight, direction, human brief line, context, objective, audience, original proof, thought-starters, deliverables, mandatories and timelines.
- Explicit human approval freezes the canvas, input pack and evidence references. Finalization packages that approved snapshot deterministically, without an additional model call. Later draft edits cannot change an earlier approval or package. Private notes are excluded. Approval and package histories remain inspectable. PDF/Word use the existing document exporters.

## Evidence and state

Manual supplied evidence includes original text, source identity, locator, date and audience. Reference URLs are locators; the application does not fetch them. Exact quotations and metadata are validated against the corresponding supplied source. Source coverage distinguishes current supplied material that has been analyzed from material that has not, and preserves unavailable-source/gap states. Saved findings mean worth considering, rather than verified or approved.

Input changes flag earlier findings for refresh and preserve earlier run snapshots. Scope changes are also visible. Research retries retain the original action, finding, steering, prior versions and drafts. Research runs stay mounted while navigating to writing or input preparation; cancellation and actual source changes preserve prior work. Research and preparation failures never silently become mock success.

The new `xc-insight-studio-v1` session is separate from the legacy saved session. On first use, existing IMC context and matching Discovery drafts are imported. Generated creative lines are not imported as human strategy. The original legacy session remains untouched. Browser session storage retains the workspace in the current tab; it is not a production database.

## Compatibility and configuration

- Discovery is the default home screen; the existing `NEXT_PUBLIC_INSIGHT_DISCOVERY=true` setting selects it. An explicit `false` retains the legacy root for regression and recovery. `/creative` retains the old creative workspace and its Discovery launcher.
- Existing creative request paths remain intact. Discovery-only context enrichment lives in `lib/discovery-context.ts`; the previously protected creative source and eight legacy specification files remain unchanged from their restored versions.
- Existing model, provider credentials and low reasoning effort are unchanged. No dependency or external service was introduced. All automated generation checks use mocks/transport fixtures, without paid live requests.

## Verification

| Check                                      | Result                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| AI/contract suite                          | 59 passed. No live API calls.                                                                                |
| New primary Discovery browser acceptance   | 3 passed on the final source.                                                                                |
| Retained Discovery browser coverage        | 4 passed; flag-off-only assertion skipped in the enabled run.                                                |
| Full legacy browser suite, flag off        | 41 passed; 7 Discovery-only tests skipped.                                                                   |
| Typecheck and lint                         | Passed.                                                                                                      |
| Production build, Discovery on             | Passed; `/`, `/creative` and `/api/ai/agent` compiled.                                                       |
| Running localhost:3000                     | HTTP 200; Discovery title and primary navigation present; old Generate Strategic Perspectives button absent. |
| Protected source/spec diff from `fc4dfd3^` | Empty. Model/provider/generation settings unchanged; `git diff --check` passed.                              |

The acceptance suite covers default entry, writing/finalization before research, exact upstream proof, the complete source shared by five lenses, independent failure/retry, source-change refresh signals, enabled lenses, sourced-case preparation, persistence, mobile layout and immutable approval/package history. Existing Discovery coverage exercises finding versions, connection notes, cancellation and drafts; the retained legacy suite exercises the original creative flow. Tests/build ran in an isolated temporary copy on port 3102 using mock responses. Desktop/mobile screenshots were captured and inspected; an overlapping notice found during inspection was corrected.

The tested source was applied to the XC Editorial Studio repository, with environment files, Git data and build output excluded. The existing port-3000 development server picked up the source changes. The conversion remains uncommitted on `insight-discovery-poc`; no push or merge was performed.

## Files changed

- Entry and presentation: `app/page.tsx`, `app/creative/page.tsx`, `app/globals.css`.
- Primary workspace and input preparation: `components/InsightDiscoveryStudio.tsx`, `components/DiscoveryInputPack.tsx`.
- Shared Discovery UI: `components/InsightDiscoveryFeature.tsx`, `components/InsightDiscoveryWorkspace.tsx`.
- Final packaging and existing exports: `lib/discovery-studio.ts`, `lib/discovery-handoff.ts`, `lib/brief-document.ts`, `components/StrategyPanels.tsx`.
- Evidence, prompts and context: `lib/discovery-context.ts`, `lib/discovery-rubrics.ts`, `lib/discovery-sources.ts`, `lib/discovery.ts`, `lib/ai/discovery-evidence.ts`, `lib/ai/discovery-prompts.ts`.
- Optional Discovery contracts: `lib/types.ts`, `lib/ai/schemas.ts`.
- Tests: `tests/discovery-studio.spec.ts`, `tests/ai/discovery-studio.spec.ts`; the existing Discovery specs now exercise their preserved overlay at `/creative`. No legacy creative spec was edited or skipped.
- Documentation: `docs/insight-discovery.md`, this report.

## Remaining POC limits

No authorized Tableau, iSpot, ACE, Datorama, Brand Hub, customer-research or external web/case-study connector is configured. New external findings cannot be retrieved from those systems. Users can supply authorized documents manually. The application shows research gaps and unavailable connections rather than inventing results.

Enterprise identity/entitlement enforcement and production persistence are not implemented. PDF/PowerPoint ingestion was absent at the initial conversion; the subsequent [document-upload feature](document-upload.md) now provides browser text extraction for PDF, PPTX and DOCX, without OCR. Only supplied evidence is accepted; the final package rejects restricted/unavailable source claims rather than pretending to enforce external permissions. Browser cancellation stops waiting but may not stop provider work already underway. These are POC boundaries identified in the notes, not simulated production capabilities.

## Follow-up: live Discovery schema failure

The message “OpenAI generation failed before a valid response was returned” came from a local SDK schema-conversion error. Discovery evidence used `locator.optional()` in the schema sent to `zodTextFormat`. The installed OpenAI SDK rejects optional, non-nullable fields in strict structured outputs before contacting the provider. This was reproduced without a network call; the server's immediate 502 responses were consistent with that failure. It did not establish a billing, authentication or quota problem.

`lib/ai/schemas.ts` now provides a separate model-facing Discovery generation schema with a required locator string (empty when unavailable). Historical saved findings and the application parser still accept omitted locators. `lib/ai/openai-provider.ts` selects this model-facing schema and prepares its format before transport/retry handling. A setup error reports `response_schema_error` and is not retried as a provider failure.

`tests/ai/discovery-sdk.spec.ts` verifies all model-facing schemas through the installed SDK and exercises transport/response parsing for all five lenses, Data Analysis & Synthesis, Evidence-led Sparks and connections. The full AI suite passed 62 tests; typecheck, lint and the production build passed. Verification used local SDK transport fixtures, with no paid API requests. Models, reasoning settings, source/excerpt validation, selected content and version histories are unchanged. A failed run can be retried independently after refreshing the application.

The schema fix follows the required-field rule in the [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs#all-fields-must-be-required).
