# Phase 2 — Insight Discovery / Round Table verification

Date: October 19, 2026. Repository: XC Editorial studio. Branch: insight-discovery-poc.

Scope: Phase 2 only. No Phase 3 migration, automatic brief-line generation, provider replacement, credential changes, commit, push or deployment. All verification is offline/mock; it is not live-model validation or a claim of glitch-free production behavior.

## A. Architecture findings

The existing pipeline was reused:

Selected Dynamic Input Pack + Kevin's question → InsightDiscoveryFeature → five independent Discovery requests → source-qualified structured findings → regeneration or conversation → explicit saved references → existing Working Space / approved strategy.

| Responsibility                                         | Authoritative implementation/state                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Four tabs, campaign restoration and persistence        | components/InsightDiscoveryStudio.tsx; DiscoveryStudioSession; source-scoped DiscoveryState; session storage and IndexedDB       |
| Selected campaign, RTB adaptation, research and Sparks | lib/discovery-studio.ts studioPack; immutable inputPackSnapshot on each generation                                               |
| Investigation question / mode                          | DiscoveryState.question, focusByMode, investigationType; local suggested questions in lib/discovery-questions.ts                 |
| Five independent requests, cancellation and retries    | components/InsightDiscoveryFeature.tsx runLens / refreshAll; per-agent AbortControllers                                          |
| Production provider boundary                           | lib/discovery.ts generateDiscoveryVersion → lib/ai/discovery-client.ts; existing schemas, prompts and server validation retained |
| Current findings and history                           | DiscoveryState.runs[].versions / currentVersionId                                                                                |
| Conversations                                          | runs[].thread and findingThreads[exact reference]; turnId/threadId and source context                                            |
| Saving / comparing / setting aside                     | savedFindingIds / selectedFindingIds / asideFindingIds; refs are finding ID + generation number                                  |
| Human strategy and approvals                           | Existing DiscoveryState canvas, fieldVersions and explicit approval snapshots; not migrated                                      |

Confirmed gaps before this change: opening history or inspecting a saved finding changed currentVersionId; compact cards lacked distinct accessible histories and per-agent heading regeneration; Ask used the same completion transition as regeneration and promoted its response to structured history. A late result after a campaign switch could be archived into the newly active campaign. Generation and conversation state transitions needed separation, not a new agent implementation.

## B. Implemented changes

- Source/question/mode-scoped current findings. An unrun investigation shows Awaiting Exploration; previous context remains explicitly accessible as history, not fresh output.
- Compact Regenerate beside each agent heading. Expandable steering is persisted independently from the Ask composer. Editing either input never triggers a request.
- Regeneration creates one structured version for the requested agent. Conversations retain the existing validated model contract but format the reply into the correct thread without adding or activating a findings generation. Finding-specific replies exclude unchanged unrelated findings.
- Independent, default-collapsed Generations and Conversations on every compact card. Generation history sorts newest-first; conversation turns pair Kevin/agent messages, sort newest-first, and show generation/finding context and evidence limitations.
- Viewing history is presentation-only. The existing ability to activate an older version is retained as an explicit Make viewed generation current action, allowed only for the current investigation context.
- Existing per-version finding paging retained, including zero/one-finding handling and stable positions when revisiting versions.
- Saved references remain immutable and version-specific. Working Space now visibly labels their generation. Compare does not save or approve. The retained set-aside field has a compact action within finding details; restoration uses the existing Working Space list and never deletes historical output or silently removes saved references.
- Cross-campaign late successes/failures are discarded rather than published into another campaign. Same-campaign earlier-context answers remain historical only. Older pending completions/failures cannot clear a newer pending request. Failed/invalid/partial responses never become valid history versions.
- No destructive migration: optional operation/context/steering fields keep historical records readable. Untouched restored drafts do not acquire a new empty steering object. Human text, intentional empty fields, field versions, saved findings, notes and approvals remain intact.

## C. Exact source/test files changed

Modified:

