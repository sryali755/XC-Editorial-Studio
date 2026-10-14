"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  CircleAlert,
  Database,
  GitMerge,
  History,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  currentDiscoveryVersion,
  discoveryFindingRef,
  discoveryLenses,
  discoverySourceCoverage,
  inputPackVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import { extractJobToBeDone } from "@/lib/ai/context";
import { selectedFoundation } from "@/lib/ai/context";
import { discoverySourceDocuments } from "@/lib/discovery-sources";
import { discoveryDrafts } from "@/lib/discovery-state";
import SavedDiscoveryFinding from "./SavedDiscoveryFinding";
import type {
  DiscoveryAction,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryState,
  StrategyInputPack,
} from "@/lib/types";

const actionLabels: Record<DiscoveryAction, string> = {
  initial: "Initial research pass",
  explore_deeper: "Explore deeper",
  find_contrary: "Find contrary evidence",
  separate_audience: "Separate by audience",
  check_recency: "Check recency",
  compare_input: "Compare with input pack",
  ask_another_lens: "Ask another lens",
  refresh: "Refresh against current context",
};

function statusLabel(status: string) {
  return status === "connected_searched"
    ? "Supplied context analyzed"
    : status.replaceAll("_", " ");
}

function FindingCard({
  finding,
  state,
  currentPackVersion,
  pack,
  busy,
  onChange,
  onInvestigate,
}: {
  finding: DiscoveryFinding;
  state: DiscoveryState;
  currentPackVersion: string;
  pack: StrategyInputPack;
  busy: boolean;
  onChange: (next: DiscoveryState) => void;
  onInvestigate: (request: {
    lensId: DiscoveryLensId;
    action: DiscoveryAction;
    guidance: string;
    selectedFinding: DiscoveryFinding;
    routedFromLens?: DiscoveryLensId;
  }) => Promise<boolean>;
}) {
  const findingRef = discoveryFindingRef(finding);
  const drafts = discoveryDrafts(state);
  const comment = drafts.findings[findingRef] ?? "";
  const routeLens =
    drafts.routes[findingRef] ??
    discoveryLenses.find((lens) => lens.id !== finding.lensId)!.id;
  const snapshot =
    state.runs
      .find((run) => run.lensId === finding.lensId)
      ?.versions.find((version) => version.id === finding.researchRunId)
      ?.inputPackSnapshot ?? pack;
  const sources = discoverySourceDocuments(selectedFoundation(snapshot));
  const saved =
    state.savedFindingIds.includes(findingRef) ||
    state.savedFindingIds.includes(finding.id);
  const selected =
    state.selectedFindingIds.includes(findingRef) ||
    state.selectedFindingIds.includes(finding.id);
  const stale = finding.inputPackVersion !== currentPackVersion;
  const thread = state.findingThreads[finding.id] ?? [];
  const toggle = (key: "savedFindingIds" | "selectedFindingIds") => {
    const active = key === "savedFindingIds" ? saved : selected;
    onChange({
      ...state,
      [key]: active
        ? state[key].filter((id) => id !== finding.id && id !== findingRef)
        : [...state[key], findingRef],
    });
  };
  const investigate = async (
    action: DiscoveryAction,
    guidance = comment,
    lensId = finding.lensId,
  ) => {
    await onInvestigate({
      lensId,
      action,
      guidance,
      selectedFinding: finding,
      ...(lensId !== finding.lensId ? { routedFromLens: finding.lensId } : {}),
    });
  };
  return (
    <article className="discovery-card" aria-label={finding.title}>
      <div className="discovery-card-meta">
        <span
          className={`evidence-state ${finding.evidenceState === "research_gap" ? "gap" : ""}`}
        >
          {finding.evidenceState === "research_gap"
            ? "Research gap"
            : "Supplied evidence"}
        </span>
        {(finding.provider ??
          currentDiscoveryVersion(
            state.runs.find((run) => run.lensId === finding.lensId),
          )?.provider) === "mock" && (
          <span className="evidence-state gap">DEMO DATA</span>
        )}
        <span>Run V{finding.runVersion}</span>
        {stale && <span className="stale-flag">Needs refresh</span>}
      </div>
      <h3>{finding.title}</h3>
      <div className="discovery-field">
        <b>What we found</b>
        <p>{finding.whatWeFound}</p>
      </div>
      {finding.evidence.length ? (
        <details className="discovery-evidence" open>
          <summary>Evidence · {finding.evidence.length}</summary>
          {finding.evidence.map((evidence, index) => (
            <div key={`${evidence.source}-${index}`}>
              <span className="source-name">{evidence.source}</span>
              <blockquote>“{evidence.excerpt}”</blockquote>
              <small>
                Date: {evidence.date} · Audience: {evidence.audience} · Context:{" "}
                {evidence.context} · Access: {evidence.accessScope}
              </small>
              <details>
                <summary>Inspect supplied source</summary>
                <small>
                  {evidence.locator ||
                    sources.find((source) =>
                      [source.identity, ...source.aliases].some(
                        (name) =>
                          name.toLowerCase() === evidence.source.toLowerCase(),
                      ),
                    )?.locator ||
                    "Original supplied context"}
                </small>
                <p>
                  {sources.find((source) =>
                    [source.identity, ...source.aliases].some(
                      (name) =>
                        name.toLowerCase() === evidence.source.toLowerCase(),
                    ),
                  )?.text ||
                    "This source is not in the current snapshot. Inspect the original run's input context."}
                </p>
              </details>
            </div>
          ))}
        </details>
      ) : (
        <p className="research-gap-note">
          <CircleAlert size={14} /> No evidence-backed finding is claimed.
        </p>
      )}
      <div className="discovery-field">
        <b>Why it may matter · Agent interpretation</b>
        <p>{finding.whyItMayMatter}</p>
      </div>
      <div className="discovery-field">
        <b>What complicates it</b>
        <p>{finding.whatComplicatesIt}</p>
      </div>
      <div className="discovery-field question">
        <b>Question to explore</b>
        <p>{finding.questionToExplore}</p>
      </div>
      <div className="finding-actions">
        <button
          className={`button small ${saved ? "is-selected" : ""}`}
          onClick={() => toggle("savedFindingIds")}
        >
          {saved ? <Check size={13} /> : <Bookmark size={13} />}
          {saved ? "Saved" : "Save to My Thinking"}
        </button>
        <label className="check-action">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggle("selectedFindingIds")}
          />
          Select to connect
        </label>
        <button
          type="button"
          className="button small"
          onClick={() =>
            onChange({
              ...state,
              asideFindingIds: [
                ...new Set([...(state.asideFindingIds ?? []), findingRef]),
              ],
              selectedFindingIds: state.selectedFindingIds.filter(
                (id) => id !== findingRef && id !== finding.id,
              ),
            })
          }
        >
          Set aside
        </button>
      </div>
      <div
        className="quick-actions"
        aria-label={`Actions for ${finding.title}`}
      >
        {(
          [
            "explore_deeper",
            "find_contrary",
            "separate_audience",
            "check_recency",
            "compare_input",
          ] as DiscoveryAction[]
        ).map((action) => (
          <button
            key={action}
            className="text-button"
            disabled={busy}
            onClick={() => investigate(action)}
          >
            {actionLabels[action]}
          </button>
        ))}
      </div>
      <div className="route-finding">
        <select
          aria-label={`Route ${finding.title} to another lens`}
          value={routeLens}
          disabled={busy}
          onChange={(event) =>
            onChange({
              ...state,
              drafts: {
                ...drafts,
                routes: {
                  ...drafts.routes,
                  [findingRef]: event.target.value as DiscoveryLensId,
                },
              },
            })
          }
        >
          {discoveryLenses
            .filter((lens) => lens.id !== finding.lensId)
            .map((lens) => (
              <option key={lens.id} value={lens.id}>
                Ask {lens.shortName}
              </option>
            ))}
        </select>
        <button
          className="button small"
          disabled={busy}
          onClick={() => investigate("ask_another_lens", comment, routeLens)}
        >
          Route finding
        </button>
      </div>
      <form
        className="finding-volley"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!comment.trim()) return;
          await investigate("explore_deeper", comment);
        }}
      >
        <label className="field">
          <span>Question this finding</span>
          <textarea
            rows={2}
            value={comment}
            disabled={busy}
            placeholder="Compare it, challenge it, or ask for a narrower read…"
            onChange={(event) =>
              onChange({
                ...state,
                drafts: {
                  ...drafts,
                  findings: {
                    ...drafts.findings,
                    [findingRef]: event.target.value,
                  },
                },
              })
            }
          />
        </label>
        <button className="button small" disabled={busy || !comment.trim()}>
          <MessageSquare size={13} /> Send volley
        </button>
      </form>
      {!!thread.length && (
        <details className="finding-thread">
          <summary>Finding conversation · {thread.length}</summary>
          {thread.map((message) => (
            <p key={message.id}>
              <b>{message.author}:</b> {message.text}
              <small>
                {message.inputPackVersion} · {message.findingRef} ·{" "}
                {message.question}
              </small>
              {message.author === "Agent" && (
                <small>
                  {message.usedNewRetrieval
                    ? "New retrieval"
                    : "Existing supplied evidence only"}
                </small>
              )}
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

export default function InsightDiscoveryWorkspace({
  state,
  pack,
  briefLine,
  busy,
  onChange,
  onQuestionChange,
  onRunLens,
  onRefreshAll,
  onConnect,
  onBriefLineChange,
  onApprove,
  onRetryLens,
  onCancelLens,
}: {
  state: DiscoveryState;
  pack: StrategyInputPack;
  briefLine: string;
  busy: string[];
  onChange: (next: DiscoveryState) => void;
  onQuestionChange: (question: string, type: "problem" | "hypothesis") => void;
  onRunLens: (request: {
    lensId: DiscoveryLensId;
    action: DiscoveryAction;
    guidance: string;
    selectedFinding?: DiscoveryFinding;
    routedFromLens?: DiscoveryLensId;
  }) => Promise<boolean>;
  onRefreshAll: () => Promise<void>;
  onConnect: (guidance: string) => Promise<boolean>;
  onRetryLens: (lensId: DiscoveryLensId) => Promise<boolean>;
  onCancelLens: (lensId: DiscoveryLensId) => void;
  onBriefLineChange: (value: string) => void;
  onApprove: () => void;
}) {
  const drafts = discoveryDrafts(state);
  const agentGuidance = drafts.agents[state.selectedLensId] ?? "";
  const connectionGuidance = drafts.connections;
  const run = state.runs.find(
    (candidate) => candidate.lensId === state.selectedLensId,
  );
  const version = currentDiscoveryVersion(run);
  const findings = version?.findings ?? [];
  const allFindings = useMemo(() => knownDiscoveryFindings(state), [state]);
  const saved = state.savedFindingIds
    .map((id) => allFindings.get(id))
    .filter((finding): finding is DiscoveryFinding => Boolean(finding));
  const selected = state.selectedFindingIds
    .map((id) => allFindings.get(id))
    .filter((finding): finding is DiscoveryFinding => Boolean(finding));
  const aside = (state.asideFindingIds ?? []).flatMap((id) =>
    allFindings.get(id) ? [allFindings.get(id)!] : [],
  );
  const inspect = (finding: DiscoveryFinding) =>
    onChange({
      ...state,
      workspaceView: "discovery",
      selectedLensId: finding.lensId,
      runs: state.runs.map((run) =>
        run.lensId === finding.lensId
          ? {
              ...run,
              currentVersionId:
                finding.researchRunId ??
                run.versions.find(
                  (version) => version.number === finding.runVersion,
                )?.id ??
                run.currentVersionId,
            }
          : run,
      ),
    });
  const coverage = version?.sourceCoverage ?? discoverySourceCoverage(pack);
  const currentPackVersion = inputPackVersion(pack);
  const lens = discoveryLenses.find(
    (candidate) => candidate.id === state.selectedLensId,
  )!;
  return (
    <div className="insight-discovery">
      <section className="panel discovery-scope">
        <div className="section-title">
          <div>
            <span className="eyebrow">INSIGHT DISCOVERY</span>
            <h2>Investigate before you decide.</h2>
            <p>
              Five evidence disciplines, one shared context. Findings inform
              Kevin’s strategy; they do not write or approve it.
            </p>
          </div>
          <span className="pack-version">Input pack {currentPackVersion}</span>
          <button
            type="button"
            className="button small"
            onClick={() =>
              onChange({
                ...state,
                workspaceView:
                  state.workspaceView === "canvas" ? "discovery" : "canvas",
              })
            }
          >
            {state.workspaceView === "canvas"
              ? "Return to Discovery"
              : "Open strategy canvas"}
          </button>
        </div>
        <div className="investigation-controls">
          <label className="field investigation-type">
            <span>Investigation mode</span>
            <select
              value={state.investigationType}
              onChange={(event) =>
                onQuestionChange(
                  state.question,
                  event.target.value as "problem" | "hypothesis",
                )
              }
            >
              <option value="problem">Explore a problem</option>
              <option value="hypothesis">Investigate a hypothesis</option>
            </select>
          </label>
          <label className="field investigation-question">
            <span>Problem under investigation</span>
            <textarea
              rows={2}
              value={state.question}
              placeholder="What might explain the behavior or campaign problem?"
              onChange={(event) =>
                onQuestionChange(event.target.value, state.investigationType)
              }
            />
            <small>
              Editing this question never rewrites the original RTB, JTBD or
              brief.
            </small>
          </label>
          <button
            className="button"
            disabled={busy.length > 0 || !state.question.trim()}
            onClick={onRefreshAll}
          >
            <RefreshCw size={14} /> Refresh all lenses
          </button>
        </div>
        <details className="source-coverage">
          <summary>
            <Database size={14} /> Source coverage
          </summary>
          <div className="source-coverage-grid">
            {coverage.map((source) => (
              <div key={source.source}>
                <b>{source.source}</b>
                <span className={`source-status ${source.status}`}>
                  {statusLabel(source.status)}
                </span>
                <p>{source.detail}</p>
              </div>
            ))}
          </div>
        </details>
      </section>

      <div className="lens-tabs" role="tablist" aria-label="Research lenses">
        {discoveryLenses.map((candidate) => {
          const candidateRun = state.runs.find(
            (item) => item.lensId === candidate.id,
          );
          return (
            <button
              key={candidate.id}
              role="tab"
              id={`discovery-tab-${candidate.id}`}
              data-lens={candidate.id}
              aria-controls={`discovery-lens-${candidate.id}`}
              tabIndex={candidate.id === state.selectedLensId ? 0 : -1}
              aria-selected={candidate.id === state.selectedLensId}
              className={`${candidate.color} ${candidate.id === state.selectedLensId ? "active" : ""}`}
              onClick={() =>
                onChange({ ...state, selectedLensId: candidate.id })
              }
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const index = discoveryLenses.findIndex(
                  (item) => item.id === candidate.id,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? discoveryLenses.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          discoveryLenses.length) %
                        discoveryLenses.length;
                onChange({
                  ...state,
                  selectedLensId: discoveryLenses[next].id,
                });
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(
                    `[data-lens="${discoveryLenses[next].id}"]`,
                  )
                  ?.focus();
              }}
            >
              <span>{candidate.icon}</span>
              <b>{candidate.shortName}</b>
              <small>
                {candidateRun?.status ?? "idle"}
                {currentDiscoveryVersion(candidateRun)?.findings.some(
                  (finding) => finding.inputPackVersion !== currentPackVersion,
                )
                  ? " · Needs refresh"
                  : ""}
              </small>
            </button>
          );
        })}
      </div>

      <div
        className={`discovery-layout ${state.workspaceView === "canvas" ? "canvas-view" : ""}`}
      >
        <section
          className="discoveries-column"
          role="tabpanel"
          id={`discovery-lens-${lens.id}`}
          aria-labelledby={`discovery-tab-${lens.id}`}
          aria-label={`${lens.name} findings`}
        >
          <div className="section-title compact">
            <div>
              <span className="eyebrow">DISCOVERIES · {lens.name}</span>
              <h2>{lens.question}</h2>
              <p>{lens.purpose}</p>
            </div>
            {version && (
              <label className="version-picker">
                <History size={13} />
                <select
                  aria-label={`Version history for ${lens.name}`}
                  value={version.id}
                  onChange={(event) =>
                    onChange({
                      ...state,
                      runs: state.runs.map((item) =>
                        item.lensId === lens.id
                          ? { ...item, currentVersionId: event.target.value }
                          : item,
                      ),
                    })
                  }
                >
                  {run?.versions.map((item) => (
                    <option value={item.id} key={item.id}>
                      V{item.number} · {actionLabels[item.action]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {run?.error && (
            <div className="lens-error">
              <div className="error" role="alert">
                {run.error}
              </div>
              <button
                className="button small"
                disabled={busy.includes(lens.id)}
                onClick={() => onRetryLens(lens.id)}
              >
                <RefreshCw size={13} /> Retry this lens
              </button>
            </div>
          )}
          {busy.includes(lens.id) && (
            <button
              type="button"
              className="button small"
              onClick={() => onCancelLens(lens.id)}
            >
              Cancel this lens
            </button>
          )}
          {run?.status === "researching" && !findings.length && (
            <div className="discovery-loading">
              <Search size={20} /> Researching this lens using supplied
              evidence…
            </div>
          )}
          {!findings.length && run?.status !== "researching" && (
            <div className="empty discovery-empty">
              No findings yet. Run this lens or refine the investigation
              question.
            </div>
          )}
          <div className="discovery-cards">
            {findings
              .filter(
                (finding) =>
                  !(state.asideFindingIds ?? []).includes(
                    discoveryFindingRef(finding),
                  ),
              )
              .map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  state={state}
                  currentPackVersion={currentPackVersion}
                  pack={pack}
                  busy={busy.includes(lens.id)}
                  onChange={onChange}
                  onInvestigate={onRunLens}
                />
              ))}
          </div>
          <form
            className="panel agent-volley"
            onSubmit={async (event) => {
              event.preventDefault();
              await onRunLens({
                lensId: lens.id,
                action: "explore_deeper",
                guidance: agentGuidance,
              });
            }}
          >
            <span className="eyebrow">
              VOLLEY WITH {lens.shortName.toUpperCase()}
            </span>
            <label className="field">
              <span>Redirect this lens</span>
              <textarea
                rows={3}
                value={agentGuidance}
                disabled={busy.includes(lens.id)}
                placeholder="Focus the investigation, identify a conflict, or narrow the audience…"
                onChange={(event) =>
                  onChange({
                    ...state,
                    drafts: {
                      ...drafts,
                      agents: {
                        ...drafts.agents,
                        [lens.id]: event.target.value,
                      },
                    },
                  })
                }
              />
            </label>
            <button
              className="button"
              disabled={busy.includes(lens.id) || !agentGuidance.trim()}
            >
              Explore deeper
            </button>
          </form>
          {!!run?.thread.length && (
            <details className="agent-thread">
              <summary>Lens conversation · {run.thread.length}</summary>
              {run.thread.map((message) => (
                <p key={message.id}>
                  <b>{message.author}:</b> {message.text}
                  <small>
                    {message.inputPackVersion} · {message.question}
                  </small>
                </p>
              ))}
            </details>
          )}
        </section>

        <aside className="my-thinking" aria-label="My Thinking">
          <div className="section-title compact">
            <div>
              <span className="eyebrow">MY THINKING · HUMAN AUTHORED</span>
              <h2>Kevin’s working space</h2>
            </div>
          </div>
          <label className="field">
            <span>Problem statement · human authored</span>
            <textarea
              rows={3}
              value={state.problemStatement ?? ""}
              placeholder="What is the issue to overcome? Keep this separate from the upstream RTB and research question."
              onChange={(event) =>
                onChange({ ...state, problemStatement: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Evidence / insights · human synthesis</span>
            <textarea
              rows={4}
              value={state.evidenceInsights ?? ""}
              placeholder="Record what the supplied evidence supports, with references to saved discoveries."
              onChange={(event) =>
                onChange({ ...state, evidenceInsights: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Working hypothesis</span>
            <textarea
              rows={4}
              value={state.hypothesis}
              placeholder="A possible explanation—not yet a fact…"
              onChange={(event) =>
                onChange({ ...state, hypothesis: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Strategic direction · human authored</span>
            <textarea
              rows={5}
              value={state.strategicDirection ?? state.notes}
              placeholder="What should the work do to answer the problem?"
              onChange={(event) =>
                onChange({ ...state, strategicDirection: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Open questions</span>
            <textarea
              rows={4}
              value={state.openQuestions}
              placeholder="What still needs evidence or clarification?"
              onChange={(event) =>
                onChange({ ...state, openQuestions: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Private working notes</span>
            <textarea
              rows={3}
              value={state.notes}
              onChange={(event) =>
                onChange({ ...state, notes: event.target.value })
              }
            />
          </label>
          <div className="saved-findings">
            <h3>
              Saved discoveries <span className="count">{saved.length}</span>
            </h3>
            {saved.length ? (
              saved.map((finding) => (
                <SavedDiscoveryFinding
                  key={discoveryFindingRef(finding)}
                  finding={finding}
                  currentPackVersion={currentPackVersion}
                  onInspect={() => inspect(finding)}
                />
              ))
            ) : (
              <p className="muted">Save findings worth considering here.</p>
            )}
          </div>
          {!!aside.length && (
            <details className="aside-findings">
              <summary>Set aside findings · {aside.length}</summary>
              {aside.map((finding) => (
                <div key={discoveryFindingRef(finding)}>
                  <SavedDiscoveryFinding
                    finding={finding}
                    currentPackVersion={currentPackVersion}
                    onInspect={() => inspect(finding)}
                  />
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      onChange({
                        ...state,
                        asideFindingIds: (state.asideFindingIds ?? []).filter(
                          (id) => id !== discoveryFindingRef(finding),
                        ),
                      })
                    }
                  >
                    Restore finding
                  </button>
                </div>
              ))}
            </details>
          )}
          <div className="connect-findings">
            <h3>Connect selected findings</h3>
            <p>{selected.length} exact finding versions selected.</p>
            <textarea
              rows={2}
              value={connectionGuidance}
              aria-label="Connection guidance"
              placeholder="Optional: what relationship should the connection examine?"
              onChange={(event) =>
                onChange({
                  ...state,
                  drafts: { ...drafts, connections: event.target.value },
                })
              }
            />
            <button
              className="button"
              disabled={
                selected.length < 2 ||
                selected.length > 12 ||
                busy.includes("connections")
              }
              onClick={async () => {
                await onConnect(connectionGuidance);
              }}
            >
              <GitMerge size={14} /> Connect these findings
            </button>
            {state.connectionNotes.map((connection) => (
              <div className="connection-note" key={connection.id}>
                <span>INTERPRETATION · NOT VALIDATION</span>
                {connection.demo && <span>DEMO DATA</span>}
                <textarea
                  rows={5}
                  value={connection.note}
                  aria-label="Edit connection note"
                  onChange={(event) =>
                    onChange({
                      ...state,
                      connectionNotes: state.connectionNotes.map((item) =>
                        item.id === connection.id
                          ? {
                              ...item,
                              note: event.target.value,
                              editedByKevin: true,
                            }
                          : item,
                      ),
                    })
                  }
                />
                <details>
                  <summary>Relationships, tensions and questions</summary>
                  {connection.findingVersions.map((reference) => (
                    <small
                      key={`${reference.findingId}@${reference.runVersion}`}
                    >
                      {reference.findingId} · V{reference.runVersion} ·{" "}
                      {reference.inputPackVersion} · Run{" "}
                      {reference.researchRunId}
                    </small>
                  ))}
                  {[
                    ...connection.relationships,
                    ...connection.tensions,
                    ...connection.questions,
                  ].map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </details>
              </div>
            ))}
          </div>
          <details className="whole-brief" open>
            <summary>Open whole brief canvas</summary>
            <dl>
              <dt>Context</dt>
              <dd>{pack.campaignName || "Not supplied"}</dd>
              <dt>Objective</dt>
              <dd>{pack.objective || "Not supplied"}</dd>
              <dt>Audience</dt>
              <dd>{pack.audience || "Not supplied"}</dd>
              <dt>Proof / RTB</dt>
              <dd>{pack.reasonToBelieve || "Not supplied"}</dd>
              <dt>Original JTBD</dt>
              <dd>
                {extractJobToBeDone(pack.parsedIMC?.sourceText) ||
                  "Not supplied"}
              </dd>
              <dt>Upstream RTB approval</dt>
              <dd>
                {pack.rtbApprovalStatus ?? "unknown"} · strategy approval does
                not approve product proof
              </dd>
              <dt>Product</dt>
              <dd>{pack.product || "Not supplied"}</dd>
              <dt>Channel</dt>
              <dd>{pack.channel || "Not supplied"}</dd>
              <dt>Mandatories</dt>
              <dd>{pack.constraints || "Not supplied"}</dd>
            </dl>
            <label className="field human-brief-line">
              <span>Brief line · written by Kevin</span>
              <textarea
                rows={3}
                value={briefLine}
                placeholder="Write the single-minded line Creative must communicate…"
                onChange={(event) => onBriefLineChange(event.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={!briefLine.trim()}
              onClick={onApprove}
            >
              Approve human-authored strategy <ArrowRight size={14} />
            </button>
          </details>
          <small className="context-integrity">
            Current context: {currentPackVersion}. Findings retain the exact
            input-pack version they analyzed.
          </small>
        </aside>
      </div>
    </div>
  );
}
