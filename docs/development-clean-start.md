# Development clean-start mode

> **Superseded:** Automatic clean-start on reload has been removed at the user's request. Refresh now restores the saved workspace without generating agents. See [current refresh behavior](workspace-refresh.md). The material below records the earlier implementation and is historical, not the current operating instructions.

## Behavior

Every real page load in `next dev` resets the XC workspace before any workspace component mounts. The root layout includes `DevelopmentCleanStart` only when `NODE_ENV === "development"`; production rendering and persistence are unchanged. There is no production-enabling configuration flag.

The reset removes only these XC-owned keys from sessionStorage, localStorage and the `entries` store in the existing `xc-insight-workspace` IndexedDB database:

- `xc-insight-studio-v1`
- `xc-strategy-session-v1`
- `xc-insight-discovery-v1`
- `xc-insight-discovery-v2:*`
- `xc-saved-project-v1:*`

These records contain campaign archives, source briefs, preparation versions, investigation versions and conversations, saved findings/considerations, human strategy drafts, approvals/snapshots and generated briefs. Removing them resets the active campaign too. No unrelated storage, database, credentials, environment file, fixture or source document is removed.

A document-scoped initialization promise prevents duplicate clearing during Strict Mode, component remounts, Fast Refresh and four-tab navigation. Existing saving mechanisms continue working during the current page session. Refresh creates a new Document, runs the reset again and prevents prior records from hydrating. Back/forward-cache restoration triggers a real reload so a historical development document cannot revive old work. Storage reset failure blocks hydration with a readable error instead of restoring stale work.

**Development drafts intentionally do not survive reloads.** This is permanent behavior in development, not a one-time migration.

## Offline verification

Use the installed browser only; no installation or external service is needed. The test server was started with `AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NEXT_TELEMETRY_DISABLED=1` and `NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs'`. This preload rejects outbound fetch/HTTP/HTTPS/socket connections. Browser routing allows only local page/static resources and the exact local Next HMR socket. Agent POSTs are fulfilled with deterministic existing mock implementations and never reach the application server.

Commands (from repository root):

```sh
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--conditions=react-server --require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.ai.config.ts
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase1.config.ts
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.phase2-components.config.ts
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.clean-start.config.ts
npm run typecheck
npm run lint
```

The clean-start browser config uses port 3179 by default. `XC_CLEAN_TEST_ORIGIN` selects an explicitly controlled instance. Never run the clean-start browser suite against a production server: production must retain saved data.

Verified offline in an isolated working copy:

- 315 existing AI/state tests passed, plus 2 new storage-scope/non-development guard tests.
- All 12 Phase 1 and 6 Phase 2 component tests passed.
- Two desktop/mobile clean-start scenarios passed at 1440×900 and 390×844: old records seeded in all three storage mechanisms are removed; unrelated localStorage and IndexedDB records survive; Movers preparation runs three mocks; five Roundtable lenses complete; a consideration and human line are saved; all four tabs preserve the same session; refresh clears everything; Xfinity Pro can be created; closing/reopening starts empty again. No automatic agent generation on load.
- Typecheck, lint and guarded offline production build passed.

Initial browser fixture injection ran on Chrome's `about:blank` page and raised a storage access error. The fixture is now restricted to HTTP documents; the complete scenarios passed without page errors. Initial component-test invocation used the wrong React Server Components condition; rerunning with the existing component harness's supported configuration passed all 18 tests.

The broader legacy Phase 2 browser suite has pre-existing obsolete `Save to Working Space` button selectors while the current application says `Save as a creative consideration`. Two cases timed out there and the exploratory full run was stopped; those unrelated tests and application labels were not changed to obtain a pass. Applicable production persistence cases are reported separately in the handoff.

## Final verification and changed files

The requested localhost:3000 restart was completed after verifying the exact original process, parent and repository working directory. The new server runs in **mock/offline mode with an outbound network guard**; no environment or credential files were changed. Both full desktop/mobile clean-start scenarios passed again against this actual restarted application, with zero skips, zero page errors and zero real agent requests. All five lenses completed via browser-intercepted local mocks, the human line and saved consideration survived tab navigation, and refresh/reopening started empty.

Production browser regression run: **9 passed, 1 failed, 0 skipped** among the selected existing cases. The failure is the existing `B/C/F/H/L` case waiting for obsolete `Save to Working Space` wording. The nine passing cases include conversational history/human draft restoration across reload, five-agent failure/retry isolation, invalid output handling, independent Xfinity Pro restoration, empty Roundtable viewports and zero/one-finding navigation. An earlier exploratory full run was interrupted after two other cases failed on the same obsolete wording; this is not a claim that the entire legacy browser suite passed. Tests/labels were not weakened or altered.

Only these source/test/document files were changed for this task:

| File | Purpose |
| --- | --- |
| `app/layout.tsx` | Development-only startup boundary; production bypasses it |
| `components/DevelopmentCleanStart.tsx` | Await reset before mounting workspace; fail closed; reload restored bfcache documents |
| `lib/development-clean-start.ts` | Exact owned-key cleanup across both Web Storage stores and XC IndexedDB, once per Document |
| `playwright.clean-start.config.ts` | Existing Chrome configuration reused for isolated clean-start tests |
| `tests/clean-start/workspace.spec.ts` | Desktop/mobile old-data, new campaign, all five agents, saved draft, navigation, refresh and reopen checks |
| `tests/ai/development-clean-start.spec.ts` | Narrow key scope, unrelated/credential preservation and non-development bypass |
| `docs/development-clean-start.md` | Mechanism, commands, evidence and limitations |

Generated evidence is in [development-clean-start](development-clean-start/):

- [Desktop after refresh](development-clean-start/refresh-empty-1440.png)
- [Mobile after refresh](development-clean-start/refresh-empty-390.png)
- [Desktop session preserved](development-clean-start/session-preserved-1440.png)
- [Reopened empty workspace](development-clean-start/reopened-empty-1440.png)
- [Actual-server browser results](development-clean-start/actual-browser-results.json)
- [Production regression results, including the existing selector failure](development-clean-start/production-browser-results.json)

Existing dirty/untracked work was preserved. Earlier in-progress Phase 3 work in a separate temporary directory was not applied, overwritten or deleted. No commit, push, deployment, installation, live model call or external research request was performed. Production rendering and existing session-saving logic were not redesigned.