1. app/discovery-v2.css — scoped compact heading/history/steering and responsive text styles.
2. components/DiscoveryRoundTableV2.tsx — scoped statuses, individual regeneration, separate histories, view-versus-activation, conversation context and existing set-aside action.
3. components/InsightDiscoveryFeature.tsx — bound operation/generation context; campaign and late-response protection; explicit batch generation.
4. components/InsightDiscoveryWorkspace.tsx — shared onRunLens request type accepts the backward-compatible operation metadata.
5. components/WorkingSpace.tsx — one provenance tag displaying the saved finding's generation; no workspace redesign.
6. lib/discovery-state.ts — separate generation/conversation transitions, qualified replies and safer historical/failure handling.
7. lib/discovery.ts — optional explicit generation context reuses the existing previousVersion model contract.
8. lib/types.ts — optional operation, response/generation context and regeneration-draft metadata.

Added:

9. lib/roundtable-history.ts — read-only campaign generation filtering and paired conversation projection; no duplicate persisted history store.
10. tests/fixtures/phase2-roundtable.ts — deterministic source-based Movers/Pro fixtures.
11. tests/ai/phase2-roundtable.spec.ts — eight state/history/provenance/persistence safety tests.
12. tests/helpers/phase2-feature-harness.ts — actual feature orchestration with an injected local generation boundary.
13. tests/phase2/orchestration.spec.ts — six actual-feature tests, including delayed cross-campaign success/failure and legacy conversation retry.
14. tests/phase2/roundtable.spec.ts — fourteen guarded real-browser scenarios.
15. playwright.phase2.config.ts — isolated port 3179, installed system Chrome; no automatic server reuse/start.
16. playwright.phase2-components.config.ts — browser-free orchestration suite.
17. docs/phase2-roundtable-verification.md — this report; screenshots/results are generated under docs/phase2-roundtable/.

## D. Data integrity

Versions retain their original findings, source snapshot, question, provider and source coverage. Saved V2 references still resolve to V2 after V3+; different generations with identical titles retain different references. Viewing does not change active data. Conversation response IDs are separate from their source generation IDs and do not enter the saved shortlist automatically. Source identity and pack-version checks remain enabled. No original IMC text or campaign facts were edited.

Working Space and Finalize Strategy continue to use their existing state and approval snapshots. Brief Line remains human-owned: no new suggestion or Spark insertion. Navigation/reload tests preserve exact human text and notes.

## E. Verification

Final candidate results (no skips or flaky passes):

| Check                                                               | Result     |
| ------------------------------------------------------------------- | ---------- |
| Entire existing offline AI/state suite plus eight new Phase 2 cases | 315 passed |
| Existing Phase 1 component tests, unchanged                         | 12 passed  |
| New actual-feature orchestration tests                              | 6 passed   |
| Mocked real-browser tests                                           | 14 passed  |
| TypeScript                                                          | PASS       |
| Repository ESLint                                                   | PASS       |
| Changed-file Prettier                                               | PASS       |
| Isolated optimized production build, webpack                        | PASS       |

347 distinct tests across the four suites. Repeated development/recheck runs are not added to this total.

| Required scenario          | Evidence                                                                                                               | Result |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| A New investigation        | Five empty cards; editable question; selected source context; no dispatch on mount                                     | PASS   |
| B Independent loading      | Consumer pending; other four remain enabled and retain findings                                                        | PASS   |
| C Independent regeneration | Exact steering/lens/pack; one new version; other runs and saved references unchanged                                   | PASS   |
| D Structured history       | Five generations newest-first; view without activation; explicit activation; disclosure/paging preserved               | PASS   |
| E Conversation history     | Three correctly paired turns; generation/finding context; retained on reload                                           | PASS   |
| F Distinct operations      | Regenerate adds history; Ask only adds conversation; both mocked                                                       | PASS   |
| G Finding navigation       | Two-finding paging and per-version position; zero/one boundaries                                                       | PASS   |
| H Saved provenance         | Saved displayed V2 finding 2 retained after regeneration; exact refs and visible generation                            | PASS   |
| I Compare/save/aside       | Two compared findings do not save; explicit save/aside/restore preserve original history                               | PASS   |
| J Campaign isolation       | Movers/Pro fixtures; source-scoped restoration; actual feature discards delayed cross-campaign success/failure         | PASS   |
| K Navigation               | Input Pack → Discovery → Finalize Strategy → Discovery; reload; histories and human text preserved                     | PASS   |
| L Failure/retry            | Partial batch failure, conversation failure, invalid structured output; scoped retries; earlier valid history retained | PASS   |
| M Phase 1                  | Existing 12 component tests plus Input Pack/extraction/source fidelity/Spark/RTB regressions in the 315-test suite     | PASS   |

