"use client";

import { useMemo } from "react";
import { ArrowRight, GitMerge, Trash2, X } from "lucide-react";
import {
  discoveryFindingRef,
  discoveryLenses,
  inputPackVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import { discoveryDrafts } from "@/lib/discovery-state";
import {
  connectionSourceIssue,
  editConnectionNote,
  resolveConnectionSelection,
  saveConnectionNote,
} from "@/lib/discovery-connections";
import { saveWorkspaceDraft } from "@/lib/workspace-suggestions";
import { isRestoredBriefLineSuggestion } from "@/lib/workspace-presentation";
import { isSpecificDiscoveryLocator } from "@/lib/discovery-sources";
import type {
  DiscoveryFinding,
  DiscoveryState,
  DiscoveryWholeBrief,
  StrategyInputPack,
} from "@/lib/types";

type TextKey =
  | "problemStatement"
  | "evidenceInsights"
  | "workingAudience"
  | "workingJTBD"
  | "workingRTB"
  | "strategicDirection"
  | "openQuestions"
  | "executionConsiderations"
  | "notes";

type FieldDef = { key: TextKey; label: string; placeholder: string };
// Seven core boxes: the brief line (its own section) and these six.
const coreFields: FieldDef[] = [
  {
    key: "problemStatement",
    label: "Problem",
    placeholder: "What must this work overcome?",
  },
  {
    key: "evidenceInsights",
    label: "Insight",
    placeholder:
      "We’ve seen that… because… which means… Use a saved finding or selected research.",
  },
  {
    key: "workingAudience",
    label: "Audience",
    placeholder: "Which supplied audience matters most?",
  },
  {
    key: "workingJTBD",
    label: "Job to Be Done",
    placeholder: "When I…, I want to…, so I can…",
  },
  {
    key: "workingRTB",
    label: "Proof / RTB",
    placeholder: "Which supplied claims or proof support this direction?",
  },
  {
    key: "strategicDirection",
    label: "Strategic Direction",
    placeholder:
      "The work should… Select Sparks in the Input Pack for a suggestion.",
  },
];
function lensOf(finding: DiscoveryFinding) {
  return discoveryLenses.find((lens) => lens.id === finding.lensId)!;
}

function FindingTags({
  finding,
  currentPackVersion,
}: {
  finding: DiscoveryFinding;
  currentPackVersion: string;
}) {
  const lens = lensOf(finding);
  return (
    <span className="ws-tags">
      <span className={`ws-tag lens ${lens.color}`}>{lens.shortName}</span>
      <span className="ws-tag">Generation V{finding.runVersion - 1}</span>
      <span
        className={`ws-tag ${finding.evidenceState === "research_gap" ? "gap" : "evidence"}`}
      >
        {finding.evidenceState === "research_gap"
          ? "Research gap"
          : "Has source excerpt"}
      </span>
      <span className="ws-tag">Agent interpretation · unverified</span>
      {finding.inputPackVersion !== currentPackVersion && (
        <span className="ws-tag gap">Needs refresh</span>
      )}
      {finding.provider === "mock" && <span className="ws-tag">Demo data</span>}
    </span>
  );
}

function FindingDetail({
  finding,
  onInspect,
}: {
  finding: DiscoveryFinding;
  onInspect: () => void;
}) {
  return (
    <div className="ws-finding-detail">
      <b>Agent interpretation · unverified</b>
      <p>{finding.whatWeFound}</p>
      {finding.evidence.map((evidence, index) => (
        <blockquote key={index}>
          “{evidence.excerpt}”
          <small>
            {evidence.source} ·{" "}
            {isSpecificDiscoveryLocator(evidence.locator)
              ? evidence.locator
              : "Location needs review"}{" "}
            · Source claim, not independently verified
          </small>
        </blockquote>
      ))}
      <b>Why it may matter (agent’s view)</b>
      <p>{finding.whyItMayMatter}</p>
      <b>What complicates it</b>
      <p>{finding.whatComplicatesIt}</p>
      <b>Question to explore</b>
      <p>{finding.questionToExplore}</p>
      <button type="button" className="text-button" onClick={onInspect}>
        Show on agent card
      </button>
    </div>
  );
}

export default function WorkingSpace({
  state,
  pack,
  briefLine,
  busy,
  onChange,
  onConnect,
  onBriefLineChange,
  onApprove,
  showApproval = false,
  onInspectFinding,
  onReturnToDiscovery,
  showDraftActions = true,
  comparisonOnly = false,
}: {
  state: DiscoveryState;
  pack: StrategyInputPack;
  briefLine: string;
  busy: string[];
  onChange: (next: DiscoveryState) => void;
  onConnect: (guidance: string) => Promise<boolean>;
  onBriefLineChange: (value: string) => void;
  onApprove: () => void;
  showApproval?: boolean;
  onInspectFinding: (finding: DiscoveryFinding) => void;
  onReturnToDiscovery?: () => void;
  showDraftActions?: boolean;
  onOpenComparison?: () => void;
  comparisonOnly?: boolean;
}) {
  const drafts = discoveryDrafts(state);
  const currentPackVersion = inputPackVersion(pack);
  const allFindings = useMemo(() => knownDiscoveryFindings(state), [state]);
  const lookup = (ids: string[]) =>
    ids.flatMap((id) => (allFindings.get(id) ? [allFindings.get(id)!] : []));
  const saved = lookup(state.savedFindingIds);
  const selected = lookup(state.selectedFindingIds);
  const connectionSelection = resolveConnectionSelection(
    state,
    pack,
    drafts.connectionConsentKey,
  );
  const aside = lookup(state.asideFindingIds ?? []);
  const archivedSaved = lookup(state.archivedSavedFindingIds ?? []).filter(
    (finding) =>
      !state.savedFindingIds.includes(discoveryFindingRef(finding)) &&
      !state.savedFindingIds.includes(finding.id),
  );
  const connections = state.connectionNotes.filter((note) => !note.rejected);
  const rejected = state.connectionNotes.filter((note) => note.rejected);
  const hasSource = Boolean(pack.parsedIMC?.sourceText.trim());
  const approveBlocker = !hasSource
    ? "Add the IMC brief in Input pack before approving."
    : !briefLine.trim()
      ? "Write a brief line to approve your strategy."
      : "";
  const versions = state.fieldVersions ?? {};
  const originalStarters =
    state.workspaceSuggestionContext?.originalFields ??
    state.workspaceSuggestionContext?.fields;
  const fieldPurposes: Partial<Record<TextKey, string>> = {
    problemStatement: "Problem statement · what Creative needs to overcome.",
    workingAudience:
      "Audience truth · distinguish supplied context from interpretation.",
    workingRTB:
      "Brand truth · supplied proof is not automatically GTM-approved.",
    evidenceInsights:
      "Key tensions · what conflict or opportunity should we examine?",
    strategicDirection:
      "Desired response · what should change for the audience?",
    workingJTBD:
      "The audience's job · keep original and proposed framing distinct.",
  };
  const fieldValue = (key: string) =>
    key.startsWith("wholeBrief.")
      ? (state.wholeBrief?.[key.slice(11) as keyof DiscoveryWholeBrief] ?? "")
      : key === "humanBriefLine"
        ? briefLine
        : ((state[key as TextKey] as string | undefined) ?? "");
  const applyValue = (key: string, value: string, versionId?: string) => {
    if (key === "humanBriefLine" && !versionId) {
      onBriefLineChange(value);
      return;
    }
    const activeFieldVersionIds = versionId
      ? { ...state.activeFieldVersionIds, [key]: versionId }
      : state.activeFieldVersionIds;
    if (key.startsWith("wholeBrief."))
      onChange({
        ...state,
        wholeBrief: { ...state.wholeBrief, [key.slice(11)]: value },
        activeFieldVersionIds,
      });
    else onChange({ ...state, [key]: value, activeFieldVersionIds });
  };
  // One quiet line per box: where the text came from, whether it is saved,
  // and History only once versions exist. Saving happens once for all boxes.
  const fieldMeta = (key: string, label: string) => {
    const value = fieldValue(key);
    const history = versions[key] ?? [];
    const current =
      history.find((item) => item.id === state.activeFieldVersionIds?.[key]) ??
      history[0];
    const seeded = state.workspaceSuggestionContext?.fields[key];
    const starter = originalStarters?.[key];
    const source = !value.trim()
      ? seeded?.kind === "missing" &&
        (key === "evidenceInsights" || key === "workingJTBD")
        ? /^Not in the Input Pack/i.test(seeded.label)
          ? "No starting suggestion saved · preview one or add your own"
          : seeded.label
        : ""
      : key === "humanBriefLine" && isRestoredBriefLineSuggestion(state, value)
        ? "Restored earlier draft · edit freely"
        : key === "humanBriefLine" &&
            value === starter?.value &&
            value !== seeded?.value
          ? "AI suggestion adopted by you · not approved"
          : seeded && value === seeded.value
            ? `${seeded.label} · edit freely`
            : seeded || starter
              ? "Edited by you"
              : "Your draft";
    const saved = history.length
      ? current?.value === value
        ? `Saved V${current.number}`
        : "Unsaved changes"
      : "";
    return (
      <div className="ws-version-controls">
        {(source || saved) && (
          <small className="ws-field-source">
            {[source, saved].filter(Boolean).join(" · ")}
          </small>
        )}
        {key !== "humanBriefLine" &&
          starter?.value.trim() &&
          value !== starter.value && (
            <button
              type="button"
              className="text-button"
              onClick={() => applyValue(key, starter.value)}
            >
              Restore Input Pack suggestion
            </button>
          )}
        {!!history.length && (
          <details className="ws-history">
            <summary>History · {history.length}</summary>
            {history.map((item) => (
              <div className="ws-version-row" key={item.id}>
                <span>
                  V{item.number} · {new Date(item.savedAt).toLocaleString()}
                  {item.id === current?.id ? " · current" : ""}
                </span>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Use version ${item.number} of ${label}`}
                  onClick={() => applyValue(key, item.value, item.id)}
                >
                  Use this version
                </button>
                <p>{item.value || "Empty"}</p>
              </div>
            ))}
          </details>
        )}
      </div>
    );
  };
  const textField = ({ key, label, placeholder }: FieldDef) => (
    <div className="field" key={key}>
      <label htmlFor={`ws-${key}`}>{label}</label>
      {fieldPurposes[key] && (
        <p className="ws-field-purpose">{fieldPurposes[key]}</p>
      )}
      <textarea
        id={`ws-${key}`}
        rows={key === "notes" ? 2 : 3}
        value={fieldValue(key)}
        placeholder={placeholder}
        onChange={(event) => onChange({ ...state, [key]: event.target.value })}
      />
      {fieldMeta(key, label)}
    </div>
  );
  const without = (
    key: "savedFindingIds" | "selectedFindingIds" | "asideFindingIds",
    finding: DiscoveryFinding,
  ) =>
    (state[key] ?? []).filter(
      (id) => id !== discoveryFindingRef(finding) && id !== finding.id,
    );
  const compareBlocker = connectionSelection.issue;
  const updateConnection = (
    id: string,
    change: Partial<DiscoveryState["connectionNotes"][number]>,
  ) =>
    onChange({
      ...state,
      connectionNotes: state.connectionNotes.map((item) =>
        item.id === id ? { ...item, ...change } : item,
      ),
    });

  const comparisonSection = (
    <section className="ws-section" aria-labelledby="ws-compare-title">
      <h3 id="ws-compare-title">
        Compare findings <span className="count">{selected.length}</span>
      </h3>
      <p className="ws-hint">
        Ask how selected findings relate, agree or contradict. The result is an
        interpretation you can edit, not an approved insight.
      </p>
      {!!selected.length && (
        <ul className="ws-findings compact">
          {selected.map((finding) => (
            <li key={discoveryFindingRef(finding)}>
              <div>
                <FindingTags
                  finding={finding}
                  currentPackVersion={currentPackVersion}
                />
                <span className="ws-finding-title">
                  {finding.title} · {lensOf(finding).shortName} · V
                  {finding.runVersion - 1}
                </span>
                <small>Input Pack {finding.inputPackVersion}</small>
              </div>
              <button
                type="button"
                className="ws-icon-button"
                aria-label={`Unselect ${finding.title}`}
                title="Unselect"
                onClick={() =>
                  onChange({
                    ...state,
                    selectedFindingIds: without("selectedFindingIds", finding),
                  })
                }
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {connectionSelection.earlierContext && (
        <label className="check-action">
          <input
            type="checkbox"
            checked={
              drafts.connectionConsentKey === connectionSelection.selectionKey
            }
            onChange={(event) =>
              onChange({
                ...state,
                drafts: {
                  ...drafts,
                  connectionConsentKey: event.target.checked
                    ? connectionSelection.selectionKey
                    : "",
                },
              })
            }
          />
          Compare these exact earlier Input Pack or investigation versions with
          the current context. Their evidence is not automatically current.
        </label>
      )}
      <textarea
        rows={2}
        value={drafts.connections}
        aria-label="Connection guidance"
        placeholder="Optional: what relationship should the comparison examine?"
        onChange={(event) =>
          onChange({
            ...state,
            drafts: { ...drafts, connections: event.target.value },
          })
        }
      />
      <div className="ws-approve">
        <button
          className="button"
          aria-label="Compare selected findings"
          disabled={Boolean(compareBlocker) || busy.includes("connections")}
          onClick={() => void onConnect(drafts.connections)}
        >
          <GitMerge size={14} />
          {busy.includes("connections")
            ? "Comparing…"
            : `Compare ${selected.length}`}
        </button>
        {compareBlocker && <small>{compareBlocker}</small>}
      </div>
      {connections.map((connection) => (
        <div className="ws-connection" key={connection.id}>
          <span className="ws-tag">
            Interpretation · not validation
            {connection.demo ? " · demo data" : ""}
          </span>
          {connectionSourceIssue(connection, state, pack) && (
            <p className="research-gap-note" role="status">
              {connectionSourceIssue(connection, state, pack)}
            </p>
          )}
          <textarea
            rows={4}
            value={connection.note}
            aria-label="Edit connection note"
            onChange={(event) =>
              onChange({
                ...state,
                connectionNotes: state.connectionNotes.map((item) =>
                  item.id === connection.id
                    ? editConnectionNote(item, event.target.value)
                    : item,
                ),
              })
            }
          />
          {connection.generatedNote &&
            connection.generatedNote !== connection.note && (
              <details>
                <summary>Original generated interpretation</summary>
                <p>{connection.generatedNote}</p>
              </details>
            )}
          {!!connection.editVersions?.length && (
            <details>
              <summary>
                Saved note versions · {connection.editVersions.length}
              </summary>
              {connection.editVersions.map((version, index) => (
                <div key={version.id}>
                  <small>
                    V{connection.editVersions!.length - index} ·{" "}
                    {new Date(version.createdAt).toLocaleString()}
                  </small>
                  <p>{version.text}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      onChange({
                        ...state,
                        connectionNotes: state.connectionNotes.map((item) =>
                          item.id === connection.id
                            ? editConnectionNote(item, version.text)
                            : item,
                        ),
                      })
                    }
                  >
                    Restore as draft
                  </button>
                </div>
              ))}
            </details>
          )}
          <details>
            <summary>Exact source findings, relationships and limits</summary>
            <ul className="ws-compared">
              {connection.findingVersions.map((reference) => {
                const referenceKey = `${reference.findingId}@${reference.runVersion}`;
                const finding = allFindings.get(referenceKey);
                const snapshot = connection.selectedFindingSnapshots?.find(
                  (item) => item.findingRef === referenceKey,
                );
                return (
                  <li key={referenceKey}>
                    {finding ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onInspectFinding(finding)}
                      >
                        {lensOf(finding).shortName}: {finding.title} · V
                        {finding.runVersion - 1}
                      </button>
                    ) : (
                      <span>
                        {snapshot
                          ? `${snapshot.lensId}: ${snapshot.title}`
                          : "Earlier source finding unavailable"}{" "}
                        · V{reference.runVersion - 1}
                      </span>
                    )}
                    <small>
                      Input Pack{" "}
                      {snapshot?.inputPackVersion ??
                        finding?.inputPackVersion ??
                        reference.inputPackVersion ??
                        "unknown"}
                    </small>
                    {snapshot && (
                      <details>
                        <summary>Saved source evidence and limits</summary>
                        {snapshot.evidence.map((evidence, index) => (
                          <blockquote key={index}>
                            {evidence.excerpt}
                            <small>
                              {evidence.source} ·{" "}
                              {isSpecificDiscoveryLocator(evidence.locator)
                                ? evidence.locator
                                : "Location needs review"}{" "}
                              · Access: {evidence.accessScope}
                            </small>
                          </blockquote>
                        ))}
                        {!snapshot.evidence.length && (
                          <p>No evidence-backed source is claimed.</p>
                        )}
                        <p>{snapshot.whatComplicatesIt}</p>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
            {[
              ...connection.relationships,
              ...connection.tensions,
              ...connection.questions,
            ].map((item) => (
              <p key={item}>{item}</p>
            ))}
          </details>
          <div className="studio-actions">
            <button
              className={`button small ${connection.saved ? "is-selected" : ""}`}
              onClick={() =>
                onChange({
                  ...state,
                  connectionNotes: state.connectionNotes.map((item) =>
                    item.id !== connection.id
                      ? item
                      : item.saved &&
                          (!item.editVersions?.length ||
                            item.editVersions[0].text === item.note)
                        ? { ...item, saved: false }
                        : saveConnectionNote(item),
                  ),
                })
              }
            >
              {connection.saved &&
              (!connection.editVersions?.length ||
                connection.editVersions[0].text === connection.note)
                ? "Saved connection"
                : "Save connection note"}
            </button>
            <button
              className="text-button"
              onClick={() =>
                updateConnection(connection.id, { rejected: true })
              }
            >
              Reject connection
            </button>
          </div>
        </div>
      ))}
      {!!rejected.length && (
        <details className="ws-aside">
          <summary>Rejected connections · {rejected.length}</summary>
          {rejected.map((connection) => (
            <div className="ws-connection" key={connection.id}>
              <p>{connection.note}</p>
              <button
                className="text-button"
                onClick={() =>
                  updateConnection(connection.id, { rejected: false })
                }
              >
                Restore connection
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
  if (comparisonOnly)
    return (
      <div className="working-space ws-comparison-only">
        {comparisonSection}
      </div>
    );
  return (
    <div className="working-space">
      <section
        className="ws-section ws-thinking"
        aria-labelledby="ws-thinking-title"
      >
        <h3 id="ws-thinking-title">Strategy Canvas</h3>
        <p className="ws-hint">
          Refine the campaign strategy with the context and Round Table ideas
          you selected. Your edits remain yours.
        </p>
        <div className="ws-draft-notice" role="note">
          <span>Editable draft · saving does not confirm your strategy.</span>
          {showDraftActions && (
            <button
              type="button"
              className="button small"
              onClick={() =>
                onChange(
                  saveWorkspaceDraft({ ...state, humanBriefLine: briefLine }),
                )
              }
            >
              Save Draft
            </button>
          )}
        </div>
        {state.workspaceSuggestionContext?.reviewPackVersion && (
          <p className="ws-support-review" role="note">
            Untouched, unsaved suggestions were updated for your brief inclusion
            choices. Your writing, saved versions and original Suggested V0 are
            preserved. Review before confirming.
          </p>
        )}
        {hasSource && (
          <p className="ws-hint">
            Review the building blocks of your strategy. New drafts start with
            source-aware suggestions. Existing edits and empty fields are
            preserved.
          </p>
        )}
        {coreFields.map(textField)}
      </section>

      <section
        className="ws-section saved-findings"
        aria-labelledby="ws-saved-title"
      >
        <h3 id="ws-saved-title">
          Your Selected Creative Considerations{" "}
          <span className="count">{saved.length}</span>
        </h3>
        <p className="ws-hint">
          Your selected ideas from the Round Table, brought together to help
          shape your strategy.
        </p>
        {saved.length ? (
          <ul className="ws-findings">
            {saved.map((finding) => (
              <li key={discoveryFindingRef(finding)}>
                <input
                  type="checkbox"
                  aria-label={`Compare ${finding.title}`}
                  checked={
                    state.selectedFindingIds.includes(
                      discoveryFindingRef(finding),
                    ) || state.selectedFindingIds.includes(finding.id)
                  }
                  onChange={(event) =>
                    onChange({
                      ...state,
                      selectedFindingIds: event.target.checked
                        ? [
                            ...state.selectedFindingIds,
                            discoveryFindingRef(finding),
                          ]
                        : state.selectedFindingIds.filter(
                            (id) =>
                              id !== discoveryFindingRef(finding) &&
                              id !== finding.id,
                          ),
                    })
                  }
                />
                <details>
                  <summary>
                    <FindingTags
                      finding={finding}
                      currentPackVersion={currentPackVersion}
                    />
                    <span className="ws-finding-title">{finding.title}</span>
                    <span className="ws-finding-preview">
                      {finding.whatWeFound}
                    </span>
                    <small>
                      {finding.evidence.length} source excerpts available ·
                      saving is not confirmation
                    </small>
                  </summary>
                  <FindingDetail
                    finding={finding}
                    onInspect={() => onInspectFinding(finding)}
                  />
                  <small className="ws-investigation-context">
                    Investigated:{" "}
                    {state.runs
                      .find((run) => run.lensId === finding.lensId)
                      ?.versions.find(
                        (version) =>
                          version.id === finding.researchRunId ||
                          version.number === finding.runVersion,
                      )?.question ||
                      "Original investigation focus not recorded"}{" "}
                    · {finding.inputPackVersion}
                  </small>
                </details>
                <button
                  type="button"
                  className="ws-icon-button"
                  aria-label={`Remove ${finding.title} from selected creative considerations`}
                  title="Remove from selected creative considerations"
                  onClick={() =>
                    onChange({
                      ...state,
                      savedFindingIds: without("savedFindingIds", finding),
                      archivedSavedFindingIds: [
                        ...new Set([
                          ...(state.archivedSavedFindingIds ?? []),
                          discoveryFindingRef(finding),
                        ]),
                      ],
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ws-empty">
            <p>
              No creative considerations selected yet. Explore the Round Table
              and save the ideas you want to carry forward.
            </p>
            {onReturnToDiscovery && (
              <button
                type="button"
                className="button small"
                onClick={onReturnToDiscovery}
              >
                Return to Insight Discovery
              </button>
            )}
          </div>
        )}
        {!!archivedSaved.length && (
          <details className="ws-aside">
            <summary>
              Previously saved findings · {archivedSaved.length}
            </summary>
            {archivedSaved.map((finding) => (
              <div
                className="ws-version-row"
                key={discoveryFindingRef(finding)}
              >
                <b>{finding.title}</b>
                <button
                  className="button small"
                  type="button"
                  onClick={() =>
                    onChange({
                      ...state,
                      savedFindingIds: [
                        ...new Set([
                          ...state.savedFindingIds,
                          discoveryFindingRef(finding),
                        ]),
                      ],
                      archivedSavedFindingIds: (
                        state.archivedSavedFindingIds ?? []
                      ).filter((id) => id !== discoveryFindingRef(finding)),
                    })
                  }
                >
                  Restore consideration
                </button>
              </div>
            ))}
          </details>
        )}
        {!!aside.length && (
          <details className="ws-aside">
            <summary>Set aside findings · {aside.length}</summary>
            <ul className="ws-findings">
              {aside.map((finding) => (
                <li key={discoveryFindingRef(finding)}>
                  <div>
                    <FindingTags
                      finding={finding}
                      currentPackVersion={currentPackVersion}
                    />
                    <span className="ws-finding-title">{finding.title}</span>
                  </div>
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      onChange({
                        ...state,
                        asideFindingIds: without("asideFindingIds", finding),
                      })
                    }
                  >
                    Restore finding
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="ws-brief-line" aria-labelledby="ws-brief-line-title">
        <div className="ws-section-heading">
          <h3 id="ws-brief-line-title">Your Brief Line</h3>
          <span className="ws-status-pill human">Human-Owned Draft</span>
        </div>
        <p className="ws-hint">
          Write your single-minded strategic direction. Use the canvas and
          selected insights to shape your line.
        </p>
        {isRestoredBriefLineSuggestion(state, briefLine) && (
          <p className="ws-hint" id="ws-restored-line-note">
            Existing source-derived line restored from an earlier draft. Its
            text and approval state were preserved. New drafts start with an
            empty Brief Line.
          </p>
        )}
        <textarea
          rows={2}
          aria-label="Brief line"
          value={briefLine}
          placeholder="Write or paste your brief line here…"
          onChange={(event) => onBriefLineChange(event.target.value)}
        />
        {fieldMeta("humanBriefLine", "Brief line")}
        {showApproval && (
          <div className="ws-approve">
            <button
              className="button primary"
              disabled={Boolean(approveBlocker)}
              aria-describedby={
                approveBlocker ? "ws-approve-blocker" : undefined
              }
              onClick={onApprove}
            >
              Approve human-authored strategy <ArrowRight size={14} />
            </button>
            {approveBlocker && (
              <small id="ws-approve-blocker">{approveBlocker}</small>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
