# Gateway JTBD and RTB correction — 2026-10-22

Branch: `insight-discovery-poc`. Existing worktree changes were retained.

## Confirmed causes

1. The actual `Gateway IMC Brief KM.docx` uses `RTBs:`. The canonical parser recognized `RTB` but not this plural heading. Its structured original RTB was therefore absent despite the Word document containing four proof points. `preserveSource()` correctly follows structured source status and consequently cleared the adaptation. This was an extraction defect, not proof that the model could not propose an adaptation.
2. The combined JTBD/RTB card requested and stored RTB adaptation but had no separate generated JTBD field. Original JTBD absence and proposed JTBD generation were conflated in the presentation.
3. The RTB schema allowed null/empty adaptations and readiness did not reject these when original proof was supplied. The inclusion checkbox could display a selected version without a usable proposal.
4. The first correction introduced an overly strict sentence-pattern check. It rejected valid variations such as “When my…”, “I want clarity…”, “so that I can…”, contractions and narrative descriptions. The user's screenshot confirms this validation branch rejected a new build; the actual rejected model wording was not captured, so its exact variation is unknown. The transactional builder retained the previous workspace, explaining why the card still displayed an older missing-JTBD version and an RTB/source mismatch after extraction had been corrected.

## Corrected behavior

- `RTBs` and `Reasons to Believe (RTBs)` are recognized. Parser version 6 causes cached older extractions to be re-read from the original source text without rewriting it or erasing saved drafts.
- New RTB model responses require a separate `proposedJTBD` property. The agent prompt requires an audience job when sufficient audience/objective context exists. “When I…, I want to…, so I can…” is guidance; natural wording is accepted verbatim. Insufficient context remains a declared evidence gap. No production fallback text is inserted. Prompt version: `xc-rtb-3.3`.
- The original JTBD remains in source records; selected generated JTBD is separate, unapproved interpretation. RTB adaptation remains separate from both JTBD and original RTBs.
- New output is rejected if supplied proof has no adaptation, sufficient audience/objective context has no proposed job, or the job is only placeholder text or a copied campaign objective. Source and schema validation remain active. Sentence formatting does not block a complete proposal. No automatic paid repair call was added.
- Invalid/empty proposals cannot appear selected or transfer to the Dynamic Input Pack. A legitimate proposed job can transfer when RTBs are absent, without manufacturing proof.
- Selection, model context, pack versions and new-draft Working Space prefill carry the selected job. Rebuilding does not silently select a changed job just because the RTB adaptation is identical.
- New human Brief Lines remain blank. Existing human text, intentional empty fields, versions and approvals are not backfilled or cleared.
- Legacy saved RTB versions remain readable without the new property; regeneration is explicit.

## Evidence and final results

| Check                                                                                 | Result                              |
| ------------------------------------------------------------------------------------- | ----------------------------------- |
| Actual supplied DOCX text vs local Gateway fixture, normalized for whitespace         | PASS                                |
| Gateway field extraction and all four RTBs                                            | PASS                                |
| Deterministic Responses-client generation path, strict schema and source preservation | PASS                                |
| Missing/placeholder proposal rejection, no fabricated replacement                     | PASS                                |
| Selected JTBD handoff through all five Discovery request contracts                    | PASS                                |
| Separate original/proposed JTBD; missing original proof remains absent                | PASS                                |
| Saved human text and versions; blank new Brief Line; campaign isolation               | PASS                                |
| Full AI/unit suite                                                                    | **353 passed; 0 failed; 0 skipped** |
| Phase 1 component/rebuild suite                                                       | **24 passed; 0 failed; 0 skipped**  |
| TypeScript `--noEmit --incremental false`                                             | PASS                                |
| Repository ESLint                                                                     | PASS                                |
| Prettier on all changed code/test files                                               | PASS                                |
| `git diff --check`                                                                    | PASS                                |

