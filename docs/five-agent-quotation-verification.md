# Five-agent quotation contract correction

Branch: `insight-discovery-poc`. Scope: the shared Discovery prompt, evidence diagnostics, and focused regression coverage. Existing dirty/untracked work is preserved. No commits, pushes, deployments, credential changes, or restart/access of localhost:3000.

## Cause and correction

The screenshot errors are application-level `discovery_evidence_validation_failed` rejections, not evidence of an authentication or quota failure. One unsupported quoted phrase in any finding rejects that agent's new response. Successful agents execute independently.

The previous prompt explicitly discussed quotation restrictions mainly for title/whatWeFound, while the validator checks every prose field, including interpretation, limitations, questions, and citation context. The error then suggested moving a hypothesis to interpretation, even though that field was checked too. Repair feedback named a finding but not the offending field or phrase. A hypothetical label in quotation marks reproducibly caused the same rejection as invented testimony.

The shared prompt now specifies the quotation contract for **all fields**, instructs the model to write hypothetical labels in unquoted, explicitly tentative prose, and requires any literal quotation to occur exactly in that finding's own evidence excerpt. Repair feedback identifies the field and a JSON-escaped phrase preview capped at 140 characters before escaping. It remains bounded, untrusted diagnostic input, not system instructions. Unsupported statistics get a separate corrective instruction. Discovery prompt version is `insight-discovery-v2.5`.

**Validation is not weakened.** The exact-quotation matcher, attached-excerpt requirement, source identity, locator, campaign isolation, statistical checks, and research-gap rules are retained. No code strips quotation marks, invents substitute findings, attaches unsupported citations, or silently substitutes mocks for live failures. The actual rejected live payloads were not supplied, so this report does not claim that every original live failure was a false positive.

The existing one-output-correction limit remains unchanged. A valid first response uses one completion; a response requiring correction can use the existing second completion. Repeated invalid output still fails honestly and preserves previous work. Model, low reasoning effort, token budgets, provider retries, UI, navigation, and workflow are unchanged.

## Five roles retained

| Lens                | Responsibility                                                                                    | Offline result |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| Consumer            | Audience behavior, motivation, barriers and differences; source claims are not customer research  | PASS           |
| Culture             | Wider norms, rituals, behaviors and cultural questions; no invented trends                        | PASS           |
| Category            | Competing alternatives, category conventions and documented claims; no invented rival offers      | PASS           |
| Brand               | Promise, proof, eligibility, substantiation and approval limits                                   | PASS           |
| Analogous Solutions | Supplied documented comparable cases and transferability; a precise research gap when none exists | PASS           |

All five retain their distinct existing role assignments and receive the same current selected Input Pack and human question. A truthful research gap is a valid result, not failed generation or permission to fabricate research.

## Verification

Full-suite executions used isolated copies `/private/tmp/xc-five-agents.SVACzp` and `/private/tmp/xc-five-agents-regression.qfioqz`, excluding `.env*` and application build output, with existing installed dependencies. Test processes explicitly forced `AI_MODE=mock`, `AI_PROVIDER=openai`, empty `OPENAI_API_KEY`, and `XC_OFFLINE_TEST=1`. No real provider client was allowed through the offline guard. In-memory model clients exercised the existing Responses parsing, validation, and correction path without HTTP transport. Browser servers used ports **3297** and **3298**, mock mode, empty keys, and the server-side offline guard; existing Chrome tooling was used.

After applying the targeted patch, all five files were checked byte-for-byte against the tested copy. The new 23-case quotation regression was also rerun from the actual repository in a credential-free offline process: **23 passed**. Its output directory was /private/tmp/xc-five-agents.SVACzp/test-results-applied-quotation; no application server was used.

