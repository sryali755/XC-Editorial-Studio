import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { briefInvestigationQuestions } from "../../lib/discovery-questions";
import {
  mobileIMCBrief,
  mobileReasonToBelieve,
} from "../fixtures/mobile-imc-brief";

const mobilePack = () =>
  studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief));

test("brief questions are grounded in this Input Pack, distinct and editable", () => {
  const pack = mobilePack();
  const questions = briefInvestigationQuestions(pack);
  expect(questions.length).toBeGreaterThanOrEqual(10);
  expect(new Set(questions).size).toBe(questions.length);
  for (const question of questions) {
    expect(question).toMatch(/\?$/);
    expect(question).not.toMatch(/\*\*|undefined|null/);
  }
  const all = questions.join("\n");
  // The full campaign name, minus its own closing full stop.
  expect(all).toContain("from responding to More Life. Less Phone Drama?");
  expect(pack.campaignName).toBe("More Life. Less Phone Drama.");
  expect(all).toContain("Adults aged 25–50");
  expect(all).toContain(mobileReasonToBelieve.split(",")[0]);
  expect(all).toContain("People want mobile connectivity");
  expect(all).toContain("Encourage existing Xfinity Internet customers");
  expect(all).toContain("Increase awareness and consideration");
  // Consecutive questions are different kinds, not the same template twice.
  expect(questions[0]).not.toBe(questions[1]);
});

test("only explicitly selected Sparks and research gaps add questions", () => {
  const pack = mobilePack();
  const base = briefInvestigationQuestions(pack);
  pack.sparks = "UNSELECTED-SPARK must never appear";
  pack.selectedSparks = [
    {
      id: "spark-1",
      version: 1,
      versionId: "v1",
      text: "Selected territory",
      hypothesis: "Plan comparison feels like a chore for busy households.",
    },
  ];
  pack.selectedResearch = [
    {
      id: "gap",
      version: 1,
      versionId: "r1",
      category: "EVIDENCE GAPS",
      source: "AI synthesis of supplied context",
      status: "ai_synthesis",
      text: "No supplied research measures plan-switching effort.",
    },
    {
      id: "name",
      version: 1,
      versionId: "r1",
      category: "CAMPAIGN NAME",
      source: "AI synthesis of supplied context",
      status: "ai_synthesis",
      text: "More Life. Less Phone Drama.",
    },
  ];
  const questions = briefInvestigationQuestions(pack);
  expect(questions.slice(0, base.length)).toEqual(base);
  expect(questions).toContain(
    "What evidence would test this Spark hypothesis: “Plan comparison feels like a chore for busy households”?",
  );
  expect(questions).toContain(
    "How could we close this evidence gap: “No supplied research measures plan-switching effort”?",
  );
  expect(questions.join("\n")).not.toContain("UNSELECTED-SPARK");
  expect(questions).toHaveLength(base.length + 2);
});

test("each campaign gets its own questions, and an empty pack still offers a start", () => {
  const scopes = detectIMCCampaignScopes(
    readFileSync(
      path.join(
        __dirname,
        "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
      ),
      "utf8",
    ),
  );
  const [movers, pro] = scopes.map((scope) =>
    briefInvestigationQuestions(
      studioPack(applyStudioSource(emptyStudio(), scope.sourceText)),
    ).join("\n"),
  );
  expect(movers).toContain(scopes[0].title);
  expect(movers).not.toContain(scopes[1].title);
  expect(pro).toContain(scopes[1].title);
  expect(pro).not.toContain(scopes[0].title);
  const empty = briefInvestigationQuestions(studioPack(emptyStudio()));
  expect(empty.length).toBeGreaterThan(0);
  expect(empty[0]).toBe(
    "What barriers could prevent the intended audience from responding to this campaign?",
  );
});
