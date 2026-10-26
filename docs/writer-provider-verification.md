# Writer default-provider integration

Date: 2026-10-26. Branch: `insight-discovery-poc`.

## Outcome

Writer is now the default live provider. The existing local configuration's non-secret `AI_PROVIDER` setting was changed from `openai` to `writer`. Its `AI_MODE=live` setting was already present. Neither API key was changed, printed, or returned to the browser. No existing server was restarted or accessed, including port 3000. No subscription, billing configuration, commit, push, deployment, or dependency installation was performed.

The model default is `palmyra-x5`, overridable with `WRITER_MODEL` after a verified capability registration. The user's answer, “palmyra,” identifies a family rather than an exact API model version. X5 was selected because Writer explicitly documents JSON-schema structured output and an 8,192-token output limit. API access and subscription coverage have **not** been checked. Writer announces X5 deprecation on December 14, 2026; verify a successor's API capabilities before migration.

An API key does not prove unlimited API entitlement. Writer documents token pricing and rate limits. The application cannot grant an unlimited subscription. A live-test spending cap was requested; the model-family answer did not specify one. Consequently, **zero live AI requests were made**. This report does not claim real-model output quality, authentication success, available credits, or unlimited access.

Official references:

- [Chat API](https://dev.writer.com/api-reference/completion-api/chat-completion)
- [Structured outputs](https://dev.writer.com/home/structured-output)
- [Models and limits](https://dev.writer.com/home/models)
- [Pricing](https://dev.writer.com/home/pricing)

## Implementation

- Native server-only Writer adapter: fixed `https://api.writer.com/v1/chat` endpoint, bearer authentication, no redirects, no tools or external research, JSON-schema responses, existing prompts and output budgets, 120-second timeout.
- All initial generations and existing bounded validation repairs use the selected provider. There is no OpenAI fallback on Writer failure.
- Source reconciliation, exact excerpt checks, separate original/proposed JTBD and RTB, campaign isolation, and human approval rules remain unchanged.
- Writer responses carry `provider: "writer"` through server, browser response contracts, finding provenance, and version types. Existing OpenAI and mock records remain valid.
- Writer does not receive OpenAI-only reasoning/verbosity parameters. Unsupported model IDs or settings fail explicitly.
- Authentication, billing/quota/rate limits, refusal, truncated output, invalid JSON/schema and timeout failures are actionable and sanitized. No provider response body is surfaced as an error. The HTTP adapter makes no automatic retries; existing bounded workflow content repairs may incur additional calls.
- Mock mode remains available. `XC_OFFLINE_TEST=1` blocks real Writer transport even when a key is present. Regression tests continue using network-blocked transport rather than incurring live costs automatically.

## Files changed for this task

- `.env.local`: only `AI_PROVIDER`; credentials unchanged (ignored by Git).
- `.env.example`, `README.md`.
- `lib/ai/config.ts`, `lib/ai/capabilities.ts`, `lib/ai/writer-provider.ts`.
- `lib/ai/provider.ts`, `lib/ai/openai-provider.ts`.
- `lib/ai/schemas.ts`, `lib/ai/client.ts`, `lib/ai/discovery-client.ts`.
- `lib/types.ts`, `lib/discovery-contract.ts`.
- `components/PreparationWorkspace.tsx`, `components/StrategyWorkspace.tsx`: truthful provider labels/help text only.
- `tests/ai/provider.spec.ts`, `tests/ai/writer-provider.spec.ts`.
- This report.

All pre-existing modified and untracked files were preserved. Many files above already contained unrelated work; only targeted provider integration was added.

## Actual verification

Final results: **412 AI/contract tests passed, 26 session/component tests passed, zero skips or failures**. The AI total includes 32 new Writer tests. TypeScript, repository ESLint, formatting of the touched code/documentation, and an isolated production build passed.

Writer tests simulate HTTP responses in memory. They temporarily exercise live-mode configuration with sentinel keys, while the process-level network-denial preload still blocks real connections. These are adapter/contract tests, **not live Writer tests**.

Coverage includes all three preparation agents and all five Discovery lenses for both Movers and Xfinity Pro; six-Spark normalization; identical source context/prompts; JSON-schema request construction; conversation regeneration; browser acceptance of Writer provenance; mock/offline denial; malformed-output repair on Writer; fabricated-evidence rejection; unknown models/settings; missing key; HTTP 401/402/403/429/500; timeout; refusal; truncation; and no cross-provider fallback.

An initial test-harness failure serialized an unawaited mock Promise instead of response data; awaiting the existing mock generator corrected the tests, without weakening production validation. An initial isolated-build command had an incorrectly quoted preload path containing spaces; copying the existing guard into the temporary directory corrected that setup issue.

Commands executed from the XC repository:

```sh
AI_MODE=mock AI_PROVIDER=openai WRITER_API_KEY= OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--conditions=react-server --require ./tests/helpers/phase1-no-api.cjs' XC_GATEWAY_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' XC_GATEWAY_IMC_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway IMC Brief KM.docx' XC_GATEWAY_REFERENCE_DOCX='/Users/sryali755@cable.comcast.com/Downloads/Gateway CB Helix Test.docx' ./node_modules/.bin/playwright test -c playwright.ai.config.ts --reporter=dot --output=/private/tmp/xc-writer-regressions

AI_MODE=mock AI_PROVIDER=writer WRITER_API_KEY= OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase1.config.ts --reporter=dot --output=/private/tmp/xc-writer-phase1

./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint .
```

Production build used an isolated source copy at `/private/tmp/xc-writer-build.3ioCFq`, no `.env` files, a symlink to the existing dependencies, and a copy of `tests/helpers/pipeline-offline-network.cjs` as `offline-network.cjs`:

```sh
AI_MODE=mock AI_PROVIDER=writer WRITER_API_KEY= OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./offline-network.cjs' ./node_modules/.bin/next build --webpack
```

The build compiled and generated all routes successfully. It did not use a port or modify the existing development server's build directory.

## Remaining live verification

Confirm the exact covered model and approve a small spending cap before a bounded live smoke test. Check actual key/model permissions, return metadata, grounding and response quality. A running server may need a deliberate environment reload/restart to pick up the provider setting; this task did not restart it. Opening or refreshing the application does not itself trigger agent generation.
