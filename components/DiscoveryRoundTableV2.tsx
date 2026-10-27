"use client";

import { useRef, useState, type ComponentProps } from "react";
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Expand,
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
} from "@/lib/discovery";
import { discoveryDrafts } from "@/lib/discovery-state";
import {
  discoverySourceDocuments,
  locatedDiscoveryCitation,
} from "@/lib/discovery-sources";
import { discoveryFoundation } from "@/lib/discovery-context";
import type {
  DiscoveryAction,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryThreadMessage,
} from "@/lib/types";
import type InsightDiscoveryWorkspace from "./InsightDiscoveryWorkspace";
import DynamicInputPackDetails from "./DynamicInputPackDetails";
import DemoModelSelector, { type DemoModel } from "./DemoModelSelector";
import WorkingSpace from "./WorkingSpace";
import { briefInvestigationQuestions } from "@/lib/discovery-questions";
import { campaignDisplayLabel } from "@/lib/campaign-naming";
import { discoveryDisplayStatus } from "@/lib/discovery-display";
import {
  campaignGenerations,
  conversationHistory,
  conversationRegenerationRequest,
  matchesInvestigation,
} from "@/lib/roundtable-history";

type Props = ComponentProps<typeof InsightDiscoveryWorkspace> & {
  restoredVersionIds?: string[];
};
// User-facing summaries only. Each agent's full method stays in
// lib/discovery-rubrics.ts and the Discovery prompts.
const summaries: Record<DiscoveryLensId, { thinking: string; focus: string }> =
  {
    consumer: {
      thinking:
        "Explores people's needs, motivations, barriers, and differences between audiences.",
      focus: "Consumer behavior, unmet needs, and evidence gaps.",
    },
    culture: {
      thinking:
        "Explores cultural patterns, social behaviors, and wider trends that may influence people.",
      focus: "Social context, emerging tensions, and cultural relevance.",
    },
    category: {
      thinking:
        "Examines competitors, alternatives, category conventions, and opportunities to differentiate.",
      focus: "Market dynamics, competitive choices, and category gaps.",
    },
    brand: {
      thinking:
        "Evaluates brand positioning, product claims, and what the available evidence can substantiate.",
      focus: "Brand credibility, supporting proof, and claim limitations.",
    },
    analogous: {
      thinking:
        "Explores how similar problems have been approached in other industries and contexts.",
      focus: "Comparable approaches, transferable ideas, and evidence gaps.",
    },
  };
const agentName = (id: DiscoveryLensId) =>
  `${id === "analogous" ? "Analogous Solutions" : discoveryLenses.find((lens) => lens.id === id)!.shortName} Agent`;
// Reading position is remembered per agent and per research version, so
// paging one agent never moves another and older versions keep their place.
const positionKey = (lensId: DiscoveryLensId, versionId: string) =>
  `${lensId}:${versionId}`;
