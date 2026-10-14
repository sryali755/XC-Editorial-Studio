"use client";

import type { DiscoveryFinding } from "@/lib/types";

export default function SavedDiscoveryFinding({
  finding,
  currentPackVersion,
  onInspect,
}: {
  finding: DiscoveryFinding;
  currentPackVersion: string;
  onInspect: () => void;
}) {
  return (
    <details className="saved-discovery-reference">
      <summary>{finding.title}</summary>
      <small>
        {finding.lensId} · V{finding.runVersion} · {finding.inputPackVersion}
        {finding.inputPackVersion !== currentPackVersion && " · Needs refresh"}
        {finding.provider === "mock" && " · DEMO DATA"}
      </small>
      <p>{finding.whatWeFound}</p>
      {finding.evidence.map((evidence, index) => (
        <blockquote key={index}>
          “{evidence.excerpt}”
          <small>
            {evidence.source} · {evidence.locator || "Supplied source"} ·{" "}
            {evidence.date} · Access: {evidence.accessScope}
          </small>
        </blockquote>
      ))}
      {!finding.evidence.length && (
        <p>No evidence-backed finding is claimed.</p>
      )}
      <b>Agent interpretation</b>
      <p>{finding.whyItMayMatter}</p>
      <b>Limitations / counterevidence</b>
      <p>{finding.whatComplicatesIt}</p>
      <b>Next question</b>
      <p>{finding.questionToExplore}</p>
      <button type="button" className="button small" onClick={onInspect}>
        Inspect exact finding version
      </button>
    </details>
  );
}