The component harness was updated to pass the required Discovery state and inspect the actual shared Dynamic Input Pack component. One existing assertion was scoped to the seven selected-context fields, excluding the separate source-status definition list. Assertions about source content, selections, failures and isolation were retained.

The follow-up adds six model-response phrasing variants, five placeholder rejection cases, and a recovery test reproducing the screenshot state. That test starts with a saved pre-fix version, verifies a truly missing job still fails atomically, then verifies a natural-language job passes the real offline provider path and a fresh rebuild. Original proof is restored from source, selection carries the exact generated job, and the human Brief Line remains blank. The focused Gateway suite passed all 23 tests. Typecheck, changed-file ESLint, formatting and diff checks passed again.

Files changed specifically for the sentence-validation follow-up: `lib/ai/rtb-quality.ts`, `lib/ai/workflow-prompts.ts`, `lib/ai/prompts.ts`, `tests/ai/gateway-jtbd.spec.ts`, and this report.

## Reproduction commands

All commands ran from the XC repository. No `.env` or credential file was edited.

```sh
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
XC_GATEWAY_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' \
NODE_OPTIONS='--conditions=react-server --require ./tests/helpers/phase1-no-api.cjs' \
./node_modules/.bin/playwright test -c playwright.ai.config.ts \
--output=/private/tmp/xc-jtbd-phrasing-all-ai

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' \
./node_modules/.bin/playwright test -c playwright.phase1.config.ts \
--output=/private/tmp/xc-jtbd-phrasing-components

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' \
./node_modules/.bin/tsc --noEmit --incremental false

AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 \
NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' \
./node_modules/.bin/eslint .
```

The preload rejects fetch, HTTP(S), and socket connections. SDK transport tests use deterministic in-memory responses. No live provider, research source, or localhost:3000 endpoint was called. New application AI API usage: **$0**.

## Files changed for this correction

Production:

- `components/DiscoveryInputPack.tsx`
- `components/DynamicInputPackDetails.tsx`
- `lib/ai/context.ts`
- `lib/ai/discovery-prompts.ts`
- `lib/ai/format.ts`
- `lib/ai/mock-provider.ts`
- `lib/ai/openai-provider.ts`
- `lib/ai/prompts.ts`
- `lib/ai/provider.ts`
- `lib/ai/rtb-quality.ts` (new)
- `lib/ai/schemas.ts`
- `lib/ai/workflow-prompts.ts`
- `lib/campaign-rebuild.ts`
- `lib/discovery-studio.ts`
- `lib/imc-parser.ts`
- `lib/input-pack-presentation.ts`
- `lib/preparation.ts`
- `lib/types.ts`
- `lib/upstream.ts`
- `lib/workspace-canvas-prefill.ts`
- `lib/workspace-suggestions.ts`

Tests and documentation:

- `tests/ai/gateway-jtbd.spec.ts` (new)
- `tests/ai/provider.spec.ts`
- `tests/helpers/phase1-component-harness.ts`
- `tests/phase1/dynamic-pack.spec.ts`
- `tests/phase1/jtbd-proposal.spec.ts` (new)
- `tests/fixtures/client-input-pack/gateway_source_text.txt` (new local fixture; remains ignored under the existing client-fixture privacy rule)
- `docs/gateway-jtbd-verification.md` (this report)

Other pre-existing modified files were not part of this correction.

## Remaining limits and use

Live generation is **LIVE VERIFICATION PENDING**. Offline tests verify the request, response schema, validation and state transitions; they do not guarantee live output quality for every brief. Inadequate briefs must show specific gaps instead of invented facts. This pass did not perform browser visual verification, a production build or deployment.

The existing development server was not restarted or interrupted. Existing saved V0 responses are not silently replaced. After loading the updated UI, explicitly regenerate the JTBD/RTB agent and select its proposals to carry them forward. Such an action uses the server's configured AI mode; this implementation pass did not trigger it. Existing saved Working Space edits remain unchanged.
