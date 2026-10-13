# XC Strategy Studio

A Next.js prototype for preparing an XC strategy input pack, exploring five strategic perspectives, and generating a creative brief after explicit human approval.

## Run locally

Use Node.js 20.9 or newer and npm.

```sh
npm ci
cp -n .env.example .env.local
npm run dev
```

Open http://localhost:3000 on the computer running the application.

Choose **Load sample IMC brief**, then **Prepare XC Input Pack** to begin the demonstration. Review the three preparation agents, select at least one strategic spark, and generate the five perspectives. Refine candidates independently, select or combine brief lines, approve the final direction, and supply execution details to generate a brief. Mock mode remains the default.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm run test:ai
```

Browser tests use Playwright and require Google Chrome. Keep AI_MODE=mock for these tests: they use the real internal route plus simulated live response envelopes and partial failures, without paid API calls. The separate server suite verifies the actual OpenAI SDK request format with a fake transport, schema validation, source preservation, and sanitized errors. Run typecheck and build sequentially because Next.js regenerates route types during its build.

## Project structure

- `app/`: App Router entry point, layout, and styles.
- `components/PreparationWorkspace.tsx`: IMC input, preparation agents, histories, and the dynamic input pack.
- `components/PreparationOutputs.tsx`: shared spark selections, research sections, and extracted context summaries.
- `components/UpstreamContextPanel.tsx`: upstream messaging, omission statuses, restrictions, and source records.
- `components/AgentRoundTable.tsx`: five personas, refinement, selection, synthesis, and approval.
- `components/StrategyWorkspace.tsx`: session state and workflow navigation.
- `components/StrategyPanels.tsx`: shared fields, input summary, execution direction, and generated brief preview.
- `lib/types.ts`: TypeScript contracts.
- `lib/imc-parser.ts`: canonical 19-field extraction before preparation starts.
- `lib/preparation.ts`, `lib/upstream.ts`: preparation API adapter, derived pack, and preserved upstream context.
- `lib/execution.ts`: inherit known approved context while preserving manual execution edits.
- `lib/services.ts`: perspective, synthesis, and final-brief API adapters.
- `app/api/ai/agent/route.ts`: Node.js POST generation route and public GET configuration status.
- `lib/ai/`: provider abstraction, structured schemas, prompts, serializers, OpenAI client, and preserved deterministic mock helpers.
- `tests/`: browser workflow and responsive-layout checks.

## Prototype boundaries

Mock mode simulates AI responses and needs no API credentials. Live mode uses server-side OpenAI; sample campaign content is still illustrative. Writer, research sources, and Workfront remain unconnected in both modes. Work is stored in browser session storage; there is no database, authentication, or shared session storage.

Imports accept text, Markdown, and CSV files. PDF and PowerPoint extraction is not implemented. Final briefs download as designed PDFs or editable Word documents (.docx). The preview and both exports use one document model, with Xfinity-style typography and the purple palette from the supplied leadership reference. This is a styled XC brief, not a verified official corporate template.

The original upstream RTB is preserved separately from proposed XC adaptations. A supplied field is not automatically approved. Kevin's approval applies to the selected brief line, not upstream claims, Brand messaging, or partner approvals.

Before any preparation agent runs, the IMC brief is parsed into all 19 core fields plus supporting fields such as partner approval status. Expand **Parsed IMC fields** to review the original values and omission statuses. The parser accepts labeled text (including snake_case and camelCase labels), Markdown headings/tables, field/value or header-row CSV (including quoted multiline values), and pasted JSON objects. It preserves multiline values and repeated fields; it does not infer fields from unlabeled prose. Invalid structured input blocks preparation. Parsed source values remain separate from human review and agent proposals, and older sessions are checked against their source brief before a field is treated as missing.

Preparation starts all three agents at V1. Each retains independent versions and saved guidance. The Dynamic XC Input Pack is derived from their current outputs, including restored versions. Spark checkboxes in the agent card and working pack share one selection; only selected sparks, with their version references, enter the round-table snapshot. Regenerating or restoring sparks clears selections for review.

Explicit approval saves the selected foundation and source perspectives in the Approved Strategy Record. Execution inherits known channels, messaging, disclaimers, timing and restrictions; missing asset and copy requirements stay empty. **Load sample execution details** explicitly fills illustrative demo values when needed. Creative direction and approval notes carry into the final preview and both downloads.

The final brief highlights the approved strategy and groups the complete content into campaign foundation, strategy and messaging, execution and deliverables, evidence and inspiration, and mandatories and approvals. Unknown and duplicate headings from older saved briefs are retained. Both downloads include page numbers and retain source wording, exclusion statuses, disclaimers, and approval notes. Word content is editable text. PDF fonts are embedded; export happens in the browser without sending the brief to an external conversion service or making another AI call. Document libraries load only when downloading. Browser printing remains available.

## OpenAI configuration and Vercel

The integration uses the official OpenAI SDK and [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Next.js 16.3.8 uses the App Router. No custom Vercel config existed or is required: the internal endpoint runs as a Node.js route, not a static export.

Edit `.env.local` privately for local live mode, or add these exact environment variables to the Vercel project's settings for each deployment environment you intend to use:

```dotenv
OPENAI_API_KEY=<your private OpenAI API key>
AI_PROVIDER=openai
AI_MODE=live
OPENAI_MODEL=gpt-5.5
```

`OPENAI_MODEL` is optional; its sole code default is in `lib/ai/config.ts`. The existing GPT-5.5 model stays the default. Changing models requires a verified capability registration in `lib/ai/capabilities.ts`; unknown models fail explicitly instead of receiving assumed parameters. Restart the development server after environment changes; redeploy Vercel after changing deployment variables. Never prefix the key with `NEXT_PUBLIC_`. `.env.local` is ignored by Git; `.env.example` contains no credential.

For demo mode, set `AI_MODE=mock` or leave it unset. No key is required, even if one exists in your environment. Explicit `AI_MODE=live` with a missing key returns a clear 503 configuration error; it never silently substitutes mock results. Unsupported providers or modes also return configuration errors.

To run a local production build:

```sh
npm run build
npm run start
```

All ten agent types use the same provider boundary: RTB, Research, Sparks, Humorous/Witty, Cultural/Social, Audience-first, Market/Landscape, Proven-pattern/Brand, Synthesis, and Final Brief. Each request has an explicit schema. Preparation calls run in parallel with individual errors and retry buttons; successful siblings and prior versions survive failures. A perspective can also be retried independently. Versions store structured data, provider, optional model, guidance and generation time. One candidate per perspective/synthesis call preserves the existing brief-line UI; six sparks are generated per run.

Prompts are centralized in `lib/ai/prompts.ts`. `lib/ai/provider.ts` selects the provider and protects original RTB, supplied evidence and approved strategy with application rules. `lib/ai/context.ts` sends the same current selected foundation to every perspective, without unused sparks or complete preparation histories. The Dynamic XC Input Pack remains derived application state. AI output never grants approval; final generation requires the explicit Approved Strategy Record.

The OpenAI module is marked `server-only`; browser code calls `/api/ai/agent` through one helper. Requests have a 1 MB streamed size limit, schema validation and an origin check. Responses are validated, rendered as React text, and errors omit SDK details. The SDK uses a 45-second timeout, at most one transport retry, bounded output tokens and `store: false`; no tools or research connectors are supplied. Model refusals, incomplete responses and invalid JSON produce recoverable errors without substituting fabricated outputs.

This prototype has no login, distributed rate limiting or shared approval database. Protect a live Vercel deployment with deployment access controls before sharing it broadly: the generation endpoint uses the deployment's API credentials. The origin check is not authentication. The route requests a 120-second duration; actual limits depend on deployment configuration. AI claims still require human review.

Automated checks cover mock generation, the OpenAI SDK via simulated transport, live-shaped browser responses, malformed/refused/incomplete outputs, missing-key behavior, and PDF/Word export fidelity. Live smoke tests verified preparation and perspective regeneration with GPT-5.5 using privately configured credentials. Full workflow checks run in mock mode without spending API credits.

## Integration files

New files for AI integration:

- `.env.example`, `app/api/ai/agent/route.ts`
- `lib/ai/schemas.ts`, `context.ts`, `prompts.ts`, `config.ts`, `errors.ts`
- `lib/ai/provider.ts`, `openai-provider.ts`, `mock-provider.ts`
- `lib/ai/mock-preparation.ts`, `mock-strategy.ts` (preserved existing mock helpers)
- `lib/ai/client.ts`, `format.ts`
- `tests/ai/provider.spec.ts`, `tests/ai-workflow.spec.ts`, `playwright.ai.config.ts`

Updated integration files: `app/page.tsx`, `app/globals.css`, `components/PreparationWorkspace.tsx`, `PreparationOutputs.tsx`, `AgentRoundTable.tsx`, `StrategyWorkspace.tsx`, `StrategyPanels.tsx`, `lib/preparation.ts`, `lib/services.ts`, `lib/types.ts`, `tests/imc-parser.spec.ts`, `playwright.config.ts`, `.gitignore`, `package.json`, `package-lock.json`, and this README.

## Future providers

Add a Writer/Palmyra adapter behind `generateAgentResponse` in `lib/ai/provider.ts`, implementing the same validated schemas and metadata. Keep prompts and provider credentials server-side. Writer Playbook authentication and invocation still need their approved integration contract. No Writer endpoint is assumed by this prototype.


## Round Table creative controls and quality review

Current workflow improvements:

- `Brand:` / `Brand name:` is parsed as supplemental metadata, separate from the 19 required IMC fields and the campaign name. Original source text remains intact. Legacy unedited extraction is repaired from source; reviewed values and approved snapshots are preserved.
- **Keep this Spark** protects that idea during set regeneration. **Improve** develops one idea; **Replace** requests a new premise for one idea. Other Spark text, titles, rationales and selection IDs are retained by code. Failed revisions keep their original scope when retried, including after reloading. Changing an idea clears only its own selection. A full new set still clears changed selections.
- The Round Table opens immediately and each result appears as its request finishes. Other agents' failures or delays do not block reviewing finished candidates.
- **Next version** distinguishes improving the current premise from exploring a new one. Prompts record the intent; `xc-roundtable-3.1` and `xc-sparks-3.1` implement it. Evaluation review includes premise distinction, evidence traceability and requested intent; mock tests do not establish live creative quality.
- Sliders show control-specific level names with no visible numbers. Agent explanations expand on demand, and **Compare selected** places shortlisted candidates together for review.
- **Saved projects** stores named, immutable snapshots in this browser's local storage. Save again to capture later edits. Opening another snapshot first saves the current working draft; if storage fails, switching is blocked. This is local persistence, not cross-device collaboration or authenticated approval. The existing working tab continues to use session storage.

Each card has **Creative Controls**, expanded by default, and **Steer This Agent**. Both sliders start at 5/10 and affect only that agent. Their four bands (1–3, 4–6, 7–8, 9–10) translate into specific prompt instructions. Nothing generates while a slider moves. Click **Generate another version** to combine the same shared foundation, the persona prompt, both control descriptions, steering text and regeneration instructions. Empty or unchanged steering still requests a new premise. An exact repeated candidate triggers one live retry; if it repeats again, a recoverable error preserves the history.

| Agent | Controls | Prompt emphasis |
| --- | --- | --- |
| Humorous / Witty | Wit & Humor; Creative Boldness | Specific human contradictions, incongruity and playful reversals; no forced puns or product promises disguised as jokes. |
| Cultural / Social | Cultural Relevance; Unexpected Connections | Household rituals, social negotiation and belonging; cultural readings are hypotheses unless supported by supplied evidence. |
| Audience-first | Audience Empathy; Emotional Resonance | Practical jobs, motivations and human stakes; no stereotyped or invented audience truths. |
| Market / Landscape | Strategic Differentiation; Exploratory Thinking | Positioning and category reframing; no invented competitive weakness or superiority. |
| Proven-pattern / Brand | Brand Alignment; Pattern Exploration | Supplied brand principles and historical learning; untested techniques never become “proven” results. |

Brand, factual and legal constraints apply at all intensities. Selected Sparks are exploratory suggestions, supplied research retains its qualifications, and upstream values are unchanged. The brief line carries the idea; the rationale explains its objective, RTB and evidence boundaries. Strong-output examples in prompts use unrelated fictional products and explicitly prohibit importing those facts or copying their wording.

New versions internally save the agent identifier, version number, candidate and rationale, personality settings, exact trimmed steering, provider/model, effective model settings, prompt-template version, timestamp, request ID, content-derived input-pack identifier and full selected-foundation snapshot. The read-only settings report has been removed from the current card and version history, including model, model settings, prompt template and input-pack identifiers. Restoring a prior result changes the current pointer without deleting later results or changing the next-generation controls. Older saved versions remain selectable. Draft controls/steering persist with the existing browser session. Synthesis weights remain separate.

### Model capabilities

The provider uses Responses structured JSON output on GPT-5.5. The optional `modelSettings` request object supports validated `reasoningEffort` (`none`, `low`, `medium`, `high`, `xhigh`) and `verbosity` (`low`, `medium`, `high`). Omitted reasoning retains the documented GPT-5.5 default `medium`; personality generation retains the existing 2,500 output-token cap. No additional generation parameters are sent by default. The capability registry checks structured output, reasoning, temperature, top-p, verbosity and output budget. Temperature/top-p are disabled in this workflow; sending either produces a clear error before transport. Personality sliders tune the prompts. Unknown parameters are rejected by the request schema. Mock mode rejects model sampling settings and labels its finite demonstration fixtures; it does not semantically interpret arbitrary steering or measure LLM quality.

Sources: [GPT-5.5 model support](https://developers.openai.com/api/docs/models/gpt-5.5), [Responses parameters](https://developers.openai.com/api/reference/resources/responses/methods/create). Future providers need their own verified capability registration and translation rather than guessed Palmyra identifiers or copied OpenAI parameters.

### Individual creative evaluation

The original five-persona evaluations are explicitly separate from ordinary tests and use only the fictional campaign in `evaluations/campaign.ts`. The newer v3 comparison is documented below. Its IMC is parsed into structured fields, with research absent and price promotion excluded. No preparation agent is run for this fixture. It supplies one labeled hypothetical Spark and the same context to each persona. These evaluations use the existing private server configuration and incur API usage:

```sh
# Test one agent at a time, starting with humor, then culture.
npm run eval:agents -- --grep humor
npm run eval:agents -- --grep culture
npm run eval:agents -- --grep audience
npm run eval:agents -- --grep market
npm run eval:agents -- --grep brand
```

Each run generates V0 at 5, controls at 2/8/10, steering with defaults, steering with changed controls, and a fresh alternative under unchanged settings. JSON results include actual prompts, settings and responses; Start at `evaluations/results/index.html` for the current examples and provisional assistant assessments. Individual HTML reports in `evaluations/results/` let Kevin score every candidate from 1–5 for campaign relevance, persona alignment, originality, clarity, strategic usefulness, brand compliance and control responsiveness. Enter notes and accept/reject/refine decisions, then download the review JSON to save it. Kevin's score fields start unassigned; `provisional-assessment.json` separately records assistant scores and notes for all 35 current candidates, tied to their request IDs. Results are not creative approval. The report itself has no network calls, and review decisions do not change application approvals.

The retained `evaluations/baselines/` show why prompts were refined: initial humor added repetitive product explanations, and initial culture overused devices taking turns. Audience was revised to center a person, market to express a decision criterion, and brand to organize around a supplied principle. Current examples demonstrate changed creative premises rather than a quality guarantee. The comparison includes regeneration history as well as changed controls, so it is a practical demonstration, not an isolated causal benchmark of slider values. Kevin still needs to review brand voice, humor, cultural relevance and real-campaign fit with approved evidence.

Implementation files for this iteration: `lib/creative-controls.ts`; `lib/ai/persona-prompts.ts`, `prompts.ts`, `generation-settings.ts`, `capabilities.ts`, `schemas.ts`, `client.ts`, `provider.ts`, `openai-provider.ts`, `mock-perspective.ts`, `mock-provider.ts`; `lib/types.ts`, `lib/services.ts`; `components/CreativeControls.tsx`, `AgentRoundTable.tsx`, `StrategyWorkspace.tsx`; `app/globals.css`; `tests/ai/creative-controls.spec.ts`, `tests/ai/provider.spec.ts`, `tests/agent-refinement.spec.ts`; `evaluations/`; `playwright.evaluation.config.ts`; `package.json`; this README. No dependencies were added.


Validation for this iteration: 22 browser/workflow cases passed (the full 21-case suite plus the new pending-request isolation case); 14 server/prompt/capability tests passed; lint, TypeScript and production build passed. Ten sequential live agent evaluations produced 70 candidates across baseline/revised prompts, with 35 current candidates retained for review. One additional live call verified optional low reasoning and low verbosity. An early simulated-transport test fixture omitted the Responses object discriminator; it was corrected and all final checks passed. No unresolved automated test failures. Kevin's creative approval remains pending, especially for generic positioning, metaphor similarity and wording that could suggest one-at-a-time internet access.


## Strategic Sparks refinement

The original Sparks refinement introduced a dedicated prompt in `lib/ai/sparks-prompt.ts` (`xc-sparks-2.1`, now superseded by v3 below). It requests six different creative territories with short titles, concrete explorations, and rationales naming the supplied grounding, creative hypothesis and assumption to validate. It checks the parsed IMC before interpreting missing fields, preserves excluded RTB/research states, and adapts to the supplied audience rather than assuming every campaign concerns households. Regeneration compares strategic premises with the previous set; steering applies within the original constraints. All ideas remain proposals for human review.

The agent card and Dynamic XC Input Pack show each title and an expandable **Why this spark** explanation. Expanding it does not select the idea. Only selected current Sparks, including their titles, rationales and version references, reach all five perspectives, synthesis and final packaging. Earlier versions retain their explanations. Existing text-only sessions work; manually edited ideas do not inherit an old AI rationale or prompt-version label.

`lib/ai/spark-quality.ts` rejects incomplete sets, duplicate identifiers, repeated idea text and an unchanged or reordered previous set. A failed quality check gets one live regeneration attempt; another failure preserves the existing output and selections. These checks detect structural and exact-text problems, not semantic originality or factual accuracy. The prompt addresses those concerns, and creative review is still required. Sparks has a bounded 6,000 output-token allowance to fit six developed ideas and their rationales; the other preparation and perspective budgets are unchanged.

Mock mode has two distinct fixture sets with titles and labeled hypothetical rationales in `lib/ai/mock-sparks.ts`. It alternates from the current set for UI testing; it does not interpret arbitrary steering or demonstrate live creative quality.

Run the optional paid evaluation with `npm run eval:agents -- --grep 'sparks quality'`. It uses five fictional cases: initial household exploration, unchanged-steering regeneration, shared-calendar steering, excluded RTB with missing research, and a shop-owner brief with a qualified illustrative interview. See `evaluations/results/sparks.html` and its JSON for results; earlier examples are retained in `evaluations/baselines/sparks-v1.*` and `sparks-v2.0.*`. These are assistant review artifacts, not approved campaign work.

Validation: all 24 browser cases passed (23 in the full run, then the corrected title-aware workflow assertion passed separately), all 18 server/prompt tests passed, and TypeScript, lint and production build passed. The revised five-case GPT-5.5 run completed with 30 Sparks. `evaluations/results/sparks-review.json` records a provisional assessment, including remaining semantic overlap that exact duplicate checks cannot detect. Refresh the app and regenerate Sparks to use the new prompt; saved versions are preserved.


## Prompt strengthening v3

The current prompt set strengthens all ten agent roles while retaining GPT-5.5, the existing output schemas, creative controls, parsed-source protection, approval workflow and token budgets. New outputs record a prompt-template version for every agent. Earlier saved results are not rewritten.

- **Sparks:** six different strategic premises, with each rationale organized as **Premise / Grounding / Validate**. The prompt explicitly checks overlapping meanings, implied product claims, audience fit, missing/excluded RTB and genuine regeneration versus a requested refinement. This is a model instruction, not a new semantic-duplicate detector.
- **Five perspectives:** clearer individual creative jobs, concrete human stakes, unrelated fictional strong/weak craft contrasts, concise evidence-aware rationales, and an implication check on the candidate itself. Higher intensity still cannot relax source or brand constraints.
- **RTB and research:** useful framing within the actual supplied proof, precise source scope, qualified illustrative findings and prioritized research questions tied to campaign decisions.
- **Synthesis and final brief:** coherent weighted strategy rather than pasted fragments, explicit treatment of zero-weight candidates, exact approved-line preservation and clear separation of requirements from proposed interpretation.

Prompt files: `lib/ai/prompts.ts` (shared contract and assembly), `persona-prompts.ts`, `sparks-prompt.ts`, and `workflow-prompts.ts`. `lib/ai/provider.ts` stamps the version; the existing API client and version records retain it.

The opt-in comparison uses only fictional fixtures and the existing private API configuration:

```sh
npm run eval:agents -- --grep 'prompt v3 comparison'
```

The report is `evaluations/results/prompt-v3/index.html`, with requests, prompts, outputs and elapsed times in `results.json`. It compares the same stored requests against retained earlier outputs for five balanced personas, two controlled/steered personas and five Sparks scenarios, then checks RTB, research, weighted synthesis and final packaging. Earlier prompts/results are preserved in `evaluations/baselines/before-prompt-v3/`; the older top-level reports remain historical v2 evaluations. One sample per condition is a practical comparison, not a statistically established quality gain or creative approval. Kevin's review remains necessary.

Prompt design reference: [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering).

Validation for v3: 18 server/prompt checks and six focused browser workflow checks passed; TypeScript, lint and the final production build passed. Seventeen live GPT-5.5 scenarios completed across all ten agent types. One initial market response was incomplete; a resumed run completed it. Audience and market instructions were tightened after reviewing outputs; unchanged completed cases were reused only when their full request and prompt matched. `evaluations/results/prompt-v3/review.json` records provisional case-level findings, including remaining overlap. The two market cases were rechecked with the final acceptance criterion.

## Interactive Dynamic XC Input Pack

The working pack appears after the preparation agents, with campaign foundation, direction-building and readiness panels. Source wording and all 19 parsed field statuses remain available; RTB proposals and research expand on demand. A persistent selection tray lets users inspect or remove Sparks, preview shared inputs and generate perspectives while scrolling.

- **Trace this idea** separates recorded agent reasoning from original source text. The UI recognizes the v3 Premise / Grounding / Validate format and also supports older rationales and manual edits. Only literal source excerpts found in the rationale are identified as exact text matches; they do not verify the interpretation or approve a claim. When there is no match, the UI explicitly labels the original fields as context to review.
- **Preview shared input** uses the same `selectedFoundation()` projection as the five perspective requests, with a readable view and expandable exact JSON. Marking a pack reviewed saves a comparison baseline; it does not approve strategy or launch an AI request. Version changes, selection changes and revised review notes are highlighted against that baseline.
- **Directions A and B** capture selected Sparks, preparation version references, emphasis and source review details. Choosing a direction restores those inputs while preserving all version history and the original parsed IMC. Directions from another IMC source cannot be applied. Saving, comparing, tracing and reviewing require no model calls. Candidates use the existing tab-scoped session storage; they are not shared campaign records.
- Successful Spark regeneration, manual edits and history restoration explicitly explain that selection must be reviewed again. Missing fields remain review items, intentional exclusions remain excluded, and readiness is based on current source versions and an actual Spark selection.

Implementation: `components/DynamicInputPack.tsx`, `InputPackDetails.tsx`, `PackDialog.tsx`, `PreparationWorkspace.tsx`, `PreparationOutputs.tsx`; `lib/input-pack.ts`, `lib/types.ts`; scoped pack styles in `app/globals.css`. No new dependencies or API schemas are required. `tests/input-pack.spec.ts` covers preview/request identity, version restoration, source isolation, trace behavior, legacy sessions, mobile layout and snapshot independence.

Validation: 13 focused browser/workflow checks passed against an isolated mock server, including existing preparation, Sparks and upstream-preservation flows. TypeScript, lint and the production build passed. No live AI calls were used for this UI change.
