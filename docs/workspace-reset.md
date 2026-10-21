# Reset Workspace

The top-right version/count badge is replaced by **Reset Workspace**, a secondary action visible across the four tabs. Internal Input Pack and result version tracking is unchanged.

Clicking the button opens a native confirmation dialog. Cancel receives initial focus; Cancel and Escape close it without changing saved data. The destructive **Clear Workspace** button explicitly confirms deletion. Running agents, comparison requests and pending saves disable reset.

Confirmation clears only XC-owned sessionStorage/localStorage keys and matching records in the existing XC IndexedDB entries store. This removes campaigns and archives, source brief content, outputs/versions, conversations, saved considerations, strategy drafts, approvals and generated briefs. It never removes original source files, environment variables, API credentials or unrelated browser data.

Queued IndexedDB quota-fallback saves are drained before deletion. The old workspace store is sealed against late writes, and root callbacks are ignored during reset so delayed results cannot repopulate it. After successful cleanup, the page reloads into a fresh Input Pack without generating agents. On storage failure the dialog reports failure instead of claiming success and permits retry. Ordinary browser refresh continues restoring saved work.

This operates on this tab's workspace and XC-owned browser-origin storage; it is not a server-side account deletion or a command to reset other running browser sessions.

## Verification

- Desktop 1440×900 and mobile 390×844: no corner version badge; reset action visible through all four tabs; no document overflow.
- Opening, Cancel and Escape preserve storage byte-for-byte and make zero agent requests.
- A controlled IndexedDB failure leaves stored browser data unchanged, reports the error, and permits a successful retry.
- Confirmation clears current/legacy cached campaigns and archived work in Web Storage and IndexedDB while retaining unrelated preference/credential-shaped test keys and unrelated database records.
- Empty preparation/Discovery/strategy state survives a normal refresh without old work returning. A new explicit Build works after reset.
- Deterministic store tests verify deletion scope, late-write rejection and a pending IndexedDB write finishing before its record is cleared.
- All model interactions in tests are intercepted local mocks. Server tests use `AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1` and the existing outbound-network rejection preload. Actual user workspace data is not cleared during implementation, and the live server is not restarted.
