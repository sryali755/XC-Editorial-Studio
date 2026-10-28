"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SetStateAction,
} from "react";
import { ArrowRight, Database, FileText, Search } from "lucide-react";
import WorkspaceResetControl from "./WorkspaceResetControl";
import type { AIStatus } from "@/lib/ai/schemas";
import type { DiscoveryState } from "@/lib/types";
import {
  connectDiscoveryFindings,
  inputPackVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import { resolveConnectionSelection } from "@/lib/discovery-connections";
import {
  compactStoredWorkspace,
  compactStringify,
  discoveryStorageKey,
  campaignStorageKey,
  readDiscoveryDraft,
} from "@/lib/discovery-persistence";
import {
  openWorkspaceStore,
  type WorkspaceStore,
} from "@/lib/browser-workspace-store";
import {
  clearWorkspaceStorage,
  developmentServerEpochKey,
} from "@/lib/development-clean-start";
import { approveDiscoveryCanvas } from "@/lib/discovery-handoff";
import { reviewWorkspaceCampaignName } from "@/lib/campaign-identity";
import { campaignDisplayLabel } from "@/lib/campaign-naming";
import {
  emptyStudio,
  packageDiscoveryBrief,
  prefillWorkspaceSuggestions,
  readStudio,
  seedStudioDiscovery,
  studioPack,
  studioPackLabel,
  studioResearchChoices,
  studioStorageKey,
  studioStrategySession,
  type DiscoveryStudioSession,
  type StudioScreen,
} from "@/lib/discovery-studio";
import DiscoveryInputPack from "./DiscoveryInputPack";
import DynamicInputPackDetails from "./DynamicInputPackDetails";
import InsightDiscoveryFeature from "./InsightDiscoveryFeature";
import { GeneratedBriefPreview } from "./StrategyPanels";
import WorkingSpace from "./WorkingSpace";
import StrategySuggestions from "./StrategySuggestions";
import { buildStudioBriefInput } from "@/lib/studio-brief-input";
import {
  consolidateWorkspaceFields,
  prepareWorkspaceDraft,
  preserveRestoredWorkspace,
  reviewWorkspaceSupport,
} from "@/lib/workspace-suggestions";

const screens: { id: StudioScreen; label: string; icon: typeof Search }[] = [
  { id: "inputs", label: "Input Pack", icon: Database },
  { id: "discovery", label: "Insight Discovery", icon: Search },
  { id: "strategy", label: "Finalize Strategy", icon: FileText },
  { id: "brief", label: "XC Brief", icon: FileText },
];

function contextIds(
  session: DiscoveryStudioSession,
  discovery: DiscoveryState,
) {
  const pack = studioPack(session);
  return [
    ...studioResearchChoices(session)
      .filter((item) => session.selectedResearchIds?.includes(item.id))
      .map((item) => `research:${item.id}`),
    ...(pack.selectedSparks ?? []).map((spark) => `spark:${spark.id}`),
    ...discovery.savedFindingIds.map((id) => `finding:${id}`),
    ...(pack.proposedRTB ? ["rtb:proposal"] : []),
  ];
}
function strategyFingerprint(
  session: DiscoveryStudioSession,
  discovery: DiscoveryState,
) {
  return JSON.stringify({
    inputPackVersion: inputPackVersion(studioPack(session)),
    campaignIdentity: studioPack(session).campaignIdentity,
    included: session.includedContextIds ?? contextIds(session, discovery),
    briefLine: discovery.humanBriefLine?.trim() ?? "",
    fields: [
      discovery.problemStatement,
      discovery.humanTension,
      discovery.workingAudience,
      discovery.workingJTBD,
      discovery.workingRTB,
      discovery.evidenceInsights,
      discovery.hypothesis,
      discovery.strategicDirection,
      discovery.openQuestions,
      discovery.executionConsiderations,
      discovery.wholeBrief,
    ],
  });
}
function withToggledContext(
  session: DiscoveryStudioSession,
  discovery: DiscoveryState,
  id: string,
) {
  const active = new Set(
    session.includedContextIds ?? contextIds(session, discovery),
  );
  if (active.has(id)) active.delete(id);
  else active.add(id);
  return { ...session, includedContextIds: [...active] };
}
function ContextCheckbox({
  checked,
  label,
  id,
}: {
  checked: boolean;
  label: string;
  id: string;
}) {
  return (
    <label className="studio-choice">
      <input type="checkbox" value={id} checked={checked} readOnly />
      <span>{label}</span>
    </label>
  );
}

export default function InsightDiscoveryStudio({
  aiStatus,
  serverEpoch,
}: {
  aiStatus: AIStatus;
  serverEpoch?: string;
}) {
  const [session, setSession] = useState(emptyStudio);
  const sessionRef = useRef(session);
  const [discovery, setDiscovery] = useState(() =>
    seedStudioDiscovery(studioPack(session)),
  );
  const discoveryRef = useRef(discovery);
  const workspaceStore = useRef<WorkspaceStore | null>(null);
  const resetInProgress = useRef(false);
  const saveSequence = useRef(0);
  const pendingSaves = useRef(new Map<string, number>());
  const saveFailures = useRef(new Map<string, string>());
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [comparing, setComparing] = useState(false);
  const comparisonPending = useRef(false);
  const [error, setError] = useState("");
  const [selectedBrief, setSelectedBrief] = useState("");
  const [restoredResults, setRestoredResults] = useState<{
    campaignKey: string;
    preparationIds: string[];
    discoveryIds: string[];
  } | null>(null);
  const pack = studioPack(session);
  const packLabel = studioPackLabel(session);
  const sourceIdentity = discoveryStorageKey(pack);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void (async () => {
        let store = await openWorkspaceStore(sessionStorage);
        if (serverEpoch) {
          const tabEpoch = sessionStorage.getItem(developmentServerEpochKey);
          const originEpoch = localStorage.getItem(developmentServerEpochKey);
          if (tabEpoch !== serverEpoch && originEpoch !== serverEpoch) {
            // Clear XC work before hydration. reset() also removes IndexedDB
            // drafts and waits for any queued writes so history cannot return.
            await store.reset(localStorage);
            store = await openWorkspaceStore(sessionStorage);
          } else if (tabEpoch !== serverEpoch) {
            // Another tab already cleared the shared store after this restart.
            clearWorkspaceStorage(sessionStorage);
          }
          sessionStorage.setItem(developmentServerEpochKey, serverEpoch);
          localStorage.setItem(developmentServerEpochKey, serverEpoch);
        }
        workspaceStore.current = store;
        compactStoredWorkspace(
          sessionStorage,
          studioStorageKey,
          store.indexedKeys,
        );
        const restored = readStudio(store);
        if (restored.session.preparation.sourceSnapshot.trim())
          setRestoredResults({
            campaignKey: discoveryStorageKey(studioPack(restored.session)),
            preparationIds: restored.session.preparation.outputs.flatMap(
              (output) => output.versions.map((version) => version.id),
            ),
            discoveryIds: restored.discovery.runs.flatMap((run) =>
              run.versions.map((version) => version.id),
            ),
          });
        sessionRef.current = restored.session;
        discoveryRef.current = restored.discovery;
        setSession(restored.session);
        setDiscovery(restored.discovery);
        setReady(true);
      })().catch(() =>
        setStorageError(
          "The workspace could not be cleared after the server restart. Browser storage is unavailable; old history was not loaded.",
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [serverEpoch]);

  function persist(key: string, value: unknown, failureMessage: string) {
    if (resetInProgress.current) return;
    const sequence = ++saveSequence.current;
    const store = workspaceStore.current;
    if (!store) return;
    pendingSaves.current.set(key, sequence);
    setSaving(true);
    const finish = (failure?: string) => {
      if (pendingSaves.current.get(key) !== sequence) return;
      pendingSaves.current.delete(key);
      if (failure) saveFailures.current.set(key, failure);
      else saveFailures.current.delete(key);
      setStorageError(saveFailures.current.values().next().value ?? "");
      setSaving(pendingSaves.current.size > 0);
    };
    void store.save(key, compactStringify(value)).then(
      () => finish(),
      () => finish(failureMessage),
    );
  }

  function changeSession(change: SetStateAction<DiscoveryStudioSession>) {
    if (resetInProgress.current) return;
    const current = sessionRef.current;
    let next = typeof change === "function" ? change(current) : change;
    const before = studioPack(current),
      after = studioPack(next);
    if (
      before.campaignName !== after.campaignName &&
      discoveryStorageKey(before) === discoveryStorageKey(after)
    ) {
      const reviewed = reviewWorkspaceCampaignName(discoveryRef.current, after);
      if (reviewed !== discoveryRef.current) saveDiscovery(reviewed);
    }
    if (
      before.parsedIMC?.sourceText &&
      inputPackVersion(before) !== inputPackVersion(after) &&
      next.packHistory[0]?.version !== inputPackVersion(before)
    )
      next = {
        ...next,
        packHistory: [
          {
            version: inputPackVersion(before),
            pack: structuredClone(before),
            createdAt: new Date().toISOString(),
          },
          ...next.packHistory,
        ],
      };
    if (discoveryStorageKey(before) !== discoveryStorageKey(after)) {
      persist(
        discoveryStorageKey(before),
        discoveryRef.current,
        "The prior investigation could not be saved. Keep this tab open.",
      );
      const savedDraft = readDiscoveryDraft(
        workspaceStore.current ?? sessionStorage,
        after,
      );
      const restored = consolidateWorkspaceFields(
        savedDraft
          ? next.approved
            ? savedDraft
            : preserveRestoredWorkspace(savedDraft)
          : seedStudioDiscovery(after),
      );
      const prepared = next.approved
        ? restored
        : prefillWorkspaceSuggestions(restored, after);
      discoveryRef.current = prepared;
      setDiscovery(prepared);
    }
    sessionRef.current = next;
    setSession(next);
    persist(
      studioStorageKey,
      next,
      "This browser could not save the workspace. Keep the tab open and export your approved brief before leaving.",
    );
  }
  async function commitCampaignBuild(
    next: DiscoveryStudioSession,
    expected: DiscoveryStudioSession,
  ) {
    const store = workspaceStore.current;
    if (
      !store ||
      resetInProgress.current ||
      sessionRef.current !== expected ||
      discoveryRef.current !== discovery
    )
      throw Error(
        "The workspace changed during building. Replacement was discarded; previous workspace unchanged.",
      );
    if (pendingSaves.current.size || saveFailures.current.size)
      throw Error(
        "Finish saving the current workspace before rebuilding. Previous workspace unchanged.",
      );
    const nextPack = studioPack(next);
    const freshDiscovery = seedStudioDiscovery(nextPack);
    const previousPack = studioPack(expected);
    const baseKey = campaignStorageKey(nextPack);
    const replacements: Record<string, string> = {
      [studioStorageKey]: compactStringify(next),
      [discoveryStorageKey(nextPack)]: compactStringify(freshDiscovery),
    };
    if (
      previousPack.parsedIMC?.sourceText &&
      campaignStorageKey(previousPack) !== baseKey
    )
      replacements[discoveryStorageKey(previousPack)] = compactStringify(
        discoveryRef.current,
      );
    resetInProgress.current = true;
    setSaving(true);
    try {
      await store.replaceCampaign(baseKey, replacements);
      // Bypass changeSession: a fresh build must not archive/reseed the old
      // investigation or prepend the previous active pack to version history.
      sessionRef.current = next;
      discoveryRef.current = freshDiscovery;
      setSession(next);
      setDiscovery(freshDiscovery);
      setSelectedBrief("");
      setRestoredResults(null);
      setError("");
      setStorageError("");
    } catch {
      throw Error(
        "The replacement could not be saved atomically. Previous workspace unchanged. Check browser storage access and try again.",
      );
    } finally {
      resetInProgress.current = false;
      setSaving(false);
    }
  }
  function navigate(screen: StudioScreen) {
    if (screen === "strategy") prepareWorkingSpace();
    changeSession((current) => ({ ...current, screen }));
    setError("");
  }
  function prepareWorkingSpace() {
    const current = discoveryRef.current;
    // Restored/opened drafts are not new initialization opportunities. Missing
    // suggestions are now filled only through the explicit preview action.
    if (
      !current.workspaceSuggestionContext ||
      current.workspaceSuggestionContext.opened
    )
      return;
    const selectedPack = studioPack(sessionRef.current);
    const next = prepareWorkspaceDraft(
      current,
      selectedPack,
      seedStudioDiscovery(selectedPack, current),
    );
    if (next !== current) saveDiscovery(next);
  }
  function saveDiscovery(next: DiscoveryState) {
    if (resetInProgress.current) return;
    discoveryRef.current = next;
    setDiscovery(next);
    persist(
      discoveryStorageKey(studioPack(sessionRef.current)),
      next,
      "Your investigation could not be saved in this browser. Keep this tab open.",
    );
  }
  function approve(briefLine: string) {
    try {
      const current = sessionRef.current;
      const state = discoveryRef.current;
      const included = new Set(
        current.includedContextIds ?? contextIds(current, state),
      );
      const fullPack = studioPack(current);
      const selectedSparks =
        fullPack.selectedSparks?.filter((spark) =>
          included.has(`spark:${spark.id}`),
        ) ?? [];
      const approvedPack = {
        ...fullPack,
        proposedRTB: included.has("rtb:proposal") ? fullPack.proposedRTB : "",
        selectedSparks,
        sparks: selectedSparks.map((spark) => spark.text).join("\n"),
        selectedResearch:
          fullPack.selectedResearch?.filter((item) =>
            included.has(`research:${item.id}`),
          ) ?? [],
        research: studioResearchChoices(current)
          .filter(
            (item) =>
              current.selectedResearchIds?.includes(item.id) &&
              included.has(`research:${item.id}`),
          )
          .map(
            (item) =>
              `${item.category} · V${item.version - 1} · ${item.source}\n${item.text}`,
          )
          .join("\n\n"),
      };
      const approvedState = {
        ...state,
        savedFindingIds: state.savedFindingIds.filter((id) =>
          included.has(`finding:${id}`),
        ),
      };
      const approved = approveDiscoveryCanvas(
        studioStrategySession(current, approvedState),
        approvedPack,
        approvedState,
        briefLine,
      ).approved!;
      changeSession({
        ...current,
        approved,
        confirmationFingerprint: strategyFingerprint(current, state),
        approvals: [approved, ...current.approvals],
        approvalSnapshots: {
          ...current.approvalSnapshots,
          [approved.approvedAt]: structuredClone(approvedState),
        },
        screen: "strategy",
      });
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The human strategy could not be approved. Your canvas is preserved.",
      );
    }
  }
  function packageBrief() {
    try {
      const current = sessionRef.current;
      if (!current.approved)
        throw new Error(
          "Confirm your human-authored strategy before generating the XC Brief.",
        );
      if (
        current.confirmationFingerprint !==
        strategyFingerprint(current, discoveryRef.current)
      )
        throw new Error(
          "The strategy changed after confirmation. Review and confirm the current draft again.",
        );
      const snapshot = current.approvalSnapshots[current.approved.approvedAt];
      if (!snapshot)
        throw new Error(
          "The approved evidence snapshot is unavailable. Review and approve the whole brief again.",
        );
      const input = buildStudioBriefInput(current.approved, snapshot);
      const brief = packageDiscoveryBrief(current.approved, snapshot);
      changeSession({
        ...current,
        briefs: [brief, ...current.briefs],
        briefInputs: { ...current.briefInputs, [brief.id]: input },
        screen: "brief",
      });
      setSelectedBrief(brief.id);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The brief could not be packaged. Your approved thinking is preserved.",
      );
    }
  }
  async function compareSelected(guidance: string) {
    if (comparisonPending.current) return false;
    const snapshot = discoveryRef.current;
    const comparisonPack = structuredClone(studioPack(sessionRef.current));
    const selection = resolveConnectionSelection(
      snapshot,
      comparisonPack,
      snapshot.drafts?.connectionConsentKey,
    );
    if (selection.issue) {
      setError(selection.issue);
      return false;
    }
    const sourceKey = discoveryStorageKey(comparisonPack);
    const packVersion = inputPackVersion(comparisonPack);
    const question = snapshot.question;
    const investigationType = snapshot.investigationType;
    comparisonPending.current = true;
    setComparing(true);
    try {
      const note = await connectDiscoveryFindings({
        pack: comparisonPack,
        findings: selection.findings,
        sourcePacks: selection.sourcePacks,
        guidance,
        sourceContextConsent: selection.earlierContext,
      });
      const latestPack = studioPack(sessionRef.current);
      const latest = discoveryRef.current;
      const latestSelection = resolveConnectionSelection(
        latest,
        latestPack,
        latest.drafts?.connectionConsentKey,
      );
      if (
        discoveryStorageKey(latestPack) !== sourceKey ||
        inputPackVersion(latestPack) !== packVersion ||
        latest.question !== question ||
        latest.investigationType !== investigationType ||
        latestSelection.issue ||
        latestSelection.selectionKey !== selection.selectionKey
      ) {
        setError(
          "The comparison completed for an earlier campaign or selection. It was not added to the current strategy draft.",
        );
        return false;
      }
      saveDiscovery({
        ...latest,
        connectionNotes: [note, ...latest.connectionNotes],
      });
      setError("");
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The findings could not be compared.",
      );
      return false;
    } finally {
      comparisonPending.current = false;
      setComparing(false);
    }
  }
  function inspectFinding(
    finding: ReturnType<typeof knownDiscoveryFindings> extends Map<
      string,
      infer T
    >
      ? T
      : never,
  ) {
    saveDiscovery({
      ...discoveryRef.current,
      focusedLensId: finding.lensId,
      runs: discoveryRef.current.runs.map((run) =>
        run.lensId === finding.lensId
          ? {
              ...run,
              currentVersionId: finding.researchRunId ?? run.currentVersionId,
            }
          : run,
      ),
    });
    navigate("discovery");
  }
  const currentBrief =
    session.briefs.find((brief) => brief.id === selectedBrief) ??
    session.briefs[0];
  const confirmationCurrent =
    !!session.approved &&
    !!session.approvalSnapshots[session.approved.approvedAt] &&
    session.confirmationFingerprint === strategyFingerprint(session, discovery);
  const included = new Set(
    session.includedContextIds ?? contextIds(session, discovery),
  );
  const researchChoices = studioResearchChoices(session).filter((item) =>
    session.selectedResearchIds?.includes(item.id),
  );
  const known = knownDiscoveryFindings(discovery);
  const contextOptions = [
    ...researchChoices.map((item) => ({
      id: `research:${item.id}`,
      label: `${item.category} · V${item.version - 1}`,
    })),
    ...(pack.selectedSparks ?? []).map((spark) => ({
      id: `spark:${spark.id}`,
      label: `Spark: ${spark.title || spark.text}`,
    })),
    ...discovery.savedFindingIds.map((id) => ({
      id: `finding:${id}`,
      label: `Agent finding: ${known.get(id)?.title || id}`,
    })),
    ...(pack.proposedRTB
      ? [{ id: "rtb:proposal", label: "Proposed JTBD / RTB framing" }]
      : []),
  ];
  function handleContextChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox")
      return;
    const state = discoveryRef.current;
    const next = withToggledContext(sessionRef.current, state, target.value);
    const full = studioPack(next);
    const included = new Set(
      next.includedContextIds ?? contextIds(next, state),
    );
    const scoped = {
      ...full,
      proposedRTB: included.has("rtb:proposal") ? full.proposedRTB : "",
      selectedSparks: full.selectedSparks?.filter((spark) =>
        included.has(`spark:${spark.id}`),
      ),
      selectedResearch: full.selectedResearch?.filter((item) =>
        included.has(`research:${item.id}`),
      ),
    };
    const reviewed = reviewWorkspaceSupport(state, seedStudioDiscovery(scoped));
    if (reviewed !== state) saveDiscovery(reviewed);
    changeSession(next);
  }
  return (
    <div className="insight-studio">
      <header className="studio-header">
        <a href="#main" className="studio-brand">
          <span>XC</span>
          <div>
            XC Round Table
            <small>{campaignDisplayLabel(pack)} · IMC brief</small>
          </div>
        </a>
        <nav className="studio-nav" aria-label="Workspace">
          {screens.map((screen, index) => (
            <button
              key={screen.id}
              type="button"
              className={session.screen === screen.id ? "active" : ""}
              aria-label={screen.label}
              aria-current={session.screen === screen.id ? "page" : undefined}
              onClick={() => navigate(screen.id)}
            >
              {index + 1} · {screen.label}
            </button>
          ))}
        </nav>
        <WorkspaceResetControl
          disabled={
            !ready ||
            building ||
            saving ||
            comparing ||
            session.preparation.outputs.some(
              (output) => output.status === "pending",
            ) ||
            discovery.runs.some((run) => run.status === "researching")
          }
          onConfirm={async () => {
            if (
              !workspaceStore.current ||
              building ||
              resetInProgress.current ||
              pendingSaves.current.size ||
              comparisonPending.current ||
              sessionRef.current.preparation.outputs.some(
                (output) => output.status === "pending",
              ) ||
              discoveryRef.current.runs.some(
                (run) => run.status === "researching",
              )
            )
              throw new Error(
                "Wait for current work to finish before resetting.",
              );
            resetInProgress.current = true;
            try {
              await workspaceStore.current.reset(localStorage);
              window.location.hash = "team-discussion-reset";
              window.location.reload();
            } catch (failure) {
              resetInProgress.current = false;
              throw failure;
            }
          }}
        />
      </header>
      <main
        id="main"
        className={`studio-main${session.screen === "inputs" ? " studio-main-inputs" : ""}`}
      >
        {(session.screen === "inputs" ||
          session.screen === "discovery" ||
          session.screen === "strategy") && (
          <div className="studio-page-heading">
            <div>
              <span className="eyebrow">XC STRATEGY STUDIO</span>
              <h1>
                {session.screen === "inputs"
                  ? "Build your Input Pack"
                  : session.screen === "discovery"
                    ? "Insight Discovery"
                    : "Finalize Strategy"}
              </h1>
              <p>
                {session.screen === "strategy"
                  ? "Shape your strategy from the campaign context and the ideas you chose to carry forward. Your brief line and final confirmation are yours."
                  : session.screen === "discovery"
                    ? "Ask five thinking partners to investigate the selected Input Pack. Save useful findings; you write and approve the strategy."
                    : "Feed in the upstream IMC brief. The three prep agents give you a V0 from it. Steer any of them, keep the versions you like, and carry the pack into Insight Discovery."}
              </p>
            </div>
          </div>
        )}
        <p className="studio-save-status" role="status">
          {storageError
            ? "Campaign work not saved"
            : saving
              ? "Saving campaign work…"
              : "Campaign work saved in this tab"}
        </p>
        {aiStatus.error && (
          <p className="error" role="alert">
            {aiStatus.error}
          </p>
        )}
        {restoredResults?.campaignKey === sourceIdentity && (
          <p className="context-note" role="status">
            Saved workspace restored. Existing results were loaded, not
            regenerated on refresh. Agents run only when you click their
            generation or conversation controls.
          </p>
        )}
        {storageError && (
          <p className="error" role="alert">
            {storageError}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!ready ? (
          <p role="status">Opening your workspace…</p>
        ) : (
          <>
            <div hidden={session.screen !== "inputs"}>
              <DiscoveryInputPack
                restoredVersionIds={
                  restoredResults?.campaignKey === sourceIdentity
                    ? restoredResults.preparationIds
                    : []
                }
                packLabel={packLabel}
                aiMode={aiStatus.mode}
                session={session}
                discovery={discovery}
                onChange={changeSession}
                onBuildCommit={commitCampaignBuild}
                onBuildActivity={setBuilding}
                onExplore={() => navigate("discovery")}
              />
            </div>
            <div hidden={session.screen !== "discovery"}>
              {!pack.parsedIMC?.sourceText && (
                <section className="panel studio-welcome">
                  <div>
                    <h2>Start with the campaign problem.</h2>
                    <p>
                      Add the IMC brief to share its context with every agent.
                      You can still explore the Round Table while preparing your
                      campaign context.
                    </p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => navigate("inputs")}
                  >
                    Add IMC brief <ArrowRight size={15} />
                  </button>
                </section>
              )}
              <InsightDiscoveryFeature
                restoredVersionIds={
                  restoredResults?.campaignKey === sourceIdentity
                    ? restoredResults.discoveryIds
                    : []
                }
                packLabel={packLabel}
                key={sourceIdentity}
                open
                pack={pack}
                state={discovery}
                briefLine={discovery.humanBriefLine ?? ""}
                presentation="page"
                autoStart={false}
                view="discovery"
                onViewChange={() => navigate("discovery")}
                onStateChange={(next) => {
                  // A response from the previous keyed campaign can finish
                  // before React unmount cleanup aborts it. Never store that
                  // state under the campaign now selected by the parent.
                  if (
                    discoveryStorageKey(studioPack(sessionRef.current)) ===
                    sourceIdentity
                  )
                    saveDiscovery(next);
                }}
                getCurrentState={() =>
                  discoveryStorageKey(studioPack(sessionRef.current)) ===
                  sourceIdentity
                    ? discoveryRef.current
                    : undefined
                }
                getCurrentPack={() => studioPack(sessionRef.current)}
                onApprove={approve}
                onClose={() => navigate("discovery")}
              />
              <div className="studio-stage-actions">
                <button className="button" onClick={() => navigate("inputs")}>
                  Back: Input Pack
                </button>
                <button
                  className="button primary"
                  onClick={() => navigate("strategy")}
                >
                  Next: Finalize Strategy <ArrowRight size={15} />
                </button>
              </div>
            </div>
            {session.screen === "strategy" && (
              <section className="studio-final">
                <details className="studio-dynamic-pack-reference">
                  <summary>
                    <span>
                      <strong>Dynamic Input Pack</strong>
                      <small>
                        Review the campaign context and insights you&apos;ve
                        selected throughout your strategy development.
                      </small>
                    </span>
                  </summary>
                  <DynamicInputPackDetails pack={pack} discovery={discovery} />
                </details>
                <WorkingSpace
                  key={sourceIdentity}
                  state={discovery}
                  pack={pack}
                  briefLine={discovery.humanBriefLine ?? ""}
                  busy={comparing ? ["connections"] : []}
                  onChange={saveDiscovery}
                  onConnect={compareSelected}
                  onBriefLineChange={(humanBriefLine) =>
                    saveDiscovery({
                      ...discoveryRef.current,
                      humanBriefLine,
                    })
                  }
                  onApprove={() =>
                    approve(discoveryRef.current.humanBriefLine ?? "")
                  }
                  onInspectFinding={inspectFinding}
                  onReturnToDiscovery={() => navigate("discovery")}
                />
                <StrategySuggestions
                  pack={pack}
                  discovery={discovery}
                  onRun={(run) => {
                    if (
                      discoveryStorageKey(studioPack(sessionRef.current)) !==
                      sourceIdentity
                    )
                      return;
                    saveDiscovery({
                      ...discoveryRef.current,
                      strategySuggestionRuns: [
                        run,
                        ...(discoveryRef.current.strategySuggestionRuns ?? []),
                      ],
                    });
                  }}
                  onChoose={(humanBriefLine) =>
                    saveDiscovery({ ...discoveryRef.current, humanBriefLine })
                  }
                />
                <section className="panel studio-final-context">
                  <div className="studio-final-context-heading">
                    <h2>Confirm Strategy</h2>
                    <p>
                      Review your current canvas, selected ideas, and human
                      brief line before you explicitly confirm this strategy.
                    </p>
                    <p className="context-note">
                      {confirmationCurrent
                        ? "Confirmed by you for this exact strategy and selected context."
                        : "Strategy draft · not yet confirmed. Saving edits does not approve them."}
                    </p>
                  </div>
                  <details className="studio-confirm-context">
                    <summary>Choose optional context for the XC Brief</summary>
                    <p>
                      The original IMC brief remains preserved. Saved findings
                      are included only when selected here; exploration and
                      comparison alone do not add them.
                    </p>
                    <div
                      className="studio-final-context-grid"
                      onChange={handleContextChange}
                    >
                      <div>
                        <h4>Your selected creative considerations</h4>
                        {contextOptions
                          .filter((item) => item.id.startsWith("finding:"))
                          .map((item) => (
                            <ContextCheckbox
                              key={item.id}
                              checked={included.has(item.id)}
                              label={item.label}
                              id={item.id}
                            />
                          ))}
                        {!contextOptions.some((item) =>
                          item.id.startsWith("finding:"),
                        ) && <p>No creative considerations selected.</p>}
                      </div>
                      <div>
                        <h4>From the Input Pack</h4>
                        {contextOptions
                          .filter((item) => !item.id.startsWith("finding:"))
                          .map((item) => (
                            <ContextCheckbox
                              key={item.id}
                              checked={included.has(item.id)}
                              label={item.label}
                              id={item.id}
                            />
                          ))}
                        {!contextOptions.some(
                          (item) => !item.id.startsWith("finding:"),
                        ) && <p>No optional context selected yet.</p>}
                      </div>
                      <label className="field studio-final-instructions">
                        <span>Additional brief instructions</span>
                        <small>
                          Optional deliverables, assets, or presentation needs.
                          Keep product claims grounded in the IMC brief.
                        </small>
                        <textarea
                          rows={7}
                          value={discovery.executionConsiderations ?? ""}
                          onChange={(event) =>
                            saveDiscovery({
                              ...discoveryRef.current,
                              executionConsiderations: event.target.value,
                            })
                          }
                          placeholder="Add deliverables, assets or mandatories to carry into the brief…"
                        />
                      </label>
                    </div>
                  </details>
                  <div className="studio-stage-actions">
                    <button
                      className="button"
                      disabled={
                        !pack.parsedIMC?.sourceText ||
                        !pack.campaignName ||
                        !discovery.humanBriefLine?.trim() ||
                        confirmationCurrent
                      }
                      onClick={() =>
                        approve(discoveryRef.current.humanBriefLine ?? "")
                      }
                    >
                      Confirm Strategy
                    </button>
                    <button
                      className="button primary"
                      disabled={!confirmationCurrent}
                      onClick={packageBrief}
                    >
                      Generate XC Brief <ArrowRight size={15} />
                    </button>
                  </div>
                  {!confirmationCurrent && (
                    <p className="context-note">
                      A human-authored brief line and explicit confirmation are
                      required. Changes after confirmation require
                      reconfirmation.
                    </p>
                  )}
                  {!!session.approvals.length && (
                    <details className="studio-approval-history">
                      <summary>
                        Approval history · {session.approvals.length}
                      </summary>
                      {session.approvals.map((approval) => (
                        <div key={approval.approvedAt}>
                          <blockquote>{approval.briefLine}</blockquote>
                          <small>
                            {approval.approvedAt} ·{" "}
                            {approval.discoveryCanvas?.inputPackVersion}
                          </small>
                          <button
                            className="text-button"
                            onClick={() =>
                              changeSession((current) => ({
                                ...current,
                                approved: approval,
                                confirmationFingerprint: undefined,
                              }))
                            }
                          >
                            Review this confirmed snapshot
                          </button>
                        </div>
                      ))}
                    </details>
                  )}
                </section>
                <div className="studio-stage-actions">
                  <button
                    className="button"
                    onClick={() => navigate("discovery")}
                  >
                    Back: Insight Discovery
                  </button>
                </div>
              </section>
            )}
            {session.screen === "brief" && (
              <section className="studio-final studio-brief-screen">
                <section className="panel">
                  {!currentBrief && (
                    <p>
                      No XC Brief version has been generated yet. Return to
                      Finalize Strategy to confirm your draft.
                    </p>
                  )}
                  {currentBrief && (
                    <p className="context-note">
                      {currentBrief.mock
                        ? "DEMO DATA"
                        : currentBrief.provider === "manual"
                          ? "Structured handoff from confirmed human strategy · no AI brief generation"
                          : "Provider-generated brief"}
                    </p>
                  )}
                  {currentBrief &&
                    currentBrief.campaign !== pack.campaignName && (
                      <p className="context-note" role="status">
                        This saved brief retains its original campaign name.
                        Confirm the current strategy and generate a new version
                        to use the corrected display name. Earlier approvals and
                        exports are preserved.
                      </p>
                    )}
                  {currentBrief && (
                    <GeneratedBriefPreview
                      brief={currentBrief}
                      packaged
                      onRegenerate={packageBrief}
                      onEdit={() => navigate("strategy")}
                      onBack={() => navigate("strategy")}
                      onBackToDiscovery={() => navigate("discovery")}
                      versionPicker={
                        <label className="studio-brief-version">
                          <span className="sr-only">
                            XC Brief version history
                          </span>
                          <select
                            aria-label="XC Brief version history"
                            value={currentBrief.id}
                            onChange={(event) =>
                              setSelectedBrief(event.target.value)
                            }
                          >
                            {session.briefs.map((brief, index) => (
                              <option value={brief.id} key={brief.id}>
                                Brief v{session.briefs.length - index}
                                {brief.id === currentBrief.id
                                  ? " · current"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      }
                      busy={false}
                    />
                  )}
                  <div className="studio-stage-actions">
                    <button
                      className="button"
                      onClick={() => navigate("strategy")}
                    >
                      Back: Finalize Strategy
                    </button>
                    <button
                      className="button"
                      onClick={() => navigate("discovery")}
                    >
                      Insight Discovery
                    </button>
                    <button
                      className="button"
                      onClick={() => navigate("inputs")}
                    >
                      Input Pack
                    </button>
                  </div>
                </section>
              </section>
            )}
          </>
        )}
        <footer className="studio-footer">
          <span>XC INSIGHT DISCOVERY</span>
          <span>
            Evidence, interpretation and human thinking stay distinct.
          </span>
        </footer>
      </main>
    </div>
  );
}
