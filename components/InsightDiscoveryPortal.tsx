"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { approveDiscoveryCanvas } from "@/lib/discovery-handoff";
import {
  discoveryStorageKey,
  readDiscoveryDraft,
} from "@/lib/discovery-persistence";
import { recoverDiscoveryState } from "@/lib/discovery-state";
import { compileInputPack, preparationReady } from "@/lib/preparation";
import { inputPackVersion, emptyDiscoveryState } from "@/lib/discovery";
import type {
  DiscoveryState,
  StrategyInputPack,
  StrategySession,
} from "@/lib/types";
import { InsightDiscoveryEntry } from "./InsightDiscoveryFeature";
import InsightDiscoveryFeature from "./InsightDiscoveryFeature";

const strategySessionKey = "xc-strategy-session-v1";

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

  const contextPack = useCallback(
    (current: StrategySession): StrategyInputPack | undefined => {
      if (preparationReady(current.preparation, aiMode))
        return compileInputPack(current.preparation);
      return current.step >= 2 && current.approved?.discoveryCanvas
        ? current.approved.strategyInputPack
        : undefined;
    },
    [aiMode],
  );

  const refresh = useCallback(() => {
    const current = readStrategySession();
    const currentPack = current && contextPack(current);
    const hasDiscovery =
      currentPack &&
      (current?.discovery || readDiscoveryDraft(sessionStorage, currentPack));
    const anchor =
      document.querySelector<HTMLElement>(".dynamic-pack") ??
      (hasDiscovery ? document.querySelector<HTMLElement>("#main") : null);
    setTarget((current) => (current === anchor ? current : anchor));
    if (open) return;
    const raw = sessionStorage.getItem(strategySessionKey) ?? "";
    if (raw === lastSessionText.current) return;
    lastSessionText.current = raw;
    setSnapshot(readStrategySession());
  }, [open, contextPack]);

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

  const ready = Boolean(snapshot && contextPack(snapshot));

  function startDiscovery() {
    const current = readStrategySession();
    if (!current) return;
    const currentPack = contextPack(current);
    if (!currentPack) return;
    const restored =
      readDiscoveryDraft(sessionStorage, currentPack) ??
      (current.discovery &&
      current.approved?.discoveryCanvas &&
      discoveryStorageKey(current.approved.strategyInputPack) ===
        discoveryStorageKey(currentPack)
        ? recoverDiscoveryState(current.discovery)
        : undefined) ??
      freshDiscoveryState(currentPack);
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
      if (pack)
        sessionStorage.setItem(discoveryStorageKey(pack), JSON.stringify(next));
    } catch {
      setHandoffError("Discovery could not be saved in this browser tab.");
    }
  }

  function approve(briefLine: string) {
    const current = readStrategySession();
    if (!current || !current.preparation || !briefLine.trim()) return;
    const currentPack = compileInputPack(current.preparation);
    if (!preparationReady(current.preparation, aiMode)) {
      setHandoffError(
        "Prepare the current Input Pack before approving strategy.",
      );
      return;
    }
    const state = latestDiscovery.current ?? discovery;
    if (
      !state ||
      !pack ||
      inputPackVersion(pack) !== inputPackVersion(currentPack)
    ) {
      setHandoffError(
        "The Input Pack changed while this workspace was open. Reopen Discovery to review the latest context before approving.",
      );
      return;
    }
    try {
      const nextSession = approveDiscoveryCanvas(
        current,
        currentPack,
        state,
        briefLine,
      );
      sessionStorage.setItem(strategySessionKey, JSON.stringify(nextSession));
      // Keep the research draft and its threads available from later stages.
      sessionStorage.setItem(
        discoveryStorageKey(currentPack),
        JSON.stringify(state),
      );
      window.location.reload();
    } catch (failure) {
      setHandoffError(
        failure instanceof Error
          ? failure.message
          : "Strategy approval could not be saved. Your research draft is preserved.",
      );
    }
  }

  if (!target || !ready || !snapshot) return null;
  return createPortal(
    <>
      <InsightDiscoveryEntry
        ready={ready}
        onOpen={startDiscovery}
        returning={snapshot.step !== 0}
      />
      {open && pack && discovery && (
        <InsightDiscoveryFeature
          open={open}
          pack={pack}
          state={discovery}
          briefLine={discovery.humanBriefLine ?? ""}
          onStateChange={saveDiscovery}
          onApprove={approve}
          onClose={() => setOpen(false)}
          approvalError={handoffError}
        />
      )}
      {handoffError && !open && (
        <div className="discovery-handoff-error" role="alert">
          {handoffError}
        </div>
      )}
    </>,
    target,
  );
}