- New AI regression spec: **23 passed**, covering all five lenses across actual Movers/Xfinity Pro extracted fixtures and the illustrative Mobile sample, valid first responses, corrective feedback, unmodified source/context, invented testimony rejection in all prose fields, correct quoted evidence, invalid locators/sources/statistics, and bounded untrusted diagnostics. These are deterministic simulated model outputs, not live model-quality measurements.
- Focused combined quotation/provenance/mock-retry/offline-guard run: **45 passed** (overlaps the full AI suite).
- Full AI/unit suite: **232 passed**, **0 skipped**.
- New browser regression: all five initially succeed; Culture, Category, and Analogous then encounter the actual quotation validator's error; their prior findings remain visible; each independently retries successfully without rerunning Consumer/Brand. Saved findings, comparison selection, version restoration, and reload persistence remain intact. Passed in focused and full Discovery runs.
- Full Discovery browser suite: **80 passed, 5 skipped**. Three optional local-document cases require `XC_IMPORT_SAMPLE_DIR`; one flag-off assertion is covered in the legacy run; one opt-in screenshot walkthrough is not an acceptance test and was not enabled.
- Full legacy browser suite: **41 passed, 1 skipped** (the flag-on test is covered in the Discovery run).
- Typecheck: **PASS** (`--incremental false`, also checked by production build).
- Lint: **PASS**.
- Production webpack build: **PASS**, only in the isolated regression copy.
- Formatting of all changed code/spec files: **PASS**.
- Repository-wide Prettier: the same four pre-existing failures remain untouched: `lib/ai/perspective-quality.ts`, `tests/fixtures/client-input-pack/imagine_that_expected_input_pack.json`, `tests/fixtures/client-input-pack/imagine_that_offline_validation_report.md`, and `tmp-dump.mjs`.

Unique full-suite passing tests: **353** (232 AI/unit + 80 Discovery browser + 41 legacy browser). Focused reruns are not added to this count. Six full-suite skip events have the reasons above; one opposite-mode assertion in each suite executes in the other mode.

Initial browser startup was denied local port binding by the sandbox; the same mock-only command ran successfully with permission for the isolated test port. An initial incremental typecheck overlapped dev-server regeneration of `.next/dev/types` and reported missing generated files; non-incremental checks after generation and the production build passed without changing application configuration or code to bypass checks.

## Commands

All commands were run from the isolated copies, not the running application's build directory.

```sh
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS=--conditions=react-server NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/playwright test -c playwright.ai.config.ts tests/ai/discovery-quotation-repair.spec.ts tests/ai/discovery-provenance-claims.spec.ts tests/ai/requirement2-mock-retry.spec.ts tests/ai/offline-guard.spec.ts --output=test-results-quotation-after

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS=--conditions=react-server NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/playwright test -c playwright.ai.config.ts --output=test-results-five-agents-ai

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3297 ./node_modules/.bin/playwright test -c playwright.offline.config.ts tests/discovery-quotation-retry.spec.ts --output=test-results-quotation-browser

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true XC_OFFLINE_BROWSER_MODE=discovery PLAYWRIGHT_PORT=3297 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-five-agents-discovery

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=false XC_OFFLINE_BROWSER_MODE=legacy PLAYWRIGHT_PORT=3298 ./node_modules/.bin/playwright test -c playwright.offline.config.ts --output=test-results-five-agents-legacy

env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 npm run typecheck -- --incremental false
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 npm run lint
env AI_MODE=mock AI_PROVIDER=openai OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run build -- --webpack

./node_modules/.bin/prettier --check lib/ai/discovery-evidence.ts lib/ai/discovery-prompts.ts tests/ai/discovery-quotation-repair.spec.ts tests/discovery-quotation-retry.spec.ts
./node_modules/.bin/prettier --check app components lib tests '*.ts' '*.mjs' '*.json'
```

## Files changed in this task

1. `lib/ai/discovery-prompts.ts`: consistent all-field quotation instructions and corrective feedback; prompt version bump; five distinct roles retained.
2. `lib/ai/discovery-evidence.ts`: actionable field/phrase diagnostics and separate quote/statistic correction; no relaxation of acceptance rules.
3. `tests/ai/discovery-quotation-repair.spec.ts`: new 23-case deterministic provider/validation regression spec.
4. `tests/discovery-quotation-retry.spec.ts`: new five-agent independent retry/persistence browser regression.
5. `docs/five-agent-quotation-verification.md`: this report.

No legacy assertions were weakened or edited. The separate unfinished brief-packaging work was not applied as part of this correction.

## Live use / remaining verification

**LIVE VERIFICATION PENDING.** Autonomous paid AI calls: **0**. No user browser session or live server was used for testing. Provider availability, actual model compliance, quota, credentials and account permissions cannot be certified by offline tests or guaranteed on every attempt. Persistently invalid output must continue to fail visibly rather than be called a successful result.

Refresh the browser to pick up source changes, then retry only the failed Culture, Category and Analogous agents. The existing Input Pack does not need rebuilding solely for this quotation-contract issue. Successful Consumer/Brand results and saved selections remain preserved. Previous error messages are historical stored state and are replaced only when that lens is retried successfully. No autonomous live retry was performed.
