# Confirmed campaign rebuild

Build Input Pack now stages three fresh V0 preparation outputs on every
confirmed click. The existing Regenerate and steering controls remain unchanged.

## Before commit

- The current IMC text, source-document/scope selection and campaign naming are preserved.
- Only explicitly selected preparation content, steering and supplied evidence
  are sent as rebuild context. Previous generation history is not merged into V0.
- A native confirmation names the campaign data that will be cleared.
- The old workspace remains active while all three requests settle and their
  structured outputs/source grounding pass the existing validation.
- Cancellation, failed generation, failed validation or intervening workspace
  edits leave the old workspace unchanged. No automatic rebuild retries are added.

## Atomic replacement

`stageCampaignRebuild` prepares an immutable candidate with a fresh
`workspaceBuildId`. On successful validation, the root commits the replacement
session, freshly initialized Discovery/Canvas state, and removal of the target
campaign's obsolete Discovery records in one IndexedDB read/write transaction.
The active campaign archive and pack history are reset; unrelated archives and
drafts are preserved. The uploaded source is not cleared.

The fresh Canvas may contain normal source-aware suggestions. It contains no
previous human edits, saved field versions, conversations, considerations,
comparisons, confirmations or generated briefs. Its human-owned Brief Line is
empty. Newly regenerated choices carry forward only if their content is
unchanged; changed suggestions require explicit review/selection.

Campaign archive grouping retains its existing source-scoped base key. Discovery
persistence adds the build ID to that key. Old asynchronous responses therefore
cannot publish into the new investigation, and legacy drafts cannot be imported
into a newly built workspace. The seven-field Dynamic Input Pack is unchanged.

IndexedDB is required for the replacement transaction. If unavailable or if the
transaction aborts, the build reports failure without clearing the old workspace.
Web Storage is a cache; a quota failure after a durable commit does not undo the
replacement. Reload restores the newer IndexedDB record.

## Offline verification

Use `AI_MODE=mock OPENAI_API_KEY= XC_OFFLINE_TEST=1` and the existing
`tests/helpers/phase1-no-api.cjs` server preload. Browser tests intercept every
model request, deny other API/external requests, and use disposable profiles on
an isolated port. No live server, credentials or real saved campaign data is used.

Focused tests cover confirmation cancellation, all-three concurrent staging,
repeated builds, selected-input fidelity, changed-hypothesis selection safety,
source/campaign isolation, stale same-campaign and cross-campaign responses,
generation failure/retry, unavailable IndexedDB, mid-transaction rollback,
cache-quota recovery, reload restoration, seven-field rendering, and downstream
draft/finding/conversation reset.
