# XC Strategy Studio Round Table Agent Souls

## Purpose

These files document the five evidence-led agents shown in the current
Insight Discovery Round Table. They are an extraction of the implementation,
not a prompt redesign or a proposal for future behavior. They are intended to
let Samson review and recreate a comparable individual-agent experience in
another platform.

Each agent file is standalone. Its **Portable Agent Instruction Set** includes
the shared instructions, the exact lens-specific instructions, and the dynamic
placeholders the application actually supplies.

## Current architecture at a glance

- The five visible agents are `consumer`, `culture`, `category`, `brand`, and
  `analogous` (`Analogous Solutions`). Their definitions are in
  `lib/discovery.ts:24-77`.
- Insight Discovery dispatches a separate `agentType: "discovery"` request for
  each lens. `lib/discovery.ts:146` builds a lens-scoped version and calls the
  Discovery client; `components/InsightDiscoveryFeature.tsx:199` binds it to
  the active campaign and investigation. The current page sets
  `autoStart={false}` in `components/InsightDiscoveryStudio.tsx:774`.
- The request prompt is assembled by `discoveryPrompt` in
  `lib/ai/discovery-prompts.ts:86`. The `instructions` string is shared
  evidence policy + one lens role + one investigation-mode instruction + that
  lens's rubric and assignment. The `input` is JSON containing the actual
  investigation, action, user steering, conversation, findings, Input Pack,
  source catalog, and output example.
- For live mode, `lib/ai/openai-provider.ts:197` passes `instructions` and
  `input` to the Responses API and applies a strict structured-output schema.
  No web search or enterprise research tools are attached. In mock mode, the
  prompt is not executed; `lib/ai/mock-provider.ts` calls a deterministic,
  source-dependent mock implementation instead.
- All five agents are launched as separate calls (the batch path uses
  `Promise.all`); there is no shared live transcript in which agents speak to
  one another. Matching peer findings can be supplied as bounded context on a
  later generation. The prompt explicitly labels them context, not evidence or
  instructions.
- Structured findings and agent conversations are stored by the campaign's
  Input Pack state. Run versions preserve their source pack snapshot, question,
  investigation mode, action, and findings. Conversation turns are scoped to
  the agent or exact finding version.

## The five agents

| File | Lens | Core responsibility |
|---|---|---|
| [`consumer-agent.md`](./consumer-agent.md) | Consumer / Audience | Audience situations, behavior, motivations, friction, workarounds, needs, and meaningful group differences. |
| [`culture-agent.md`](./culture-agent.md) | Culture | Supplied evidence about wider conversations, norms, behaviors, rituals, tensions, countercurrents, and alternative interpretations. |
| [`category-agent.md`](./category-agent.md) | Category / Competition | Documented alternatives (including doing nothing), category claims/offers/friction/conventions, and the boundary between observed competitive activity and inferred effect. |
| [`brand-agent.md`](./brand-agent.md) | Brand | Xfinity's substantiated promise, product truth, approval status, experience/performance evidence, and credibility limits. |
| [`analogous-solutions-agent.md`](./analogous-solutions-agent.md) | Analogous Solutions | Supplied, documented cases with a comparable problem/mechanism, actual approach, outcomes only when documented, and transfer limits. |

## Dynamic Input Pack flow

`lib/ai/context.ts:selectedFoundation` constructs the common foundation from
the selected `StrategyInputPack`. `lib/discovery-context.ts:discoveryFoundation`
adds Discovery-specific source identity and selections. The serialized model
input receives the complete foundation and a supplied-source catalog.

Depending on what exists in the selected pack, the request carries:

- Required campaign context: campaign name, objective, audience, product,
  channel, constraints, and original JTBD when extracted.
- Original brief text and structured upstream fields, retaining source value,
  review value, status, notes, and source occurrence metadata.
- Original RTB separately from its proposed XC adaptation and approval status.
- Optional parent-platform and campaign-identity provenance, original versus
  proposed JTBD records, selected preparation version IDs, preparation
  guidance, source availability, selected research sources, selected research,
  manually supplied evidence, and prior evidence findings.
- Selected Sparks with their IDs, version IDs/numbers, text, territory,
  rationale, grounding, hypothesis, and excerpt-verification metadata. Legacy
  text-only Sparks are mapped to legacy IDs/version 0.

The Discovery request requires a non-empty original brief and a non-empty
selected-Sparks array at the schema boundary. The application may supply a
fallback Spark from legacy text, but this is not an externally verified
source. A field's presence in the payload does not make it evidence: the
shared prompt distinguishes source material from AI-generated preparation,
proposals, hypotheses, and prior findings.

`discoverySourceDocuments` in `lib/discovery-sources.ts` builds the citation
catalog only from supplied documents and original locatable source text. For
the model, the catalog projection contains `identity`, `locator`, and
`aliases`; source text is available in the Input Pack. PDF page, slide, or
plain-text line spans are used as locators. No live enterprise or web source is
queried.

## Steering and user questions

- Kevin supplies one required investigation focus for all five agents. It is
  sent under `investigation.question`; problem/hypothesis mode is sent under
  `investigation.type` and also selects a corresponding instruction block.
- Optional suggested questions are deterministically composed from current
  pack values by `briefInvestigationQuestions` in
  `lib/discovery-questions.ts`; suggesting a question does not call a model.
