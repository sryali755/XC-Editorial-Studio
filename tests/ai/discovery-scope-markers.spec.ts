import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { requestSchema } from "../../lib/ai/schemas";
import {
  discoverySubmissionIssue,
  runValidatedAgentRequest,
} from "../../lib/ai/discovery-submission";
import { discoveryFoundation } from "../../lib/discovery-context";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";

const original = readFileSync(
  path.join(
    __dirname,
    "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
  ),
  "utf8",
);

test("alternate source-page markers still identify and reject a multi-campaign submission", async () => {
  const alternate = original.replace(
    /^(?:## Source page|PDF PAGE)[ \t]+(\d+)[ \t]*$/gim,
    "--- Source page $1 ---",
  );
  const scopes = detectIMCCampaignScopes(alternate);
  expect(scopes).toHaveLength(2);
  expect(scopes[0].sourceText).toContain("--- Source page 7 ---");
  expect(scopes[1].sourceText).toContain("--- Source page 11 ---");

  const pack = studioPack(
    applyStudioSource(emptyStudio(), scopes[0].sourceText),
  );
  pack.selectedSparks = [
    {
      id: "source-spark",
      text: "Investigate the supplied mover message.",
      versionId: "offline-v0",
      version: 0,
      excerpt: "Transfer your services in a snap",
    },
  ];
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: {
        ...discoveryFoundation(pack),
        sourceBrief: alternate,
      },
      lens: "consumer",
      investigationType: "problem",
      question: "What could explain mover retention?",
      action: "initial",
      previousFindings: [],
    },
  });
  expect(discoverySubmissionIssue(request)).toContain("multiple campaigns");
  let invoked = false;
  await expect(
    runValidatedAgentRequest(request, async () => {
      invoked = true;
      return "must not run";
    }),
  ).rejects.toMatchObject({ code: "discovery_submission_mismatch" });
  expect(invoked).toBe(false);
});
