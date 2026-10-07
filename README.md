# XC Strategy Studio

A Next.js prototype for preparing an XC strategy input pack, exploring five strategic perspectives, and generating a creative brief after explicit human approval.

## Run locally

Use Node.js 20.9 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 on the computer running the application.

Choose **Load sample IMC brief**, then **Prepare XC Input Pack** to begin the demonstration. Review the three preparation agents, select at least one strategic spark, and generate the five perspectives. Refine candidates independently, select or combine brief lines, approve the final direction, and supply execution details to generate a mock brief.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

Browser tests use Playwright and require Google Chrome. Run typecheck and build sequentially because Next.js regenerates route types during its build.

## Project structure

- `app/`: App Router entry point, layout, and styles.
- `components/PreparationWorkspace.tsx`: IMC input, preparation agents, histories, and the dynamic input pack.
- `components/UpstreamContextPanel.tsx`: upstream messaging, omission statuses, restrictions, and source records.
- `components/AgentRoundTable.tsx`: five personas, refinement, selection, synthesis, and approval.
- `components/StrategyWorkspace.tsx`: session state and workflow navigation.
- `components/StrategyPanels.tsx`: shared fields, input summary, execution direction, and generated brief preview.
- `lib/types.ts`: TypeScript contracts.
- `lib/imc-parser.ts`: canonical 19-field extraction before preparation starts.
- `lib/preparation.ts`, `lib/upstream.ts`: mock preparation and upstream context handling.
- `lib/services.ts`: mock strategy and creative-brief adapters.
- `tests/`: browser workflow and responsive-layout checks.

## Prototype boundaries

AI responses and campaign examples are simulated. Writer, research sources, and Workfront are not connected. No API credentials are required. Work is stored in browser session storage; there is no database, authentication, or shared session storage.

Imports accept text, Markdown, and CSV files. PDF and PowerPoint extraction is not implemented. Brief downloads produce text; browser printing supports Save PDF. Matching the official XC format requires the approved sample template.

The original upstream RTB is preserved separately from proposed XC adaptations. A supplied field is not automatically approved. Kevin's approval applies to the selected brief line, not upstream claims, Brand messaging, or partner approvals.

Before any preparation agent runs, the IMC brief is parsed into all 19 required fields. Expand **Parsed IMC fields** to review the original values and omission statuses. The parser accepts labeled text (including snake_case labels), Markdown headings/tables, and pasted JSON objects. It preserves multiline values and repeated fields; it does not infer fields from unlabeled prose. Invalid JSON blocks preparation. Parsed source values remain separate from human review and agent proposals, and older sessions are checked against their source brief before a field is treated as missing.

## Future integrations

`generateXCBrief(payload)` in `lib/services.ts` is the integration point for an approved Writer Playbook. Implement the live adapter server-side, confirm its authentication and artifact-return contract, and preserve the Playbook's independent operation within Writer. Preparation and persona services have separate interfaces for their future integrations.

Keep credentials in excluded environment files or an approved secret store. Dependencies, build artifacts, local test output, and environment files are excluded from Git.

# XC-Brief
