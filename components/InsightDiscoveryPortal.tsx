"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emptyExecution, prefillExecution } from "@/lib/execution";
import {
  compileInputPack,
  preparationReady,
} from "@/lib/preparation";
import { inputPackVersion, emptyDiscoveryState } from "@/lib/discovery";
import type { DiscoveryState, StrategyInputPack, StrategySession } from "@/lib/types";
import { InsightDiscoveryEntry } from "./InsightDiscoveryFeature";
import InsightDiscoveryFeature from "./InsightDiscoveryFeature";

const strategySessionKey = "xc-strategy-session-v1";
const discoveryStateKey = "xc-insight-discovery-v1";

function readStrategySession(): StrategySession | undefined {
  try {
    const raw = sessionStorage.getItem(strategySessionKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as StrategySession;
    if (!value.preparation || typeof value.step !== "number") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function readSavedDiscovery(): DiscoveryState | undefined {
  try {
    const raw = sessionStorage.getItem(discoveryStateKey);
    return raw ? (JSON.parse(raw) as DiscoveryState) : undefined;
  } catch {
    return undefined;
  }
}

function freshDiscoveryState(pack: StrategyInputPack) {
  const state = emptyDiscoveryState();
  state.contextVersion = inputPackVersion(pack);
  state.question = pack.objective
    ? `What might explain the campaign problem behind this objective: ${pack.objective}`
    : "";
  state.problemStatement = pack.objective;
  return state;
}

export default function InsightDiscoveryPortal({
  aiMode,
}: {
  aiMode: "mock" | "live";
}) {
  const [snapshot, setSnapshot] = useState<StrategySession>();
  const [pack, setPack] = useState<StrategyInputPack>();
  const [discovery, setDiscovery] = useState<DiscoveryState>();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [handoffError, setHandoffError] = useState("");
  const latestDiscovery = useRef<DiscoveryState | undefined>(undefined);
  const lastSessionText = useRef("");

  const refresh = useCallback(() => {
    const anchor = document.querySelector<HTMLElement>(".dynamic-pack");
    setTarget((current) => (current === anchor ? current : anchor));
    if (open) return;
    const raw = sessionStorage.getItem(strategySessionKey) ?? "";
    if (raw === lastSessionText.current) return;
    lastSessionText.current = raw;
    setSnapshot(readStrategySession());
  }, [open]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    const timer = window.setInterval(refresh, 500);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const ready = Boolean(
    snapshot &&
      snapshot.step === 0 &&
      preparationReady(snapshot.preparation, aiMode),
  );

  function startDiscovery() {
    const current = readStrategySession();
    if (!current || current.step !== 0) return;
    const currentPack = compileInputPack(current.preparation);
    if (!preparationReady(current.preparation, aiMode)) return;
    const restored =
      readSavedDiscovery() ?? current.discovery ?? freshDiscoveryState(currentPack);
    latestDiscovery.current = restored;
    setSnapshot(current);
    setPack(currentPack);
    setDiscovery(restored);
    setHandoffError("");
    setOpen(true);
  }

  function saveDiscovery(next: DiscoveryState) {
    latestDiscovery.current = next;
    setDiscovery(next);
    try {
      sessionStorage.setItem(discoveryStateKey, JSON.stringify(next));
    } catch {
      setHandoffError("Discovery could not be saved in this browser tab.");
    }
  }

  function approve(briefLine: string) {
    const current = readStrategySession();
    if (!current || !current.preparation || !briefLine.trim()) return;
    const currentPack = compileInputPack(current.preparation);
    if (!preparationReady(current.preparation, aiMode)) {
      setHandoffError("Prepare the current Input Pack before approving strategy.");
      return;
    }
    const state = latestDiscovery.current ?? discovery;
    if (!state || state.contextVersion !== inputPackVersion(currentPack)) {
      setHandoffError(
        "The Input Pack changed after this research. Refresh the lenses before approving.",
      );
      return;
    }
    const strategyPack = structuredClone(currentPack);
    const approved: NonNullable<StrategySession["approved"]> = {
      approvalState: "Approved",
      sourcePerspectives: [],
      briefLine: briefLine.trim(),
      strategyInputPack: strategyPack,
      approvedAt: new Date().toISOString(),
      approvedBy: "Kevin",
      source: "Human-authored in Insight Discovery",
    };
    const priorExecution = current.execution ?? emptyExecution;
    const nextSession: StrategySession = {
      ...current,
      discovery: state,
      sharedPack: strategyPack,
      finalLine: briefLine.trim(),
      finalSource: "Human-authored in Insight Discovery",
      finalSourceLines: [],
      approved,
      execution: prefillExecution(
        priorExecution,
        strategyPack,
        current.executionSourcePack ?? current.approved?.strategyInputPack,
      ),
      executionSourcePack: strategyPack,
      brief: null,
      step: 2,
    };
    sessionStorage.setItem(strategySessionKey, JSON.stringify(nextSession));
    sessionStorage.removeItem(discoveryStateKey);
    window.location.reload();
  }

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!target || !ready || !snapshot) return null;
  return createPortal(
    <>
      <InsightDiscoveryEntry
        ready={ready}
        onOpen={startDiscovery}
      />
      {open && pack && discovery && (
        <InsightDiscoveryFeature
          open={open}
          pack={pack}
          state={discovery}
          briefLine={discovery.humanBriefLine ?? ""}
          onStateChange={saveDiscovery}
          onBriefLineChange={(humanBriefLine) =>
            saveDiscovery({ ...discovery, humanBriefLine })
          }
          onApprove={approve}
          onClose={() => setOpen(false)}
        />
      )}
      {handoffError && (
        <div className="discovery-handoff-error" role="alert">
          {handoffError}
        </div>
      )}
    </>,
    target,
  );
}
