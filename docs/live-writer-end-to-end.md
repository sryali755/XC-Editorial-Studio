# Live Writer end-to-end verification

Run against the local application with Writer configured in live mode. The
test uses a new browser session and real Writer requests. Its strategy
confirmation is confined to that test session; it does not change an existing
user tab or approve a campaign for production.

```sh
XC_LIVE_E2E=1 \
XC_LIVE_BRIEF="/absolute/path/to/brief.docx" \
npx playwright test -c playwright.live-writer.config.ts
```

The explicit `XC_LIVE_E2E=1` opt-in permits billable model calls. Normal test
runs skip this test. The server must already be running; this configuration
does not launch another server or change its provider.

The journey verifies:

1. Actual DOCX import and all three preparation agents.
2. Selecting the RTB/JTBD proposals, research, and a Spark.
3. All five Round Table lenses with live Writer responses.
4. A follow-up conversation and saved findings.
5. Comparison of two findings.
6. Three grounded strategy suggestions and adoption as an editable draft.
7. Draft persistence after reload and explicit test-session confirmation.
8. Deterministic packaging of that confirmed strategy, preserving the original
   RTB and the complete imported source in its stored input snapshot.
9. PDF and DOCX downloads, checking every section's content in both exports.

`XC_LIVE_QUESTION` can supply an investigation focus. `XC_LIVE_BASE_URL`
defaults to `http://127.0.0.1:3000`. `XC_LIVE_OUTPUT` selects the artifact
directory (default `/private/tmp/xc-live-journey`). Artifacts contain the
provided brief and generated test work, so they stay outside the repository.

To continue after fixing a failure, use the same output directory and set
`XC_LIVE_RESUME=1`. Completed stages and the test session are restored, avoiding
unnecessary repeat generations. `XC_LIVE_RESTART_AT=06` repeats stage 6 onward.
Use a new output directory for a completely fresh run.

## Response handling covered by regression tests

Writer receives the JSON schema in both its response format and its explicit
prompt contract. Known text/list/envelope variations are normalized before
canonical validation. Evidence access scope can be recovered only from a
uniquely verified supplied citation. Retrieval metadata comes from the actual
supplied-only adapter. Invalid references, invented quotations, and explicit
claims of external access are rejected.

Eligible generations share one corrective attempt for malformed output or a
connection failure. Suggestions also use that allowance for validation
failures, including unsupported competitive comparisons. Saved suggestion
history is revalidated before it can be chosen. Authentication, billing,
quota, refusals, and timeouts remain explicit errors rather than hidden
fallbacks. Upstream outages and entirely new output variations can still
require handling; these tests do not promise that every future AI response
will succeed.

## Verified on October 27, 2026

The actual `Gateway CB Helix Test.docx` passed a fresh browser run of all nine
stages using live Writer `palmyra-x5`. The final run completed in about three
minutes with 11 successful application API requests and no failed application
API responses. This is not a billing count: corrective provider attempts can
occur within an application request.

The generated PDF had eight pages. All 23 sections were checked for content in
both the PDF and Word downloads. Every PDF page was rendered and inspected for
legibility and clipping. Word was checked structurally and for text fidelity;
a native Word visual-rendering check was not performed.

The focused final regression run passed 91 tests, with one optional
local-reference-fixture test skipped. TypeScript, ESLint on changed code,
diff whitespace checks, and the production build passed. The existing local
server remained running on port 3000 with Writer configured in live mode.

Diagnostics found and fixed Writer retrieval-note type drift, comparison and
suggestion container variations, incomplete correction feedback, an unsupported
competitive comparison in a suggestion, and a transient connection failure.
The PDF export now keeps a short approval record together. The input source,
original proof, citation checks, and explicit strategy-confirmation boundary
remain preserved.
