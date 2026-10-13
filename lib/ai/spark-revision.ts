import { outputSchemas, type AgentDataMap, type AgentRequest } from "./schemas";
import { AgentError } from "./errors";

export function sparkRevisionPlan(request: AgentRequest) {
  if (!("sparkRevision" in request) || !request.sparkRevision) return;
  if (request.agentType !== "sparks")
    throw new AgentError("Spark changes apply only to the Sparks agent.", 400);
  const parsed = outputSchemas.sparks.safeParse(request.previousVersion?.data);
  if (!parsed.success)
    throw new AgentError(
      "Select a complete saved Spark set before refining an individual idea.",
      400,
    );
  const { targetId, keptIds } = request.sparkRevision;
  const old = parsed.data.sparks;
  const ids = new Set(old.map((spark) => spark.id));
  if (
    ids.size !== 6 ||
    keptIds.some((id) => !ids.has(id)) ||
    (targetId && !ids.has(targetId))
  )
    throw new AgentError(
      "The selected Spark version changed. Review the current ideas before trying again.",
      400,
    );
  if (
    (targetId && keptIds.includes(targetId)) ||
    (!targetId && new Set(keptIds).size === 6)
  )
    throw new AgentError("Release a kept Spark before changing it.", 400);
  return {
    old,
    replace: old.map((spark) =>
      targetId ? spark.id === targetId : !keptIds.includes(spark.id),
    ),
  };
}

// Retained ideas are copied from the saved version, regardless of model adherence.
export function applySparkRevision(
  request: AgentRequest,
  generated: AgentDataMap["sparks"],
) {
  const plan = sparkRevisionPlan(request);
  if (!plan) return generated;
  return {
    sparks: generated.sparks.map((spark, index) =>
      plan.replace[index] ? spark : plan.old[index],
    ),
  };
}
