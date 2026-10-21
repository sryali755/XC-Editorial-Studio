# Authorized live AI testing readiness

Branch: `insight-discovery-poc`. Baseline commit remains `9c8134a`. No commit, push or deployment.

## Outcome

The two handoff defects are corrected and the existing eight-agent provider paths are verified offline. Ready for **controlled, user-triggered live testing**, not a claim of verified live model output or account access. This task made **0 autonomous paid AI requests**. No request, restart, stop or build targeted localhost:3000; all execution used isolated copies under /private/tmp.

## Reproduced root causes and values

1. **Duplicate campaign fields:** structured extraction correctly preserved two identical source occurrences, and sourceValue joined them with two newlines. `studioPack` used one unique title, but Discovery compared it to that joined string. Thus valid Movers and Xfinity Pro requests failed the shared check before any provider invocation. The corrected validator and producer both derive unique identity from actual source occurrences. Raw sourceValue, occurrences and source snapshot are retained, not deduplicated or rewritten. Different titles are still conflicts.
2. **Campaign/adjacent metadata:** a title on the next line after `Campaign:` could be mistaken for an unlabeled PDF heading, producing an empty campaign occurrence. Plain parent-platform and JTBD labels were not field boundaries. The parser now handles the labeled title and those boundaries. Parser version is 5; cached earlier extraction is reparsed from the same source without deleting outputs.
3. **Original JTBD:** the producer joined multiple structured source spans; the validator used a different heading heuristic and required one contiguous combined quotation. The producer also treated proposed JTBD records as original. Both now use the same source-record extraction and original/proposed classification. Each record retains its exact excerpt, label and line. Proposals remain not_approved and do not populate original JTBD.

| Field / case                          | Before                                                                                | After                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate Movers source cells         | structured sourceValue = title + blank line + title; request = single title; rejected | exact source cells preserved; canonical request and expected identity are one identical source title; accepted                  |
| Duplicate Xfinity Pro source cells    | same mismatch                                                                         | same correction; accepted                                                                                                       |
| Labeled next-line title               | empty campaign occurrence possible                                                    | Movers – Campaign Extensions Refresh Brief                                                                                      |
| Parent platform                       | could bleed into adjacent metadata; no separate handoff                               | name Imagine That; sourceValue Xfinity. Imagine That.; exact excerpt and line preserved                                         |
| Two original JTBD sections            | each exact span, combined string rejected as absent                                   | both original records validated against current source; no fabricated combined quotation required                               |
| Proposed/internal-testing JTBD        | could be carried as original                                                          | original absent unless separately supplied; proposal retained separately as not_approved                                        |
| Original RTB / selected XC adaptation | separate but unrelated validation blocked Discovery                                   | still separate; exact RTB retained; approval unknown in the real fixtures; only selected adaptation transfers                   |
| Snapshot/version                      | old histories                                                                         | histories preserved; current foundation includes provenance and source records; stale context cannot overwrite current findings |

The actual 12-page client PDF and existing extracted text were exercised. It contains Movers and Xfinity Pro, **neither with a dedicated original JTBD**. Annotated derivatives explicitly add duplicate campaign labels, parent platform and proposed/internal-testing JTBD for the reported layout. The currently uploaded modified live-test document is not available as a separate filesystem fixture: this is not a claim to have inspected the user's live browser session or that exact modified binary. The en-dash title is preserved where supplied; original PDF hyphens are not changed into another campaign title.

Campaign metadata is derived from the IMC source, never from a selected Data Agent point. Research output also uses the canonical single campaign title while retaining the original structured source fields. Human-confirmed names remain explicitly human metadata only for genuinely unnamed sources and cannot replace supplied campaign identity.

## Eight agents and provider routing

| Agent                    | Mock + installed SDK parser/transport                       | Paid live generation      |
| ------------------------ | ----------------------------------------------------------- | ------------------------- |
| JTBD / Reason to Believe | PASS, both real campaign scopes                             | LIVE VERIFICATION PENDING |
| Data / Research          | PASS, both scopes                                           | LIVE VERIFICATION PENDING |
| Sparks                   | PASS, six structured source-grounded ideas in each scope    | LIVE VERIFICATION PENDING |
| Consumer                 | PASS, distinct existing prompt and shared selected snapshot | LIVE VERIFICATION PENDING |
| Culture                  | PASS                                                        | LIVE VERIFICATION PENDING |
| Category                 | PASS                                                        | LIVE VERIFICATION PENDING |
| Brand                    | PASS                                                        | LIVE VERIFICATION PENDING |
| Analogous Solutions      | PASS                                                        | LIVE VERIFICATION PENDING |

