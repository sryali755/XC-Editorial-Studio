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

`OPENAI_MODEL` is optional; its sole code default is in `lib/ai/config.ts`. Use any model available to your API project that supports Responses structured outputs. Restart the development server after environment changes; redeploy Vercel after changing deployment variables. Never prefix the key with `NEXT_PUBLIC_`. `.env.local` is ignored by Git; `.env.example` contains no credential.

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