const researchActions: {
  action: DiscoveryAction;
  label: string;
  guidance: string;
}[] = [
  {
    action: "explore_deeper",
    label: "Explore deeper",
    guidance:
      "Examine more available detail and identify what needs another source.",
  },
  {
    action: "find_contrary",
    label: "Find contrary evidence",
    guidance:
      "Look for supplied evidence that challenges this interpretation; report limitations if none is available.",
  },
  {
    action: "separate_audience",
    label: "Separate by audience",
    guidance:
      "Compare only audience groups supported by the supplied material.",
  },
  {
    action: "check_recency",
    label: "Check recency",
    guidance:
      "Check supplied dates and explain when recency cannot be established.",
  },
  {
    action: "compare_input",
    label: "Compare with Input Pack",
    guidance:
      "Compare this interpretation with the selected Input Pack records and identify agreements, contradictions and gaps.",
  },
];
function retrievalLabel(message: DiscoveryThreadMessage) {
  switch (message.retrievalStatus) {
    case "simulated_fixture":
      return "Simulated retrieval fixture · not live research";
    case "unavailable":
      return "External retrieval unavailable · supplied sources only";
    case "failed":
      return "Research source failed · no new evidence verified";
    case "insufficient":
      return "Insufficient supplied evidence · no new result claimed";
    case "supplied_only":
      return "Existing supplied evidence only";
    default:
      return "Source activity not recorded for this earlier reply · inspect its evidence";
  }
}
function messageStatusLabel(message: DiscoveryThreadMessage) {
  switch (message.status) {
    case "pending":
      return "Pending";
    case "failed":
      return "Failed · retry below";
    case "interrupted":
      return "Interrupted · not sent again automatically";
    case "cancelled":
      return "Stopped";
    case "complete":
      return message.author === "Kevin" ? "Sent" : "Complete";
    default:
      return message.author === "Kevin" ? "Sent" : "Complete";
  }
}
export default function DiscoveryRoundTableV2(props: Props) {
  const {
    state,
    pack,
    busy,
    onChange,
    onQuestionChange,
    onRunLens,
    onRefreshAll,
    onRetryLens,
    onCancelLens,
    packLabel,
  } = props;
  const comparisonPanel = useRef<HTMLDetailsElement>(null);
  const [showPack, setShowPack] = useState(false);
  const [demoModelsByLens, setDemoModelsByLens] = useState<
    Record<DiscoveryLensId, DemoModel>
  >({
    consumer: "Palmyra X5",
    culture: "Palmyra X5",
    category: "Palmyra X5",
    brand: "Palmyra X5",
    analogous: "Palmyra X5",
  });
  // Reading history is not activation. These references never change the
  // persisted current generation or Kevin's draft and are context-scoped.
  const [viewedGenerations, setViewedGenerations] = useState<
    Record<string, string>
  >({});
  const [allAgentGuidance, setAllAgentGuidance] = useState("");
  // UI-only: paging stored findings never writes Discovery state or calls AI.
  const [findingPositions, setFindingPositions] = useState<
    Record<string, string>
  >({});
  // Per Input Pack: how many brief questions were suggested, and the last
  // question Kevin wrote himself before a suggestion replaced it.
  const [questionTurns, setQuestionTurns] = useState<Record<string, number>>(
    {},
  );
  const [ownQuestions, setOwnQuestions] = useState<Record<string, string>>({});
  const composerRefs = useRef<
    Partial<Record<DiscoveryLensId, HTMLTextAreaElement | null>>
  >({});
  const lastFocusedLens = useRef<DiscoveryLensId | null>(null);
  const drafts = discoveryDrafts(state);
  const mode = state.investigationType;
  const focus = state.focusByMode?.[mode] ?? "";
  const packVersion = inputPackVersion(pack);
  const originalJTBD = pack.originalJTBD?.trim() ?? "";
  const hasSource = Boolean(pack.parsedIMC?.sourceText.trim());
  const canRun = hasSource && Boolean(focus.trim());
  function openComparison() {
    requestAnimationFrame(() => {
      if (comparisonPanel.current) {
        comparisonPanel.current.open = true;
        comparisonPanel.current
          .querySelector("summary")
          ?.focus({ preventScroll: true });
        comparisonPanel.current.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    });
  }
  const briefQuestions = briefInvestigationQuestions(pack);
  const questionTurn = questionTurns[packVersion] ?? 0;
  const ownQuestion = ownQuestions[packVersion];
  // Each click fills the focus with the next brief question, skipping the one
  // already shown. Instant and local: no model call, nothing is sent.
  function suggestQuestion() {
    if (!briefQuestions.length) return;
    let turn = questionTurn;
    while (
      briefQuestions.length > 1 &&
      briefQuestions[turn % briefQuestions.length] === focus.trim()
    )
      turn += 1;
    if (focus.trim() && !briefQuestions.includes(focus.trim()))
      setOwnQuestions((current) => ({ ...current, [packVersion]: focus }));
    setQuestionTurns((current) => ({ ...current, [packVersion]: turn + 1 }));
    onQuestionChange(briefQuestions[turn % briefQuestions.length], "problem");
  }
  function runAll() {
    // The feature owns the current state snapshot for the batch. Do not write
    // this render's state after a same-event question edit.
    void onRefreshAll();
  }
  function focusConversation(lensId: DiscoveryLensId) {
    requestAnimationFrame(() => {
      composerRefs.current[lensId]?.focus({ preventScroll: true });
      composerRefs.current[lensId]?.scrollIntoView({ block: "nearest" });
    });
  }
  function focusLens(lensId: DiscoveryLensId) {
    lastFocusedLens.current = lensId;
    onChange({ ...state, focusedLensId: lensId });
    requestAnimationFrame(() => {
      const heading = document.getElementById(`v2-agent-title-${lensId}`);
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "nearest" });
    });
  }
  function showAllLenses() {
    onChange({ ...state, focusedLensId: undefined });
    requestAnimationFrame(() => {
      const expand = document.getElementById(
        `v2-expand-${lastFocusedLens.current ?? "consumer"}`,
      );
      expand?.focus({ preventScroll: true });
      expand?.scrollIntoView({ block: "nearest" });
    });
  }
  function findingVersionId(finding: DiscoveryFinding) {
    return (
      finding.researchRunId ??
      state.runs
        .find((run) => run.lensId === finding.lensId)
        ?.versions.find((version) => version.number === finding.runVersion)?.id
    );
  }
  function showFinding(finding: DiscoveryFinding) {
    const versionId = findingVersionId(finding);
    if (!versionId) return;
    setFindingPositions((positions) => ({
      ...positions,
      [positionKey(finding.lensId, versionId)]: discoveryFindingRef(finding),
    }));
  }
  function inspect(finding: DiscoveryFinding) {
    lastFocusedLens.current = finding.lensId;
    showFinding(finding);
    const key = `${packVersion}:${mode}:${focus}:${finding.lensId}`;
    setViewedGenerations((current) => ({
      ...current,
      [key]: findingVersionId(finding)!,
    }));
    onChange({
      ...state,
      workspaceView: "discovery",
      focusedLensId: finding.lensId,
      selectedLensId: finding.lensId,
    });
    requestAnimationFrame(() => {
      document
        .getElementById(`v2-agent-title-${finding.lensId}`)
        ?.focus({ preventScroll: true });
    });
  }
  function discussFinding(finding: DiscoveryFinding) {
    showFinding(finding);
    onChange({
      ...state,
      activeFindingRefs: {
        ...state.activeFindingRefs,
        [finding.lensId]: discoveryFindingRef(finding),
      },
    });
    focusConversation(finding.lensId);
  }
  function toggleFinding(
    key: "savedFindingIds" | "selectedFindingIds",
    finding: DiscoveryFinding,
  ) {
    const ref = discoveryFindingRef(finding),
      active = state[key].includes(ref) || state[key].includes(finding.id);
    onChange({
      ...state,
      [key]: active
        ? state[key].filter((id) => id !== ref && id !== finding.id)
        : [...state[key], ref],
    });
  }
  // The summary, citation and Save / Compare stay visible. Evidence,
  // interpretation, limits and the follow-up question sit behind one disclosure.
  function findingCard(finding: DiscoveryFinding) {
    const ref = discoveryFindingRef(finding),
      saved =
        state.savedFindingIds.includes(ref) ||
        state.savedFindingIds.includes(finding.id);
    const selected =
      state.selectedFindingIds.includes(ref) ||
      state.selectedFindingIds.includes(finding.id);
    const sourcePack =
      state.runs
        .find((run) => run.lensId === finding.lensId)
        ?.versions.find((version) => version.id === finding.researchRunId)
        ?.inputPackSnapshot ?? pack;
    const sources = discoverySourceDocuments(discoveryFoundation(sourcePack));
    return (
      <article className="v2-finding" key={ref} aria-label={finding.title}>
        <span className="v2-result-type">
          {finding.evidenceState === "research_gap"
            ? "Research gap · Agent interpretation · unverified"
            : "Agent interpretation · unverified"}
          {finding.provider === "mock" ? " · DEMO DATA" : ""} · V
          {finding.runVersion - 1}
        </span>
        <h4>{finding.title}</h4>
        <p>{finding.whatWeFound}</p>
        <p className="v2-evidence-source">
          Source citation ·{" "}
          {finding.evidence.length
            ? [...new Set(finding.evidence.map((item) => item.source))].join(
                ", ",
              )
            : "Research gap · source needed"}
        </p>
        {finding.inputPackVersion !== packVersion && (
          <p className="v2-stale">Earlier input pack · review or refresh</p>
        )}
        <div className="v2-finding-actions">
          <button
            className={`button small ${saved ? "is-selected" : ""}`}
            onClick={() => toggleFinding("savedFindingIds", finding)}
          >
            {saved ? <Check size={12} /> : <Bookmark size={12} />}
            {saved
              ? "Selected as a creative consideration"
              : "Save as a creative consideration"}
          </button>
        </div>
        <label className="v2-compare">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleFinding("selectedFindingIds", finding)}
          />
          Compare
        </label>
        <details className="v2-evidence">
          <summary>
            {finding.evidence.length
              ? `${finding.evidence.length} source excerpt${finding.evidence.length === 1 ? "" : "s"}, interpretation & limits`
              : "Why this is a gap & what to investigate"}
          </summary>
          {finding.evidence.map((evidence, i) => {
            const located = locatedDiscoveryCitation(sources, evidence);
            const possibleSource =
              located ??
              sources.find((source) =>
                [source.identity, ...source.aliases].some(
                  (name) =>
                    name.toLowerCase() === evidence.source.toLowerCase(),
                ),
              );
            const sourceMetadata = [
              ["Date", evidence.date],
              ["Audience", evidence.audience],
              ["Context", evidence.context],
            ]
              .filter(([, value]) =>
                Boolean(value?.trim() && value.trim() !== "Not supplied"),
              )
              .map(([label, value]) => `${label}: ${value}`);
            return (
              <div key={i}>
                <b>{evidence.source}</b>
                <span className="v2-citation-status">
                  {located
                    ? `Source excerpt matched · ${located.locator}`
                    : "Location not verified — review source"}
                </span>
                <blockquote>{evidence.excerpt}</blockquote>
                <small>
                  {[...sourceMetadata, `Access: ${evidence.accessScope}`].join(
                    " · ",
                  )}
                </small>
                <small>
                  The source match does not independently verify its claim or
                  this agent&apos;s interpretation.
                </small>
                <details>
                  <summary>Inspect supplied source span</summary>
                  <small>
                    {located?.locator ||
                      "Location not verified — review source"}
                  </small>
                  <p>
                    {possibleSource?.text ||
                      "Inspect the retained original research snapshot."}
                  </p>
                </details>
              </div>
            );
          })}
          {!finding.evidence.length && (
            <p>
              No supported finding is claimed. This is a question or research
              gap.
            </p>
          )}
          <b>Why it may matter · Agent interpretation</b>
          <p>{finding.whyItMayMatter}</p>
          <b>What complicates it</b>
          <p>{finding.whatComplicatesIt}</p>
          <b>Question to explore</b>
          <p>{finding.questionToExplore}</p>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onChange({
                ...state,
                asideFindingIds: [
                  ...new Set([...(state.asideFindingIds ?? []), ref]),
                ],
              })
            }
          >
            Set aside this finding
          </button>
        </details>
      </article>
    );
  }
  return (
    <div className="insight-discovery discovery-v2">
      <div className="v2-research-content">
        <div className="v2-pack-strip">
          <strong>Dynamic Input Pack · {packLabel ?? packVersion}</strong>
          <span>Campaign: {campaignDisplayLabel(pack)}</span>
          <span>
            {originalJTBD
              ? "Original JTBD supplied"
              : "Original JTBD not explicitly supplied"}
          </span>
          <span>
            {pack.proposedRTB
              ? "XC RTB adaptation selected"
              : "No XC RTB adaptation selected"}
          </span>
          <span>
            {pack.reasonToBelieve
              ? "Original RTB supplied"
              : "Original RTB not supplied"}
          </span>
          <span>{pack.selectedResearch?.length ?? 0} data points</span>
          <span>{pack.selectedSparks?.length ?? 0} sparks</span>
          <button
            type="button"
            className="text-button"
            aria-expanded={showPack}
            onClick={() => setShowPack((open) => !open)}
          >
            {showPack ? "Hide full pack" : "Show full pack"} ▾
          </button>
        </div>
        <section className="panel v2-kickoff">
          <div className="section-title">
            <div>
              <h2>Collaborate with your round table</h2>
              <p>
                Tell your thinking partners what to investigate. They use this
                plus the whole Dynamic Input Pack.
              </p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canRun) runAll();
            }}
          >
            <div className="v2-focus-controls">
              <label className="field">
                <span>
                  What should the round table investigate?{" "}
                  <span className="required">Required · your input</span>
                </span>
                <textarea
                  rows={3}
                  aria-label="What should we investigate?"
                  required
                  maxLength={8000}
                  value={focus}
                  aria-describedby="investigation-focus-help"
                  placeholder="Write the problem or question you want all agents to explore…"
                  onChange={(event) =>
                    onQuestionChange(event.target.value, mode)
                  }
                />
                <small id="investigation-focus-help">
                  Written or confirmed by you. This focus and the full Dynamic
                  Input Pack go to every agent. It does not rewrite the original
                  brief or RTB.
                </small>
              </label>
            </div>
            <div className="v2-kickoff-actions">
              <div className="v2-suggestions">
                <button
                  type="button"
                  className="button"
                  onClick={suggestQuestion}
                >
                  <RefreshCw size={14} aria-hidden />
                  {questionTurn
                    ? "Suggest another question"
                    : "Suggest a question from the brief"}
                </button>
                {questionTurn > 0 && (
                  <small aria-live="polite">
                    Question {((questionTurn - 1) % briefQuestions.length) + 1}{" "}
                    of {briefQuestions.length} from this brief · edit it freely
                  </small>
                )}
                {ownQuestion !== undefined && focus !== ownQuestion && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onQuestionChange(ownQuestion, "problem")}
                  >
                    Restore your question
                  </button>
                )}
              </div>
              <button
                className="button primary"
                disabled={!canRun || busy.some((id) => id !== "connections")}
              >
                <Search size={15} />
                Start Roundtable Discussion
              </button>
            </div>
          </form>
          {!hasSource && (
            <p className="context-note">
              Add an IMC brief in Input pack to run research. Working space is
              available for writing now.
            </p>
          )}
          <details className="v2-pack-content" open={showPack}>
            <summary>Shared context from the Dynamic Input Pack</summary>
            <DynamicInputPackDetails pack={pack} discovery={state} />
            <details>
              <summary>Inspect complete original IMC brief</summary>
              <pre>
                {pack.parsedIMC?.sourceText || "No IMC brief supplied."}
              </pre>
            </details>
            {!!pack.imcRecords?.length && (
              <details>
                <summary>Distinct labeled records from the IMC brief</summary>
                {pack.imcRecords.map((record) => (
                  <p key={record.id}>
                    <b>
                      {record.label} · line {record.line}
                    </b>
                    <br />
                    {record.text}
                  </p>
                ))}
              </details>
            )}
            <details>
              <summary>
                Source coverage · supplied documents and connection status
              </summary>
              <div className="source-coverage-grid">
                {discoverySourceCoverage(
                  pack,
                  state.runs.some(
                    (run) =>
                      currentDiscoveryVersion(run)?.inputPackVersion ===
                      packVersion,
                  ),
                ).map((source) => (
                  <div key={source.source}>
                    <b>{source.source}</b>
                    <span>
                      {source.status === "connected_searched"
                        ? "Supplied context analyzed"
                        : source.status.replaceAll("_", " ")}
                    </span>
                    <p>{source.detail}</p>
                  </div>
                ))}
              </div>
            </details>
          </details>
          {state.runs.some((run) => run.versions.length > 0) && (
            <details>
              <summary>Roundtable discussion history</summary>
              {[
                ...new Set(
                  state.runs.flatMap((run) =>
                    run.versions.map((version) => version.question),
                  ),
                ),
              ].map((question) => (
                <button
                  className="text-button"
                  type="button"
                  key={question}
                  onClick={() =>
                    onChange({
                      ...state,
                      question,
                      focusByMode: { ...state.focusByMode, problem: question },
                      runs: state.runs.map((run) => ({
                        ...run,
                        currentVersionId:
                          run.versions.find(
                            (version) => version.question === question,
                          )?.id ?? run.currentVersionId,
                      })),
                    })
                  }
                >
                  {question}
                </button>
              ))}
            </details>
          )}
        </section>
        <div className="section-title v2-roundtable-title">
          <div>
            <h2>Agent Roundtable — Discovery Insights</h2>
            <p>
              Read each agent’s insights and talk to it directly underneath.
              Save the ideas you want to carry into Finalize Strategy.
            </p>
            <small>
              Tick findings on two or more cards to compare them. Expand an
              agent to see its evidence and history.
            </small>
          </div>
          <div className="v2-roundtable-actions">
            {!!state.selectedFindingIds.length && (
              <button className="button" onClick={openComparison}>
                {state.selectedFindingIds.length} findings selected · Compare in
                Discovery
              </button>
            )}
            {state.focusedLensId && (
              <button className="button" onClick={showAllLenses}>
                Show all five agents
              </button>
            )}
          </div>
        </div>
        <div
          className={`v2-agent-grid ${state.focusedLensId ? "is-focused" : ""}`}
        >
          {discoveryLenses
            .filter(
              (lens) => !state.focusedLensId || lens.id === state.focusedLensId,
            )
            .map((lens) => {
              const name = agentName(lens.id),
                expanded = state.focusedLensId === lens.id,
                run = state.runs.find((run) => run.lensId === lens.id);
              const generations = campaignGenerations(run, pack);
              const current = generations.find(
                (item) => item.id === run?.currentVersionId,
              );
              const activeVersion = matchesInvestigation(
                current,
                pack,
                focus,
                mode,
              )
                ? current
                : undefined;
              const viewKey = `${packVersion}:${mode}:${focus}:${lens.id}`;
              const viewed = generations.find(
                (item) => item.id === viewedGenerations[viewKey],
              );
              const version = viewed ?? activeVersion;
              const steering = drafts.generations?.[lens.id] ?? "";
              const conversations = conversationHistory(state, lens.id, pack);
              const activeRef = state.activeFindingRefs?.[lens.id];
              const selectedFinding = activeRef
                ? generations
                    .flatMap((item) => item.findings)
                    .find(
                      (finding) => discoveryFindingRef(finding) === activeRef,
                    )
                : undefined;
              const all = version?.findings ?? [],
                findings = all.filter(
                  (finding) =>
                    !(state.asideFindingIds ?? []).includes(
                      discoveryFindingRef(finding),
                    ),
                );
              const storedPosition = version
                ? findingPositions[positionKey(lens.id, version.id)]
                : undefined;
              // Without a stored position, open on the finding being discussed,
              // or on the finding a follow-up just revised, before the first.
              const defaultIndex = findings.findIndex(
                (finding) => discoveryFindingRef(finding) === activeRef,
              );
              const findingIndex = Math.max(
                0,
                storedPosition !== undefined
                  ? findings.findIndex(
                      (finding) =>
                        discoveryFindingRef(finding) === storedPosition,
                    )
                  : defaultIndex >= 0 || !version?.revisesFindingRef
                    ? defaultIndex
                    : findings.findIndex(
                        (finding) => finding.researchRunId === version.id,
                      ),
              );
              const shownFinding = findings[findingIndex];
              const pageFinding = (step: -1 | 1) => {
                const next = findings[findingIndex + step];
                if (version && next)
                  setFindingPositions((positions) => ({
                    ...positions,
                    [positionKey(lens.id, version.id)]:
                      discoveryFindingRef(next),
                  }));
              };
              const message = selectedFinding
                ? (drafts.findings[discoveryFindingRef(selectedFinding)] ?? "")
                : (drafts.agents[lens.id] ?? "");
              // Automatic generation runs already appear in the result and evidence log.
              // Keep stored messages intact, but reserve conversation for direct exchanges.
              const working = busy.includes(lens.id),
                stale =
                  version &&
                  (version.inputPackVersion !== packVersion ||
                    version.question.trim() !== focus.trim() ||
                    version.investigationType !== mode);
              const requestInScope =
                !run?.retryRequest ||
                ((!run.retryRequest.inputPackVersion ||
                  run.retryRequest.inputPackVersion === packVersion) &&
                  (!run.retryRequest.question ||
                    run.retryRequest.question.trim() === focus.trim()) &&
                  (!run.retryRequest.investigationType ||
                    run.retryRequest.investigationType === mode));
              const conversationOperation =
                run?.retryRequest?.operation === "conversation";
              const status = discoveryDisplayStatus({
                working: working && requestInScope && !conversationOperation,
                status:
                  requestInScope && !conversationOperation
                    ? run?.status
                    : activeVersion
                      ? "complete"
                      : "idle",
                stale: false,
                hasVersion: Boolean(activeVersion),
                hasHistory: false,
              });
              const setMessage = (text: string) =>
                onChange({
                  ...state,
                  drafts: selectedFinding
                    ? {
                        ...drafts,
                        findings: {
                          ...drafts.findings,
                          [discoveryFindingRef(selectedFinding)]: text,
                        },
                      }
                    : {
                        ...drafts,
                        agents: { ...drafts.agents, [lens.id]: text },
                      },
                });
              const sourceVersion = selectedFinding
                ? run?.versions.find(
                    (item) => item.id === selectedFinding.researchRunId,
                  )
                : undefined;
              const findingContextChanged = Boolean(
                selectedFinding &&
                (selectedFinding.inputPackVersion !== packVersion ||
                  sourceVersion?.question.trim() !== focus.trim() ||
                  sourceVersion.investigationType !== mode),
              );
              const latestContextVersion = run?.versions.find(
                (item) =>
                  item.inputPackVersion === packVersion &&
                  item.question.trim() === focus.trim() &&
                  item.investigationType === mode,
              );
              const currentFinding = selectedFinding
                ? latestContextVersion?.findings.find(
                    (finding) => finding.id === selectedFinding.id,
                  )
                : undefined;
              const canDiscuss = canRun && !working && !findingContextChanged;
              const runConversation = (
                action: DiscoveryAction,
                guidance: string,
              ) =>
                onRunLens({
                  lensId: lens.id,
                  operation: "conversation",
                  generationContextId:
                    selectedFinding?.researchRunId ?? version?.id,
                  action,
                  guidance,
                  ...(selectedFinding ? { selectedFinding } : {}),
                });
              const renderMessage = (entry: DiscoveryThreadMessage) => {
                const reply = run?.versions.find(
                  (item) => item.id === entry.researchRunId,
                );
                return (
                  <div
                    className={`v2-message ${entry.author === "Agent" ? "agent" : "human"}`}
                    key={entry.id}
                  >
                    <b>{entry.author === "Agent" ? name : "You"}</b>
                    {entry.author === "Agent" && reply && (
                      <small className="v2-message-meta">
                        V{reply.number - 1} · {messageStatusLabel(entry)}
                      </small>
                    )}
                    {entry.author === "Kevin" && entry.status && (
                      <small className="v2-message-meta">
                        {messageStatusLabel(entry)}
                      </small>
                    )}
                    {entry.author !== "Agent" ? (
                      <p>{entry.text}</p>
                    ) : (
                      <>
                        <p className="v2-agent-reply">{entry.text}</p>
                        <small className="v2-message-meta">
                          {retrievalLabel(entry)}
                        </small>
                      </>
                    )}
                    {entry.error && (
                      <small className="v2-message-error">{entry.error}</small>
                    )}
                  </div>
                );
              };
              const anotherAnswer = () =>
                onRunLens({
                  lensId: lens.id,
                  operation: "generation",
                  action: "another_answer",
                  guidance: [
                    "Give one different answer from this agent's perspective, grounded in the current brief and investigation focus. Explore a distinct angle rather than repeating the previous findings. Do not invent new evidence or imply new research was retrieved; return an honest research gap if no different supported finding is available.",
                    steering.trim()
                      ? `Current steering: ${steering.trim()}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                });
              return (
                <article
                  className={`v2-agent ${lens.color}`}
                  key={lens.id}
                  aria-label={name}
                  aria-busy={working}
                >
                  <header>
                    <div className="v2-agent-top">
                      <span className="icon-tile">{lens.icon}</span>
                      <div className="v2-agent-identity">
                        <h3 id={`v2-agent-title-${lens.id}`} tabIndex={-1}>
                          {name}
                        </h3>
                        <span
                          className="v2-agent-status"
                          data-tone={status.tone}
                          role="status"
                        >
                          {version
                            ? `V${version.number - 1} · ${!working && !stale && props.restoredVersionIds?.includes(version.id) && run?.status === "complete" ? "Saved results" : status.label}`
                            : status.label}
                        </span>
                      </div>
                      <div className="v2-agent-model-actions">
                        <button
                          type="button"
                          className="button small v2-regenerate"
                          aria-label={`Regenerate ${name}`}
                          disabled={!canRun || working}
                          onClick={() =>
                            void onRunLens({
                              lensId: lens.id,
                              operation: "generation",
                              action: activeVersion ? "refresh" : "initial",
                              guidance: steering.trim(),
                            })
                          }
                        >
                          <RefreshCw size={12} aria-hidden /> Regenerate
                        </button>
                        <DemoModelSelector
                          value={demoModelsByLens[lens.id]}
                          onChange={(model) =>
                            setDemoModelsByLens((current) => ({
                              ...current,
                              [lens.id]: model,
                            }))
                          }
                          context={name}
                        />
                      </div>
                      {!expanded && (
                        <button
                          className="v2-expand"
                          id={`v2-expand-${lens.id}`}
                          aria-label={`Expand ${name}`}
                          title="Expand to see evidence and history"
                          onClick={() => focusLens(lens.id)}
                        >
                          <Expand size={14} />
                        </button>
                      )}
                    </div>
                    <section
                      className="v2-rubric"
                      aria-labelledby={`v2-rubric-${lens.id}`}
                    >
                      <h4 id={`v2-rubric-${lens.id}`}>How this agent thinks</h4>
                      <p>{summaries[lens.id].thinking}</p>
                      <p className="v2-rubric-focus">
                        <b>Focus:</b> {summaries[lens.id].focus}
                      </p>
                    </section>
                  </header>
                  <section
                    className="v2-agent-result"
                    aria-label={`${name} perspective`}
                  >
                    {version && (
                      <details className="v2-used-focus">
                        <summary>
                          Investigated focus
                          {version.provider === "mock" && (
                            <small>DEMO DATA</small>
                          )}
                        </summary>
                        <p>{version.question}</p>
                      </details>
                    )}
                    {stale && (
                      <p className="v2-stale">
                        This update used an earlier input pack or focus. Run all
                        agents again to use the context above.
                      </p>
                    )}
                    {run?.error && requestInScope && (
                      <div className="error" role="alert">
                        {run.error}
                      </div>
                    )}
                    {/* A first-run failure shows only its error and Retry. */}
                    {!version && !(run?.error && !run.versions.length) && (
                      <p>
                        {working
                          ? "This agent is examining the supplied context. Other agents can finish independently."
                          : run?.versions.length
                            ? "An earlier-context answer is preserved in research history. Start a discussion to use the current context."
                            : "Start an investigation to explore this perspective."}
                      </p>
                    )}
                    {viewed && (
                      <p className="v2-history-view" role="status">
                        Viewing Generation V{viewed.number - 1} ·{" "}
                        {current
                          ? `Current V${current.number - 1}`
                          : "No active generation"}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setViewedGenerations((values) => {
                              const next = { ...values };
                              delete next[viewKey];
                              return next;
                            })
                          }
                        >
                          Return to current generation
                        </button>
                      </p>
                    )}
                    {version && !findings.length && (
                      <p>
                        No findings in this generation. Earlier versions remain
                        in Generations.
                      </p>
                    )}
                    {shownFinding && (
                      <>
                        <p
                          className="v2-finding-position"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          Finding {findingIndex + 1} of {findings.length}
                          {version && ` · V${version.number - 1}`}
                        </p>
                        {findingCard(shownFinding)}
                        <div
                          className="v2-finding-nav"
                          role="group"
                          aria-label={`${name} finding navigation`}
                        >
                          <button
                            type="button"
                            className="button small"
                            aria-label="Previous finding"
                            aria-disabled={findingIndex === 0}
                            onClick={() => pageFinding(-1)}
                          >
                            <ChevronLeft size={13} aria-hidden />
                            Previous
                          </button>
                          <button
                            type="button"
                            className="button small"
                            aria-disabled={findingIndex >= findings.length - 1}
                            onClick={() => pageFinding(1)}
                          >
                            Next finding
                            <ChevronRight size={13} aria-hidden />
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                  <details className="v2-steering">
                    <summary>Steer regeneration</summary>
                    <label className="field">
                      <span>Direction for regenerating {name}</span>
                      <textarea
                        rows={2}
                        value={steering}
                        maxLength={8000}
                        placeholder="A new angle to investigate…"
                        onChange={(event) =>
                          onChange({
                            ...state,
                            drafts: {
                              ...drafts,
                              generations: {
                                ...drafts.generations,
                                [lens.id]: event.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                    <small>
                      Use Regenerate above to create a structured generation.
                      This is separate from conversation.
                    </small>
                  </details>
                  <form
                    className="v2-agent-volley"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (canDiscuss && message.trim()) {
                        void runConversation("explore_deeper", message.trim());
                        requestAnimationFrame(() => {
                          const history = document.getElementById(
                            `v2-conversations-${lens.id}`,
                          ) as HTMLDetailsElement | null;
                          if (history) {
                            history.open = true;
                            const turn = history.querySelector("details");
                            if (turn) turn.open = true;
                          }
                        });
                      }
                    }}
                  >
                    <h4>
                      <MessageSquare size={14} />
                      Talk to {name}
                    </h4>
                    {selectedFinding && (
                      <div className="v2-conversation-scope" role="status">
                        <strong>
                          Finding conversation · V
                          {selectedFinding.runVersion - 1}
                        </strong>
                        <p>{selectedFinding.title}</p>
                        <small>
                          This discussion stays attached to the exact finding
                          version you selected.
                        </small>
                        {selectedFinding.researchRunId !==
                          run?.currentVersionId && (
                          <small>
                            Earlier finding version · history preserved
                          </small>
                        )}
                        {findingContextChanged && (
                          <small className="v2-stale">
                            Earlier Input Pack or investigation. Review this
                            history, then choose a current finding to continue.
                          </small>
                        )}
                        <div className="v2-conversation-scope-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              onChange({
                                ...state,
                                activeFindingRefs: {
                                  ...state.activeFindingRefs,
                                  [lens.id]: undefined,
                                },
                              })
                            }
                          >
                            Back to agent conversation
                          </button>
                          {currentFinding &&
                            discoveryFindingRef(currentFinding) !==
                              discoveryFindingRef(selectedFinding) &&
                            currentFinding.inputPackVersion === packVersion &&
                            latestContextVersion && (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => discussFinding(currentFinding)}
                              >
                                Discuss current version · V
                                {currentFinding.runVersion - 1}
                              </button>
                            )}
                        </div>
                      </div>
                    )}
                    <label className="field">
                      <span>
                        {selectedFinding
                          ? `Your message about ${selectedFinding.title}`
                          : `Your message to ${name}`}
                      </span>
                      <textarea
                        ref={(element) => {
                          composerRefs.current[lens.id] = element;
                        }}
                        rows={3}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Challenge it, ask it to go deeper, or narrow the audience…"
                        disabled={findingContextChanged}
                      />
                    </label>
                    <div className="v2-volley-actions">
                      <button
                        className="button small"
                        disabled={!canDiscuss || !message.trim()}
                      >
                        {working && conversationOperation
                          ? "Answering…"
                          : "Ask this agent"}
                      </button>
                    </div>
                    <details className="v2-research-actions">
                      <summary>More research actions</summary>
                      <p>
                        Use supplied evidence to challenge, narrow or check this
                        {selectedFinding ? " finding" : " lens"}. Disconnected
                        sources are not searched.
                      </p>
                      <div className="v2-quick-actions">
                        {researchActions.map((item) => (
                          <button
                            key={item.action}
                            type="button"
                            className="button small"
                            disabled={!canDiscuss}
                            onClick={() =>
                              void runConversation(
                                item.action,
                                message.trim() || item.guidance,
                              )
                            }
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </details>
                  </form>
                  <div className="v2-history-controls">
                    <details className="v2-generation-history">
                      <summary>Generations · {generations.length}</summary>
                      {!generations.length ? (
                        <p>No completed generations yet.</p>
                      ) : (
                        <>
                          <label className="field">
                            <span>View generation for {name}</span>
                            <select
                              value={viewed?.id ?? ""}
                              onChange={(event) =>
                                setViewedGenerations((values) => ({
                                  ...values,
                                  [viewKey]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Current generation</option>
                              {generations.map((item) => (
                                <option key={item.id} value={item.id}>
                                  Generation V{item.number - 1}
                                  {item.id === generations[0]?.id
                                    ? " — Latest"
                                    : ""}
                                  {item.id === run?.currentVersionId
                                    ? " — Current"
                                    : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          {version && (
                            <div className="v2-generation-context">
                              <p>
                                <b>Generation V{version.number - 1}</b> ·{" "}
                                {new Date(version.createdAt).toLocaleString()}
                              </p>
                              <p>{version.question}</p>
                              {version.guidance && (
                                <p>Steering: {version.guidance}</p>
                              )}
                              <small>
                                Viewing history does not change the current
                                generation or your saved findings.
                              </small>
                              {viewed &&
                                viewed.id !== run?.currentVersionId && (
                                  <button
                                    type="button"
                                    className="button small"
                                    disabled={
                                      working ||
                                      !matchesInvestigation(
                                        viewed,
                                        pack,
                                        focus,
                                        mode,
                                      )
                                    }
                                    onClick={() =>
                                      onChange({
                                        ...state,
                                        runs: state.runs.map((item) =>
                                          item.lensId === lens.id
                                            ? {
                                                ...item,
                                                currentVersionId: viewed.id,
                                              }
                                            : item,
                                        ),
                                      })
                                    }
                                  >
                                    Make viewed generation current
                                  </button>
                                )}
                            </div>
                          )}
                        </>
                      )}
                    </details>
                    <details
                      className="v2-conversation v2-conversation-history"
                      id={`v2-conversations-${lens.id}`}
                    >
                      <summary>Conversations · {conversations.length}</summary>
                      {!conversations.length && (
                        <p>
                          No conversations yet. Ask this agent about a finding
                          or assumption.
                        </p>
                      )}
                      {conversations.map((turn) => {
                        const regeneration = turn.question
                          ? conversationRegenerationRequest(
                              state,
                              pack,
                              lens.id,
                              turn.question.turnId ?? turn.question.id,
                            )
                          : undefined;
                        const contextId =
                          turn.question?.researchRunId ??
                          turn.answer?.researchRunId;
                        const context = generations.find(
                          (item) => item.id === contextId,
                        );
                        return (
                          <details
                            className="v2-conversation-turn"
                            key={turn.id}
                          >
                            <summary>
                              Conversation {turn.number} ·{" "}
                              {turn.question?.text || "Earlier agent reply"}
                            </summary>
                            <small>
                              {context
                                ? `Generation V${context.number - 1}`
                                : "Earlier conversation context"}{" "}
                              ·{" "}
                              {turn.question?.question ?? turn.answer?.question}
                            </small>
                            {turn.question?.findingRef && (
                              <small>
                                Finding:{" "}
                                {generations
                                  .flatMap((item) => item.findings)
                                  .find(
                                    (item) =>
                                      discoveryFindingRef(item) ===
                                      turn.question?.findingRef,
                                  )?.title ?? turn.question.findingRef}
                              </small>
                            )}
                            {turn.question && renderMessage(turn.question)}
                            {turn.answer && renderMessage(turn.answer)}
                            {turn.question?.regeneratesTurnId && (
                              <small>
                                Regenerated response · earlier replies preserved
                                in Conversations.
                              </small>
                            )}
                            {turn.answer && (
                              <button
                                type="button"
                                className="button small"
                                disabled={!canRun || working || !regeneration}
                                title={
                                  regeneration
                                    ? "Generate another reply to this same question; keep the earlier reply."
                                    : "Return to this conversation's original Input Pack and investigation to regenerate."
                                }
                                onClick={() => {
                                  if (regeneration)
                                    void onRunLens(regeneration);
                                }}
                              >
                                <RefreshCw size={13} /> Regenerate response
                              </button>
                            )}
                          </details>
                        );
                      })}
                    </details>
                  </div>
                  {!!version && (
                    <div className="v2-agent-more">
                      {!expanded && (
                        <button
                          type="button"
                          className="text-button v2-full-perspective"
                          onClick={() => focusLens(lens.id)}
                        >
                          Show agent&apos;s full perspective
                        </button>
                      )}
                      {expanded && !selectedFinding && (
                        <button
                          className="button small"
                          disabled={!canRun || working}
                          onClick={() => void anotherAnswer()}
                        >
                          {working
                            ? "Generating another answer…"
                            : "Get another answer"}
                        </button>
                      )}
                    </div>
                  )}
                  {(working || (run?.error && requestInScope)) && (
                    <footer>
                      {working ? (
                        <button
                          className="button small"
                          onClick={() => onCancelLens(lens.id)}
                        >
                          Stop this agent
                        </button>
                      ) : run?.error ? (
                        <button
                          className="button small"
                          disabled={!canRun}
                          onClick={() => onRetryLens(lens.id)}
                        >
                          {run.retryRequest?.operation === "conversation"
                            ? "Retry conversation"
                            : run.retryRequest?.selectedFinding
                              ? "Retry finding discussion"
                              : `Retry ${name}`}
                        </button>
                      ) : null}
                    </footer>
                  )}
                </article>
              );
            })}
        </div>
        <form
          className="v2-talk-all panel"
          onSubmit={(event) => {
            event.preventDefault();
            if (allAgentGuidance.trim())
              onQuestionChange(allAgentGuidance.trim(), mode);
            runAll();
          }}
        >
          <label htmlFor="v2-all-agent-guidance">Talk to all agents</label>
          <input
            id="v2-all-agent-guidance"
            value={allAgentGuidance}
            onChange={(event) => setAllAgentGuidance(event.target.value)}
            placeholder="Same new context for all five, e.g. focus on families who host over the holidays"
          />
          <button
            className="button"
            disabled={!canRun || busy.some((id) => id !== "connections")}
          >
            Send to all &amp; regenerate
          </button>
        </form>
        <details className="v2-comparison-panel panel" ref={comparisonPanel}>
          <summary>
            Compare findings in Discovery · {state.selectedFindingIds.length}{" "}
            selected
          </summary>
          <WorkingSpace
            comparisonOnly
            state={state}
            pack={pack}
            briefLine={props.briefLine}
            busy={busy}
            onChange={onChange}
            onConnect={props.onConnect}
            onBriefLineChange={props.onBriefLineChange}
            onApprove={props.onApprove}
            onInspectFinding={inspect}
          />
        </details>
      </div>
    </div>
  );
}