### Commands

Use a disposable repository copy without .env files; reuse installed node_modules. The temporary copy used webpack because Turbopack rejects node_modules symlinks outside its project root. No dependencies were installed. The existing localhost:3000 process was not used for generation or restarted.

```sh
# Offline model/state suite (transport denied before test modules load)
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs --conditions=react-server' ./node_modules/.bin/playwright test -c playwright.ai.config.ts

# Existing Phase 1 and new feature/component suites
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase1.config.ts
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase2-components.config.ts

# Separate offline server, in the disposable copy only
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3179
# In a separate process, with that guarded server running:
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/playwright test -c playwright.phase2.config.ts

# Stop only the disposable server before building that same temporary copy
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/next build --webpack
env AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 ./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint .
```

### Offline and browser evidence

Server/test children use AI_MODE=mock, an empty OPENAI_API_KEY and XC_OFFLINE_TEST=1. The pre-existing test-only network preload rejects fetch/HTTP/socket connections. Browser tests refuse port 3000, assert offline flags, use disposable storage, and intercept every agent POST with deterministic local data. Only GET /, local Next static assets, favicon and the exact local /_next/hmr socket are allowed. Other paths/origins are blocked; service workers/background networking are disabled. This preserves Next hydration without opening AI endpoints.

Final browser network audit: 14 mocked responses; zero agent POSTs forwarded to the server; zero page errors. The only blocked page resource was the external Google Fonts stylesheet; fallback fonts rendered. No paid API calls or external research were made. No live-provider reliability claim is made.

Visuals executed at 1440×900, 390×844 and 820×1180. Empty and completed states, heading alignment, steering, history viewing, expanded paired conversations, source attribution and document overflow checks passed. Mobile tabs retain their existing scrollable navigation. Screenshots were inspected, not only produced. Next's development indicator is visible on some screenshots; it is not production UI.

Initial development failures were resolved: two Working Space restoration comparisons caught an added empty regeneration-draft object, which was removed; new browser tests initially assumed three findings where the actual deterministic fixture has two, used an incorrect textbox label, and missed the saved-count suffix on Open Working Space. Those new tests were corrected to the actual fixture/accessibility contract. No existing Phase 1 or legacy assertions were weakened.

Repository-wide Prettier still reports four pre-existing unrelated files, left unchanged:

- lib/ai/perspective-quality.ts
- tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json
- tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md
- tmp-dump.mjs

This is not a claim that every historical browser suite passes. Several legacy suites still assume removed Phase 1 sample loaders or earlier UI labels. The current fixture-based Phase 2 browser suite and the entire existing offline state suite were executed. Live generation, external connectors and live research remain intentionally unverified.

## F. Screenshot artifacts

Generated verification artifacts, relative to this report:

- phase2-roundtable/desktop-empty.png
- phase2-roundtable/mobile-empty.png
- phase2-roundtable/desktop-completed.png
- phase2-roundtable/mobile-completed.png
- phase2-roundtable/tablet-completed.png
- phase2-roundtable/desktop-histories.png
- phase2-roundtable/mobile-histories.png
- phase2-roundtable/desktop-generations.png
- phase2-roundtable/mobile-conversation.png
- phase2-roundtable/saved-source-attribution.png
- phase2-roundtable/browser-results.json
- phase2-roundtable/ai-results.json

## G. Open product decisions

Saving an answer directly from conversation as a creative consideration still needs product approval; no new promotion workflow was invented. Older-generation activation was already supported and is now explicit rather than an incidental effect of viewing. Activation of another investigation's historical generation is deliberately disabled; Kevin can inspect it or return to that context.

## H. Phase 3 readiness

The existing shortlist can supply exactly the selected finding refs, their agent/generation, original content, evidence, question and source snapshot. It does not silently include every generated finding or conversation answer. This is ready as an input to Phase 3 design, not an authorization to migrate now.

The future migration must preserve source-scoped storage keys, human strategy fields (including intentional blanks), field version histories, notes, pack snapshots and immutable approved strategy snapshots. Working Space currently owns selection inspection, aside restoration and comparison presentation; migrate those dependencies deliberately rather than duplicating their state. Phase 3 has not been started.
