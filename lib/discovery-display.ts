// Presentation only: persisted execution states and request contracts stay unchanged.
export function discoveryDisplayStatus({
  working,
  status,
  stale,
  hasVersion,
  hasHistory,
}: {
  working: boolean;
  status?: string;
  stale: boolean;
  hasVersion: boolean;
  hasHistory: boolean;
}) {
  if (working || status === "researching")
    return { label: "Exploring", tone: "active" };
  if (status === "failed")
    return { label: "Needs Attention", tone: "attention" };
  if (status === "cancelled")
    return { label: "Exploration Paused", tone: "neutral" };
  if (stale || (!hasVersion && hasHistory))
    return { label: "Refresh Required", tone: "attention" };
  if (hasVersion) return { label: "Insights Ready", tone: "ready" };
  return { label: "Awaiting Exploration", tone: "neutral" };
}

export function studioModeDisclosure(mode: "mock" | "live") {
  return mode === "live"
    ? {
        label: "Live AI",
        description:
          "Starting an investigation uses paid AI requests. Preparation runs three agents; Round Table runs five. Automatic retries may add requests. Enterprise research and web search are not connected.",
      }
    : {
        label: "Demo Mode",
        description:
          "Suggestions and findings are simulated. Enterprise research and web search are not connected. Evidence gaps remain visible.",
      };
}
