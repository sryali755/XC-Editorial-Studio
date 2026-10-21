# XC Strategy Studio prototype

The primary prototype has four stages: Input Pack → Insight Discovery → Finalize Strategy → XC Brief. The Creative Round Table remains available when `NEXT_PUBLIC_INSIGHT_DISCOVERY=false`; its prompts and five-agent flow are unchanged.

The Input Pack follows the three-step reference layout: paste and/or upload the IMC brief; review the JTBD/RTB, Data, and Sparks agent cards side by side; then inspect a compact Dynamic Input Pack summary. Each agent retains an independent version selector, steering and history. Spark checkboxes select material for the pack; Keep locks a slot during regeneration, while Improve and Replace create a new six-Spark version. Full analysis and exact source context remain available in expandable sections rather than being dropped from the UI.

## State and provenance

- `DiscoveryStudioSession` holds the uploaded IMC text, canonical parsed fields, preparation output versions, selected RTB proposal, research items, Spark IDs, optional source selections, campaign archive, confirmation snapshots, brief versions, and the exact brief-generation input used for each version.
- `DiscoveryState` holds the human investigation question, all five agent histories, saved and compared findings, Finalize Strategy drafts, independent field-version histories, and Kevin's human-authored brief line.
- The Input Pack keeps original RTB text and approval status separate from proposed AI framing. Labeled objectives, audience segments and RTBs are additionally preserved as exact IMC source spans.
- An external-source checkbox records Kevin's interest, not retrieval. Tableau, iSpot, ACE, Datorama and Brand Hub are not connected. A manually uploaded supporting document is explicitly added as supplied evidence.
- Selected research items and Sparks carry their full structured content and version IDs into the Discovery request. Unselected items do not. Changing selections marks prior agent responses stale without deleting them.
- Each campaign's Input Pack state is archived under its source identity. Discovery and Working Space state use source-specific browser keys, so returning to an earlier brief restores its work.
- `sessionStorage` is attempted first; if full, the browser workspace store saves to IndexedDB. If both fail, the app shows an error and leaves the current in-memory draft visible. It never deletes an older save to make room.
- Insight Discovery is dedicated to Round Table exploration. Its comparison view can still compare findings, while the only strategy editor is in Finalize Strategy.
- Finalize Strategy presents five sections in document order: Strategy Canvas, Your Selected Creative Considerations, Your Brief Line, Optional Brief-Line Suggestions, and Confirm Strategy. It edits the existing campaign-specific `DiscoveryState`; no parallel strategy or brief-line store is created.
- The six primary canvas fields are seeded from the selected Input Pack where supported. Original JTBD, selected proposed XC framing, original RTB, other historical canvas fields, saved findings and field-version history remain available with their provenance. Existing human edits are protected from context refreshes.
- Canvas text auto-saves as a draft. `Save Draft` records immutable field versions; restoring one copies it into a new editable draft. New strategies begin with a blank human brief line. Suggestions are collapsed by default and never replace existing human text.
- Confirmation freezes the selected brief line, Input Pack and saved-finding snapshot. Any change to the strategy content or selected context invalidates the current confirmation until Kevin explicitly reconfirms; prior approval snapshots remain available.
- The XC Brief stage currently creates a structured, non-AI handoff from that confirmed snapshot and stores the exact `StudioBriefInput` contract by brief version. Advanced provider-based brief writing awaits Kevin's requirements.

## Run and test

```sh
NEXT_PUBLIC_INSIGHT_DISCOVERY=true npm run dev
NEXT_PUBLIC_INSIGHT_DISCOVERY=true PLAYWRIGHT_PORT=3104 npm test -- tests/strategy-studio-phase3.spec.ts --workers=1
NEXT_PUBLIC_INSIGHT_DISCOVERY=true PLAYWRIGHT_PORT=3104 npm test -- tests/discovery-storage.spec.ts tests/document-upload.spec.ts --workers=1
NEXT_PUBLIC_INSIGHT_DISCOVERY=false PLAYWRIGHT_PORT=3105 npm test -- --workers=2
npm run test:ai
npm run typecheck
npm run lint
NEXT_PUBLIC_INSIGHT_DISCOVERY=true AI_MODE=mock npm run build
```

Mock mode is visibly labeled. Live mode uses the existing server-side provider configuration; there is no silent mock fallback. Searchable PDFs are extracted locally, but scanned/image-only content needs a separate OCR service and is not represented as read text.

The earlier screenshots in `docs/strategy-studio-screenshots/` predate the Phase 3 Finalize Strategy layout and are not visual evidence of the current UI. The Phase 3 Playwright scenario captures current desktop, mobile, selected-consideration, expanded-suggestions, and Insight Discovery screenshots under its test-results output directory.
