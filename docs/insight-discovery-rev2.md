# Insight Discovery — rev two

Implements the supplied meeting feedback on the existing `insight-discovery-poc` branch. No merge, push, new service, dependency, model change or reasoning-effort change. Localhost:3000 is left running while verification happens in an isolated source copy on port 3102 in mock mode.

## Interaction changes

- The default research screen shows Consumer, Culture, Category, Brand and Analogous Solutions agents in five desktop columns, headed “Agent Roundtable — Discovery Insights.” Each card explains its goal, perspective, output and public investigation rubric. The rubric is open by default. Narrow layouts stack the same cards.
- Human input is required in “What do you want the agents to investigate?” Problem exploration examines possible causes; hypothesis investigation seeks support, contrary evidence, competing explanations and disconfirming evidence. Mode-specific focus drafts are separate. No campaign objective silently becomes a user hypothesis. Suggested problem questions and earlier research focuses require an explicit choice.
- Every selected agent receives the full current input pack and human focus. Results, messages, challenges and conversations stay beneath the relevant agent. A shared focus can be sent to all enabled agents. Expand opens one agent; Show all five agents restores the overview.
- Save to Working space, Set aside for later, comparison selection and exact source inspection retain the existing version references. Cross-agent routing is removed from the primary screen; depth, contrary evidence, audience, recency and input comparison remain available.
- Working space is a closed-by-default, right-hand modal drawer. It contains notes, saved/aside findings, comparison and the human whole-brief canvas. Escape/Close dismisses it and returns focus; body scrolling is locked while it is open. Whole brief navigation opens the same drawer. Human approval and final packaging keep their existing immutable snapshots.
- Research updates and source-excerpt counts are labeled separately. Historical selections no longer claim to be the latest perspective. Friendly input-pack revision labels replace hashes in the primary header; internal fingerprints still control staleness and provenance.

The old optional Discovery overlay at `/creative` keeps its interaction model. No protected legacy creative source or legacy creative specification was edited for this revision.

## Real supplied IMC sample

Input pack offers “Load Kevin’s supplied IMC brief.” It stages the complete **Ecosystem — Campaign Extensions** brief from pages **7–9** of `Imagine That - Campaign Extensions IMC Briefs.pdf`, previously supplied by the user. Applying it requires Update input pack; existing user work is not overwritten automatically. The fictional test sample remains separately labeled.

`lib/samples/kevin-imc.json` records the original filename, page range, original-file SHA-256 and original page text. `scripts/extract-imc-sample.mjs` extracts this specific brief, separates PDF table cells/columns and renders the three original pages for visual QA. It fails on an unexpected layout. The fixture is not LLM-written. PDF line breaks and minor original extraction artifacts remain; exact-quote checks use the complete extracted input text. The raw PDF and QA images are not added to the application.

Parser inspection found that Background and source-page boundaries could be absorbed into Campaign, and the tactic-specific RTB heading needed recognition. These are now delimited/recognized without rewriting the source. Business and communication objectives remain separate source occurrences within the existing objective field. The original RTB referral, full tactic list and qualifications are preserved. Historical supplied product claims are not current substantiation; approval remains unknown without an explicit approval field.

No external research retrieval is added. Tableau, iSpot, ACE, Datorama, Brand Hub and web/case-study retrieval remain unavailable unless authorized source material is supplied. See [connector status drafts](connector-status-updates.md) for the two requested updates.

## Verification

| Check                                      | Result                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| AI / contract tests                        | 66 passed, including four new rev-two checks.                                                                  |
| Discovery-enabled browser suite            | 9 passed; the flag-off entry assertion was correctly skipped.                                                  |
| Final primary UI rerun after layout polish | 5 passed.                                                                                                      |
| Full legacy browser suite, flag off        | 41 passed; 9 Discovery-enabled cases were correctly skipped. No legacy specifications were edited or disabled. |
| Typecheck                                  | Passed.                                                                                                        |
| Lint                                       | Passed, no warnings.                                                                                           |
| Production build, Discovery on             | Passed; `/`, `/creative`, `/api/ai/agent` compiled.                                                            |
| Visual QA                                  | Desktop five-column, focused-agent and desktop/mobile drawer screenshots inspected.                            |

All generation checks use deterministic mocks or simulated SDK transport; no paid live request was made. Live provider availability is not established by these mock tests. The first acceptance run exposed tests still trying to navigate through the modal drawer; those tests now close it explicitly. An exact help-copy assertion was corrected. The final UI rerun passed without weakening evidence or replacement validators.

The tested source was applied to the actual XC Editorial Studio repository, excluding environment files, dependencies, build output, raw PDFs and extraction QA images. Localhost:3000 returns HTTP 200 and its served client assets contain the rev-two roundtable and Working space drawer. Public configuration remains live/OpenAI. The existing process (PID 31829) was not restarted.

After application, `git diff fc4dfd3^ --stat` over the previously protected legacy source/specification list is empty; `git diff --check` passes. Work remains uncommitted on `insight-discovery-poc`; nothing was pushed or merged. Existing uncommitted work was preserved.

## Files changed in this revision

- `app/page.tsx`, `app/discovery-v2.css`: load scoped primary-mode styling.
- `components/DiscoveryRoundTableV2.tsx`: five-agent research view and Working space drawer.
- `components/DiscoveryInputPack.tsx`, `components/InsightDiscoveryStudio.tsx`: real supplied sample, primary wording and readable pack revisions.
- `components/InsightDiscoveryFeature.tsx`, `components/InsightDiscoveryWorkspace.tsx`: page-specific orchestration and reuse of the existing notes/canvas inside the drawer; old overlay behavior remains available.
- `lib/types.ts`, `lib/discovery-studio.ts`: optional focus/display state and readable pack labels; original fingerprints retained.
- `lib/ai/discovery-prompts.ts`: explicit problem/hypothesis investigation instructions.
- `lib/imc-parser.ts`: source-style section boundaries and RTB/creative-considerations heading recognition.
- `lib/samples/kevin-imc.json`, `scripts/extract-imc-sample.mjs`: attributed real-source fixture and reproducible source-specific extraction.
- `tests/discovery-studio.spec.ts`, `tests/discovery-rev2.spec.ts`, `tests/ai/discovery-rev2.spec.ts`: primary-flow adaptations and new acceptance/contract coverage.
- `docs/connector-status-updates.md`, this report: requested status drafts and implementation/verification notes.