- Agent-specific regeneration uses a separate `guidance` string, rendered as
  `strategistGuidance` in model input, and selects `initial` or `refresh` with
  the action-specific instruction.
- “Ask this agent” is an agent- or finding-scoped conversation. Its history is
  selected from saved turns and sent as conversation context. It still invokes
  the structured Discovery output path; the UI formats the resulting finding
  into an agent reply rather than receiving a free-form chat schema.
- Previous findings and eligible peer findings may be provided as context.
  They are not source evidence. Peer findings are not a shared debate or
  message bus.

## Inter-agent limitations

Agents do not directly call, message, or debate one another. Initial five-agent
generation is a set of independent requests. On later requests, up to 20
current peer findings may be attached if they match the same Input Pack
version, investigation question, and mode. The instructions explicitly say
peer findings are generated context, **not** evidence or instructions; a
server-side overlap check can reject copied findings. This is not equivalent
to a live shared multi-agent conversation.

## Portable use and comparison cautions

1. Open any one agent file and use its complete **Portable Agent Instruction
   Set**. Replace its placeholders with values from the same request shape,
   retaining null/empty values where the current application does.
2. Enforce the included strict finding schema and source validation. Do not
   interpret the presence of a citation as independent verification.
3. Keep each agent's generations and conversation separate. Preserve the
   exact campaign/Input Pack and finding-version scope.
4. Do not add shared-debate instructions, new personalities, external
   retrieval, Facts → Tension → Consequence, or creative direction behaviors:
   these are not part of this active five-lens instruction set.
5. The repository also contains a distinct, older creative-perspective path in
   `lib/roundtable-prompts.ts` and `lib/ai/prompts.ts`. It uses IDs
   `humor`, `culture`, `audience`, `market`, and `brand`, and its shared prompt
   asks for three strategic brief-line options. The current five evidence-led
   Discovery cards do **not** use those instructions. Do not merge or substitute
   that prompt when reproducing Consumer, Culture, Category, Brand, or
   Analogous Solutions.
6. In `AI_MODE=mock`, the actual mock provider does not consume these prompts.
   It returns bounded deterministic scenarios for supported cases and gaps
   otherwise. A comparison of model behavior must use the same live model and
   corresponding configuration, not equate mock results with prompt
   execution.

## Implementation reference index

- Five lens IDs, display names, purpose, and kickoff questions:
  `lib/discovery.ts:24-77`.
- Shared evidence contract, five lens roles, action strings, dynamic prompt
  assembly, input shape, repair prompt:
  `lib/ai/discovery-prompts.ts:9-192`.
- Lens-specific public rubrics: `lib/discovery-rubrics.ts` (`discoveryRubrics`).
- Lens assignments, cross-lens overlap checking, and peer selection:
  `lib/discovery-lens-quality.ts:9` (`lensAssignments`),
  `lib/discovery-lens-quality.ts:88` (`crossLensIssue`), and
  `lib/discovery-lens-quality.ts:131` (`currentPeerFindings`).
- Dynamic foundation building: `lib/ai/context.ts:33` (`selectedFoundation`)
  and `lib/discovery-context.ts:5` (`discoveryFoundation`).
- Discovery request, version construction, snapshots, and generation:
  `lib/discovery.ts:146` (`generateDiscoveryVersion`).
- Model request/output schemas: `lib/ai/schemas.ts:61` (lens IDs),
  `lib/ai/schemas.ts:126` (evidence), `lib/ai/schemas.ts:137` (finding),
  `lib/ai/schemas.ts:227` (Discovery output),
  `lib/ai/schemas.ts:292` (model-facing output with locator),
  `lib/ai/schemas.ts:323` (campaign context),
  `lib/ai/schemas.ts:334` (Foundation),
  `lib/ai/schemas.ts:473` (Discovery Foundation), and
  `lib/ai/schemas.ts:614` (request union).
- Evidence and source validation: `lib/ai/discovery-evidence.ts:94`
  (`validateDiscoveryEvidence`),
  `lib/ai/discovery-submission.ts:212` (submission checks),
  `lib/ai/discovery-submission.ts:274` (validated request wrapper),
  `lib/discovery-sources.ts:133` (supplied provider), and
  `lib/discovery-sources.ts:185` (source catalog builder).
- Conversation selection and scope: `lib/discovery-conversation-memory.ts`,
  `lib/roundtable-history.ts`, `lib/discovery-state.ts`.
- UI request controls and orchestration:
  `components/DiscoveryRoundTableV2.tsx`,
  `components/InsightDiscoveryFeature.tsx`,
  `components/InsightDiscoveryStudio.tsx`.
- Provider mode/model configuration: `lib/ai/config.ts`; model call and
  structured output: `lib/ai/openai-provider.ts`.
- Separate older creative perspective instructions:
  `lib/roundtable-prompts.ts` and `lib/ai/prompts.ts`.

## Verification scope and known gaps

This documentation is based on source inspection of the current repository;
it is not a claim that live provider requests were executed. No API was called
for this extraction. Current behavior is separated from UI descriptions and
the older creative-perspective path within each file.

The references identify function or constant entry points; implementation
continues beyond some cited lines. No secret values are included.