All use the existing POST /api/ai/agent, generateAgentResponse, generateOpenAI and Responses structured-output integration. The SDK request shape was checked against [official OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Model registration/configuration is unchanged: **OpenAI / gpt-5.5**. Discovery reasoning remains low; preparation retains its existing settings (no new reasoning override). No provider, model, sampling settings, retry policy or output budgets were changed.

Existing regressions cover human-triggered generation, all five distinct prompts, direct and finding conversations, go-deeper/challenge/more-answer actions, Talk to All, independent failures/retries, steering, selected source handoff, six Sparks, version restore, persistence, stale-response safety, and human-only approval. The four tabs and their labels remain Input Pack, Insight Discovery, Finalize Strategy and XC Brief.

## Actual verification

All commands ran in isolated copies with AI_MODE=mock, AI_PROVIDER=openai, OPENAI_API_KEY empty, XC_OFFLINE_TEST=1, and telemetry disabled. The test copies contain no .env files. Browser DNS restrictions and request interception block external access; the existing provider guard fails closed even if a test accidentally selects live mode. SDK tests use in-memory responses without a network client or real credential.

| Check                                                                        | Result                                                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Initial reproductions                                                        | 4 failing tests before corrections, including both exact reported errors                              |
| Focused handoff / R2 context regression                                      | 15 passed                                                                                             |
| Full AI/unit suite                                                           | **209 passed**, 0 failed, 0 skipped (23.0 s)                                                          |
| New real-PDF browser cases                                                   | **3 passed**: Movers, Pro and en-dash Movers with proposed JTBD (also included in full Discovery run) |
| Full Discovery browser suite, port 3281                                      | **75 passed, 5 skipped, 0 failed** (6.4 min)                                                          |
| Full legacy browser suite, port 3282                                         | **41 passed, 1 skipped, 0 failed** (2.5 min)                                                          |
| Optional supplied PDF/PPTX/DOCX tests rerun with source directory, port 3282 | **3 passed, 0 skipped** (7.7 s)                                                                       |
| TypeScript                                                                   | PASS                                                                                                  |
| ESLint                                                                       | PASS                                                                                                  |
| Production webpack build in isolated copy                                    | PASS                                                                                                  |
| Focused Prettier                                                             | PASS                                                                                                  |
| git diff --check in actual repository after patch                            | PASS                                                                                                  |
| Applied source hash comparison                                               | All 18 code/test files match verified isolated versions                                               |

**Unique passing tests: 328** (209 AI/unit + 75 Discovery browser + 41 legacy browser + 3 optional uploads). Focused reruns overlap those totals and are not counted twice. Five Discovery skips were the 3 local documents (subsequently executed and passed), the opposite-mode assertion (executed in legacy), and the opt-in screenshot-only walkthrough (XC_CAPTURE_SCREENSHOTS was not enabled). The one legacy skip was the Discovery-only assertion (executed in Discovery). No acceptance assertion was weakened. Only two existing test assertions changed, from parser version 4 to 5.

A non-failing dev-server/browser unhandledRejection [object Event] warning occurred during the initial focused browser run. No failed test or failed agent API response accompanied it. Exact cause remains unverified; this report does not call it resolved. Four previously documented unrelated repository-wide formatting failures were not reformatted.

### Exact commands

Run from the isolated copy, not the user's live worktree/server:

```sh
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-live-readiness-unit-final

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true NEXT_TELEMETRY_DISABLED=1 XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3281 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-live-readiness-discovery

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=false NEXT_TELEMETRY_DISABLED=1 XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3282 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-live-readiness-legacy

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true NEXT_TELEMETRY_DISABLED=1 XC_OFFLINE_BROWSER_MODE=discovery XC_IMPORT_SAMPLE_DIR='/Users/sryali755@cable.comcast.com/Library/CloudStorage/OneDrive-Comcast/Desktop/Creative Brief Agent' PLAYWRIGHT_PORT=3282 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/document-upload.spec.ts --grep 'local supplied source' --output=test-results-live-readiness-local-uploads

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 npm run typecheck
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 npm run lint
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack
git diff --check
```

## Live preflight (read-only configuration inspection)

Performed after the verification above. Existing .env.local: mode live, provider openai, model gpt-5.5 (registered), credential present, offline guard not enabled in that separately authorized local configuration, no custom provider base URL configured. No secret was printed or modified. This checks configuration, not credential validity, account balance, project permissions, model entitlement or live response quality. The running localhost:3000 process was not queried or restarted in this task.

The live banner now explicitly says LIVE AI / OpenAI, displays the server-configured model, and explains that Build Input Pack starts 3 agent requests and Start Roundtable Discussion starts 5. These are initial request counts, **not a billing counter or exact price estimate**. Provider repair and retry calls can add usage. Autonomous paid-call count for this task: **0**, not an assertion about other activity in the user's account.

Existing cost controls retained: explicit action only in the primary workflow; no model calls on page load/reload/tab navigation; per-agent duplicate-submission locks; SDK automatic retries disabled; at most 1 transient transport retry per completion, bounded backoff (maximum automatic delay 20 s); nonretryable quota/auth/permission/request errors stop; successful prior versions preserved. Discovery permits one output correction. Sparks can repair each of six invalid excerpts once, in addition to at most one structural/JSON correction. Therefore the theoretical maximum is 2 HTTP attempts for RTB or Research, 4 for one Discovery action, and 16 for one six-Spark generation. These existing bounds were not increased. Output-token caps: RTB 2500, Research 4500, Sparks 6000, each Discovery 4500; SDK timeout 120 s per attempt, route window 300 s, browser request window 310 s. This is not a guaranteed dollar spend cap, nor guaranteed provider availability.

Tableau, iSpot, ACE, Datorama, Brand Hub and Product / Audience Research remain not connected. Web/case-study research retrieval was not enabled. Kevin's strategy, manual edits, approval and frozen earlier versions remain human-controlled.

## Exact files changed in this task

| File                                               | Change                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| lib/imc-source-context.ts (new)                    | Shared source identity, original/proposed JTBD records and parent-platform provenance                              |
| lib/imc-parser.ts                                  | Next-line labeled campaign title and adjacent metadata/JTBD boundaries; parser v5                                  |
| lib/upstream.ts                                    | Reparse cached pre-v5 extraction                                                                                   |
| lib/studio-imc-records.ts                          | Parent-platform records; stop records at source metadata/page separators                                           |
| lib/discovery-studio.ts                            | Assemble separate original/proposed jobs and parent platform; common campaign identity                             |
| lib/discovery-context.ts                           | Carry explicit source/human identity and source jobs/platform; omit absent original JTBD                           |
| lib/types.ts                                       | Optional source-context metadata in Input Pack                                                                     |
| lib/ai/schemas.ts                                  | Strict optional source-context fields and safe model status                                                        |
| lib/ai/discovery-submission.ts                     | Source-derived canonical campaign comparison; record-aware job/platform validation; source/forgery checks retained |
| lib/ai/provider.ts                                 | Canonical single research campaign metadata, exact source fields retained                                          |
| lib/ai/discovery-prompts.ts                        | Explain new source/proposal distinction; prompt version v2.4; no lens redesign                                     |
| lib/ai/config.ts                                   | Include non-secret configured model in live status                                                                 |
| components/InsightDiscoveryStudio.tsx              | Explicit live mode/model and initial paid-request/cost-control notice                                              |
| components/DiscoveryInputPack.tsx                  | Do not label proposed source JTBD as original; separate parent platform; correct selected-adaptation label         |
| components/DiscoveryRoundTableV2.tsx               | Separate platform and unapproved source JTBD in shared context                                                     |
| tests/imc-parser.spec.ts                           | Only two parser-version expectations updated to v5                                                                 |
| tests/ai/live-handoff.spec.ts (new)                | 12 focused validation, provenance, eight-agent SDK and API regressions                                             |
| tests/strategy-studio-live-readiness.spec.ts (new) | 3 actual-PDF upload/eight-agent/reload/forgery regressions                                                         |
| docs/live-ai-readiness-verification.md (new)       | This report                                                                                                        |

## User steps for authorized live testing

1. In the existing browser, refresh the page (no server restart was performed). Confirm LIVE AI / OpenAI and the configured model are shown. If DEMO MODE is shown instead, stop before generating; a runtime configuration change would require separate permission to restart.
2. In Input Pack, upload/paste the intended brief and explicitly select its campaign if the source contains multiple briefs. Confirm campaign and parent platform are separate. A supplied proposed/internal-testing JTBD must appear as NOT APPROVED, never as original.
3. Click Build Input Pack for a new source. For existing saved results, regenerate individual preparation agents as needed, especially anything still labeled Demo or generated before the correction. These are explicit paid actions. Review all three outputs, six Sparks and source limitations; select only the adaptation, research and Sparks to carry forward. Do not approve source claims by implication.
4. Open Insight Discovery, enter the investigation question, and press Start Roundtable Discussion once. That starts all five lenses. Keep the tab open; successful outputs are retained if another agent fails. Retry only the failed lens after reading the actionable error.
5. Exercise conversations or research actions deliberately. They are additional paid generations, not new external research retrieval. Kevin alone edits and approves strategy in Finalize Strategy.

Stop here. No agents were auto-started and no autonomous live verification was performed.
