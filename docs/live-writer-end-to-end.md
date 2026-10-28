# Live Writer end-to-end verification

Run against the local application with Writer configured in live mode. The
test uses a new browser session and real Writer requests. Its strategy
confirmation is confined to that test session; it does not change an existing
user tab or approve a campaign for production.

```sh
XC_LIVE_E2E=1 \
XC_LIVE_BRIEF="/absolute/path/to/brief.docx" \
npx playwright test -c playwright.live-writer.config.ts end-to-end.spec.ts
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
An invalid finding evidence-state label is derived only from independently
verified citations (or an empty evidence array for a research gap). Explicit
valid states remain subject to the existing evidence-consistency checks.

Eligible generations have one corrective attempt for malformed output.
Suggestions also use that allowance for validation failures, including
unsupported competitive comparisons. A separate connection-recovery attempt
is shared across the entire workflow, including corrective generations.
Writer requests use fresh connections and a process-wide limit of two active
requests, held through response-body consumption. A 270-second workflow
deadline includes queueing, correction, and recovery; individual calls have a
120-second timeout. Saved suggestion
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

### Connection stability follow-up

Server logs showed `EPIPE` and `UND_ERR_SOCKET`, including during corrective
generations. The separate transport allowance, fresh connections, concurrency
gate, and shared deadline above address this recovery gap. A subsequent live
check exposed invalid `evidenceState` labels; citation-derived metadata now
handles these without accepting unverifiable evidence.

After the fixes, two five-agent live bursts using the actual Gateway brief
completed with 10 successful application responses and zero failed responses.
The complete AI regression suite passed 442 tests, with two skipped. TypeScript,
changed-code ESLint, whitespace checks, and the production build passed. This
follow-up exercised Round Table generation; the complete browser/export journey
described above was verified earlier. These are observed results, not a
guarantee against future upstream outages or new model-output variations.

### Mobile citation metadata follow-up

A subsequent user screenshot exposed a separate Analogous Solutions citation
failure: a non-string `audience` and unexpected citation keys. Successful Writer
HTTP responses were being rejected by the application's strict schema. The
adapter now locates the citation by source identity, locator, and unchanged
excerpt before selecting canonical fields and normalizing string-list or null
metadata. Unlocatable citations and explicit external access claims remain
subject to rejection. Correction feedback includes expected types and unknown
keys rather than only issue codes.

The corrected adapter passed 67 focused tests. The complete AI regression suite
passed 446 tests with two skipped; TypeScript, changed-code ESLint, whitespace
checks, and the production build passed. The local
`Black_Friday_Informative_IMC_Brief.docx` matched the screenshot's campaign text
and was used for live follow-up verification. The first diagnostic burst caught
an adapter implementation error, which was corrected before the passing checks;
it is not counted as successful verification.
After that correction, all five agents passed in two successive bursts (10/10
application responses). The final confirmation burst completed in 77 seconds
with zero failed responses. A socket disconnect during corrective generation
in the preceding burst was recovered automatically. These API tests used the
matching local document, not the user's existing browser session; the saved UI
error requires a new generation to be replaced.

### Parallel overlap and lens-role follow-up

A later Gateway screenshot showed a different failure: Brand was rejected by
the browser's post-response overlap check after another parallel lens finished.
Analogous Solutions also displayed a campaign-audience recap instead of a case
or case-research gap. Independent API bursts did not exercise that browser race.

The browser now gives a newly detected overlap one correction using current
peer findings, preserving the same turn, version number, cancellation scope,
and context checks. A repeated overlap still fails explicitly. Off-role saved
Analogous recaps remain in history but are excluded from peer validation. A
bounded role check rejects obvious Analogous audience recaps and feeds the
existing server correction; it does not certify the semantics of every analogy.

Two intercepted browser tests verify automatic recovery and bounded failure,
including manual recovery, saved selection persistence, and a single stored
successful generation. The complete AI suite passed 448 tests with two skipped.

The opt-in live browser regression below exercises the actual parallel UI,
role and overlap checks, and persistence after reload:

```sh
XC_LIVE_E2E=1 \
XC_LIVE_BRIEF="/absolute/path/to/brief.docx" \
npx playwright test -c playwright.live-writer.config.ts roundtable.spec.ts
```

It uses a new session and real Writer requests. `XC_LIVE_CHECKPOINT` can restore
an isolated prior test checkpoint for the same file to avoid regenerating prep
agents; the document filename is checked against that checkpoint's source.
`XC_LIVE_OUTPUT` stores its checkpoint outside the repository.
`XC_LIVE_REUSE_FINDINGS=1` checks existing findings from that test checkpoint
without generating new answers. Seed restoration runs only in an empty tab,
so a reload cannot overwrite the updated test state.
Local development server restarts now clear XC workspace data on the next page
load. Reuse a checkpoint only within the same server run; start a fresh live
test after a restart.

The live Gateway browser run completed all five lenses with six successful
application requests: Culture received one automatic post-response correction.
All current findings passed role and cross-peer overlap checks. The saved
checkpoint also passed browser restoration and reload verification without
additional model requests. The resulting screenshot shows a Brand proof
boundary and an Analogous case-research gap, rather than a copied audience
recap. TypeScript, changed-code ESLint, whitespace checks, and the production
build passed. The existing application stayed on port 3000.

### Repeated Gateway Spark 4 quote-repair failure

Two subsequent Gateway builds returned successful Writer HTTP responses but
failed the unchanged source-quote gate for Spark 4 even after its targeted
repair (`excerpt_verbatim`, `retried=true`, `passed=false`). Recent committed
model-selector and avatar changes did not change the Sparks validation or
repair path. The selectors are demo UI and do not change provider routing.

Writer's source-repair transport now supplies a bounded catalog of exact
source slices and requests an `excerptId` instead of asking it to recopy the
quotation. The model selects relevant support; the adapter resolves only a
known ID to original text. IDs are scoped to the current source, excerpts
retain original Unicode and punctuation, and unknown or contradictory
references remain invalid. Saved Spark schemas and all other Spark slots
remain unchanged. At that point initial generation still used the existing
excerpt contract; the ID-based transport applied to targeted source repair
only. The follow-up below extends IDs to initial generation. Selecting a
source excerpt does not independently certify its relevance or source claims.

Two isolated live Writer tests deliberately corrupted Spark 4's quotation
after initial generation. Both repairs selected valid IDs, all six excerpts
verified against the Gateway source, and the other five ideas were preserved.
A fresh browser upload and Build Input Pack also passed with all three agents
and six verified Sparks. The AI suite passed 453 tests with two skipped;
TypeScript, changed-code ESLint, whitespace checks, and production build passed.

Run the focused browser check with the same explicit paid-call opt-in:

```sh
XC_LIVE_E2E=1 \
XC_LIVE_BRIEF="/absolute/path/to/brief.docx" \
npx playwright test -c playwright.live-writer.config.ts input-pack.spec.ts
```

### Production readiness follow-up, October 27, 2026

The initial six-Spark Writer request now selects `excerptId` values from exact
raw-source slices. The catalog spreads its bounded 80 choices across a long
brief when no Spark-specific focus exists; targeted repairs still rank source
slices by the failed Spark. Only known IDs resolve to original text, followed
by the existing structural and source checks. The model still chooses what
support is relevant; source membership alone does not prove a strategic claim.

Input Pack rebuilds keep successful preparation outputs staged in the active
tab and retry only failed agents once when the failure is retryable. A later
Build Input Pack action can reuse those staged outputs only if source, campaign
name, selected inputs, guidance, supplied evidence, and mode are unchanged.
The previous workspace is replaced only after all three outputs pass. A page
reload clears the staged retry cache. The Round Table's five-lens batch now
assesses cross-lens overlap after all five responses arrive, then shows a
review advisory for similar perspectives instead of failing a card according
to response arrival order. Individual lens regeneration retains its existing
validation and correction behavior.

Observed checks after these changes:

- TypeScript, ESLint, and the optimized production build passed.
- The complete offline AI suite passed 456 tests, with 2 skipped. Eight
  campaign rebuild tests passed, including same-input reuse and cross-brief
  cache isolation.
- The Gateway IMC Brief KM DOCX passed a fresh Input Pack run with 3 successful
  application responses and 6 verified Sparks. The initial Sparks call passed
  without source repair. The same brief passed a separate five-lens Round Table
  run and a nine-stage live journey through confirmed strategy and PDF/Word
  export. The exported PDF had 7 pages; all 23 brief sections were checked in
  both formats. The full journey made 11 successful application AI requests.
- The Black Friday IMC DOCX, and the Movers and Xfinity Pro campaign scopes in
  the same 12-page PDF, each passed a fresh live Input Pack run with 3
  successful application responses and 6 source-verified Sparks.

The live Input Pack test requires `XC_LIVE_CAMPAIGN_NAME` when a document has
no unambiguous name. For a multi-campaign document, set
`XC_LIVE_CAMPAIGN_SCOPE` to a unique option label fragment, then provide the
name if needed. This models the application's required human campaign choice;
the test does not infer that an ambiguous document name is approved.

These checks establish functional coverage, not the reliability percentages
in the technical review. Before a production release, measure at least 20
consecutive live builds across the planned brief matrix, repeat five-lens
bursts, exercise transport faults and quota responses, and review deployment
security, persistence, monitoring, and recovery in the target environment.
