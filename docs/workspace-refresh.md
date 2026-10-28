# Workspace refresh and restoration

Browser refresh during the same local server run restores the saved workspace. It does not delete campaigns or launch agent requests. Restarting the local development server starts a new run: the next page load clears XC workspace history before hydration, then opens an empty Input Pack. Production does not perform this automatic reset.

Existing sessionStorage/IndexedDB restoration is retained. Source text, preparation outputs and versions, selections, conversations, saved considerations, strategy fields, intentional empty edits, human Brief Lines, approval histories/snapshots and generated briefs retain their prior values. This change does not add a cloud backup or recover data that was already erased by the previous clean-start mode. Persistence remains browser-local, with the existing “saved in this tab” status; cross-device or closed-tab recovery is not promised.

The local restart reset removes only XC-owned sessionStorage, localStorage, and IndexedDB records, including saved projects. Unrelated browser data and credentials are left alone. It also runs on first load after this behavior is installed, so previously restored local history will not populate the workspace. No AI generation occurs during reset. The offline test server bypasses this local-development behavior so persistence regression fixtures remain meaningful.

Restored preparation and Roundtable versions show **Saved results**. Newly generated versions are not labeled saved merely because an older version was restored. A notice explains that existing work was restored, not regenerated. Those labels are scoped to the restored campaign, so another campaign does not inherit them.

An interrupted preparation request becomes **Needs Attention — Retry**, keeping any prior versions and current selection. No unfinished operation is resumed or retried automatically. Existing Discovery interruption recovery remains unchanged. The user must explicitly click Build, Start, Regenerate, Ask or Retry to generate AI output.

## Verification

- Desktop 1440×900 and mobile 390×844: new browser context begins empty, explicit Build runs exactly three preparation mocks, explicit Start runs five Discovery mocks, conversations and regenerated replies are preserved. Human edits and saved field versions survive navigation and refresh unchanged.
- Restored Input Pack shows three Saved results labels; restored Roundtable shows five Saved results labels. No additional model requests occur on refresh or tab navigation.
- Xfinity Pro starts separately from Movers: no inherited findings, saved considerations or human line; it runs preparation only after Build and restores its own results on refresh.
- Focused state tests cover exact approval/brief snapshot preservation, pending preparation recovery without losing versions, and genuinely empty startup.
- Tests use `AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1`. The isolated server uses the existing outbound-network rejection preload. Browser tests fulfill model POSTs with deterministic local mocks, allow only necessary local resources/HMR, and reject other requests. No live API calls, key changes or live-server restart are needed.

The existing `playwright.clean-start.config.ts` and `tests/clean-start/workspace.spec.ts` paths are retained for compatibility, but their acceptance expectations now deliberately test **restoration**, not deletion.

```sh
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 NODE_OPTIONS='--conditions=react-server --require ./tests/helpers/phase1-no-api.cjs' ./node_modules/.bin/playwright test -c playwright.ai.config.ts
AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1 XC_CLEAN_TEST_ORIGIN=http://localhost:3183 NODE_OPTIONS=--conditions=react-server ./node_modules/.bin/playwright test -c playwright.clean-start.config.ts
```

The browser command must target a separately started, guarded mock server, never an uncontrolled live environment.
