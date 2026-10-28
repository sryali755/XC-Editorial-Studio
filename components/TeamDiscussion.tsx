"use client";

import { useEffect, useRef, useState } from "react";
import { generateDiscoveryVersion } from "@/lib/discovery";
import type { StrategyInputPack } from "@/lib/types";
import GroupChatPrototype from "./GroupChatPrototype";
import HybridRoundtablePrototype from "./HybridRoundtablePrototype";
import ThreadedDiscussionPrototype from "./ThreadedDiscussionPrototype";
import {
  teamAgents,
  type TeamAgentId,
  type TeamDiscussionMessage,
  type TeamDiscussionProps,
} from "./team-discussion-types";

type Layout = "group-chat" | "threaded-discussion" | "hybrid-roundtable";
type AgentJob = {
  id: string;
  messageId: string;
  threadId: string;
  agentIds: TeamAgentId[];
  fail: boolean;
  status: TeamDiscussionProps["status"];
  question: string;
  deeper?: boolean;
};
type ResearchMode = "checking" | "live" | "mock" | "unavailable";

export type TeamDiscussionContext = {
  contextVersion: string;
  campaignName: string;
  objective: string;
  audience: string;
  product: string;
  channel: string;
  constraints: string;
  reasonToBelieve: string;
  hasInputPack: boolean;
};

const initialMessages: TeamDiscussionMessage[] = [
  {
    id: "movers-question-stress",
    author: "kevin",
    text: "For Movers, do we think stress changes what households spend on internet, or mostly what they need from the experience?",
    threadId: "movers-question-stress",
  },
  {
    id: "movers-consumer-stress",
    author: "consumer",
    text: "I’d be careful about calling it a spending driver. Stress might make people want setup to be simple, but we don’t have mover-specific evidence that they’ll pay more.",
    threadId: "movers-question-stress",
    replyTo: "movers-question-stress",
    offersDeeperResearch: true,
  },
  {
    id: "movers-brand-stress",
    author: "brand",
    text: "That distinction makes sense. We could frame reliability and continuity as ways to make the move easier—as long as the product proof backs it up.",
    threadId: "movers-question-stress",
    replyTo: "movers-consumer-stress",
  },
  {
    id: "movers-culture-stress",
    author: "culture",
    text: "There may be a fresh-start mindset too. But people are juggling a lot during a move, so a complicated offer could land at the wrong time.",
    threadId: "movers-question-stress",
    replyTo: "movers-question-stress",
  },
  {
    id: "movers-question-category",
    author: "kevin",
    text: "Good point. @Category, how do switching and comparison look in this moment? Does that line up with what @Consumer is seeing?",
    threadId: "movers-question-category",
    replyTo: "movers-consumer-stress",
    addressedTo: ["category"],
    relatedTo: "movers-question-stress",
  },
  {
    id: "movers-category-switching",
    author: "category",
    text: "I see the opportunity more in making the choice easier than assuming people will spend more. Movers may need a clearer way to compare and switch.",
    threadId: "movers-question-category",
    replyTo: "movers-question-category",
  },
  {
    id: "movers-analogous-onboarding",
    author: "analogous",
    text: "Building on that, other high-friction services often guide people through just a few clear next steps. It could be a useful pattern to explore, though we’d need to test whether it fits this category.",
    threadId: "movers-question-category",
    replyTo: "movers-category-switching",
  },
  {
    id: "movers-brand-group",
    author: "brand",
    text: "For the group: there may be a brand role in making move-in support feel clear and dependable, if the product proof supports it.",
    threadId: "movers-question-category",
    replyToGroup: true,
  },
];

function contextText(value: string, fallback: string, limit = 260) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  return cleaned.length > limit
    ? `${cleaned.slice(0, limit).trimEnd()}…`
    : cleaned;
}

function briefQuestions(context: TeamDiscussionContext) {
  if (!context.hasInputPack) return [];
  const objective = contextText(
    context.objective,
    "the campaign objective",
    110,
  );
  const audience = contextText(context.audience, "the intended audience", 100);
  const product = contextText(context.product, "the product", 80);
  const channel = contextText(context.channel, "the planned channel", 80);
  return [
    `What does the brief support about the objective to ${objective}, and what still needs evidence?`,
    `What needs or barriers might matter to ${audience}, and which are documented versus assumptions?`,
    `Which benefits of ${product} have support in the brief, and which claims need proof or approval?`,
    `What alternatives to adopting ${product} should we investigate, including doing nothing?`,
    `How could ${channel} address this audience within the brief's constraints, and what should we validate first?`,
  ];
}

function campaignMessages(context: TeamDiscussionContext) {
  if (!context.hasInputPack) return initialMessages;

  const questionId = "campaign-question-context";
  const followupId = "campaign-question-category";
  const campaign = contextText(context.campaignName, "this campaign", 120);
  const audience = contextText(context.audience, "the intended audience");
  const product = contextText(context.product, "the stated product");
  const channel = contextText(
    context.channel,
    "no campaign channel was supplied",
  );
  const constraints = contextText(
    context.constraints,
    "No campaign constraints were supplied.",
  );
  const reasonToBelieve = contextText(
    context.reasonToBelieve,
    "No reason to believe was supplied in the active Input Pack.",
  );
  const objective = contextText(
    context.objective,
    "No campaign objective was supplied in the active Input Pack.",
  );
  return [
    {
      id: questionId,
      author: "kevin",
      text: `For ${campaign}, what should we investigate about this stated objective: “${objective}”?`,
      threadId: questionId,
    },
    {
      id: "campaign-consumer-context",
      author: "consumer",
      text: `The Input Pack identifies ${audience}. That is targeting context, not evidence about people's needs, behavior, or willingness to spend. Treat consumer motivations as questions to validate.`,
      threadId: questionId,
      replyTo: questionId,
    },
    {
      id: "campaign-brand-context",
      author: "brand",
      text: `The supplied reason to believe is: ${reasonToBelieve} It is source context, not independently verified proof of a customer benefit.`,
      threadId: questionId,
      replyTo: "campaign-consumer-context",
    },
    {
      id: "campaign-culture-context",
      author: "culture",
      text: `The Input Pack does not by itself establish cultural trends or current behavior for ${audience}. Any cultural interpretation remains a hypothesis to validate.`,
      threadId: questionId,
      replyTo: questionId,
    },
    {
      id: followupId,
      author: "kevin",
      text: `@Category, what category questions should we investigate for ${product}, and how might they compare with @Consumer's audience context?`,
      threadId: followupId,
      replyTo: "campaign-consumer-context",
      addressedTo: ["category"],
      relatedTo: questionId,
    },
    {
      id: "campaign-category-context",
      author: "category",
      text: `The Input Pack lists ${channel} for ${product}, but does not verify competitor activity or a category gap. Those comparisons need supporting evidence before we treat them as findings.`,
      threadId: followupId,
      replyTo: followupId,
    },
    {
      id: "campaign-analogous-context",
      author: "analogous",
      text: "No analogous solution is verified by this mock discussion. Any pattern from another category would be an avenue to investigate, not evidence or a recommendation.",
      threadId: followupId,
      replyTo: "campaign-category-context",
    },
    {
      id: "campaign-brand-group",
      author: "brand",
      text: `For the group: honor the supplied campaign constraints (${constraints}) and keep strategy grounded in the objective and proof. This prototype does not verify claims or approve a direction.`,
      threadId: followupId,
      replyToGroup: true,
    },
  ] satisfies TeamDiscussionMessage[];
}

function campaignMockReplies(context: TeamDiscussionContext) {
  const audience = contextText(context.audience, "the intended audience");
  const product = contextText(context.product, "the stated product");
  const channel = contextText(
    context.channel,
    "no campaign channel was supplied",
  );
  const constraints = contextText(
    context.constraints,
    "no campaign constraints were supplied",
  );
  const reasonToBelieve = contextText(
    context.reasonToBelieve,
    "no reason to believe was supplied",
  );
  return {
    consumer: `The Input Pack names ${audience}. That does not establish their needs or behavior; validate audience motivations before treating them as findings.`,
    culture:
      "The Input Pack does not establish cultural trends or current behavior. Treat any cultural explanation as a hypothesis that needs evidence.",
    category: `The pack names ${product} and ${channel}, but does not verify competitor activity or category advantage. Treat comparisons as questions to research.`,
    brand: `The supplied reason to believe is “${reasonToBelieve}”. Keep in view that ${constraints}; the claim still needs proof review before it is treated as a supported customer benefit.`,
    analogous:
      "This discussion has not verified an analogous solution. Any pattern from another category should be researched before it informs strategy.",
  } satisfies Record<TeamAgentId, string>;
}

const layouts: { id: Layout; label: string }[] = [
  { id: "group-chat", label: "Group Chat" },
  { id: "threaded-discussion", label: "Threaded Discussion" },
  { id: "hybrid-roundtable", label: "Hybrid Roundtable" },
];

function mentionedAgents(text: string) {
  const normalized = text.toLowerCase();
  return teamAgents.filter(
    (agent) =>
      normalized.includes(`@${agent.mention.toLowerCase()}`) ||
      normalized.includes(`@${agent.name.toLowerCase()}`),
  );
}

function useTeamConversation(
  campaignContext: TeamDiscussionContext,
  pack: StrategyInputPack,
  mode: ResearchMode,
) {
  const [messages, setMessages] = useState<TeamDiscussionMessage[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<TeamDiscussionMessage | null>(
    null,
  );
  const [job, setJob] = useState<AgentJob | null>(null);
  const [error, setError] = useState("");
  const [failedAgents, setFailedAgents] = useState<TeamAgentId[]>([]);
  const controller = useRef<AbortController | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [deeperResearchStatus, setDeeperResearchStatus] =
    useState<TeamDiscussionProps["deeperResearchStatus"]>("offered");

  useEffect(() => {
    if (mode !== "mock") return;
    if (!job || job.status !== "generating") return;
    const timer = window.setTimeout(() => {
      if (job.fail) {
        setJob((current) =>
          current?.id === job.id ? { ...current, status: "failed" } : current,
        );
        return;
      }
      const responses = job.agentIds.map((agentId) => ({
        id: `${job.id}-${agentId}`,
        author: agentId,
        text: campaignMockReplies(campaignContext)[agentId],
        threadId: job.threadId,
        replyTo: job.messageId,
      }));
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [
          ...current,
          ...responses.filter((message) => !existing.has(message.id)),
        ];
      });
      setJob((current) =>
        current?.id === job.id ? { ...current, status: "completed" } : current,
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [job, campaignContext, mode]);

  useEffect(() => () => controller.current?.abort(), []);

  async function runLive(nextJob: AgentJob) {
    const requestController = new AbortController();
    controller.current = requestController;
    const failures: { agent: TeamAgentId; reason: string }[] = [];
    let index = 0;
    const workers = Array.from(
      { length: Math.min(2, nextJob.agentIds.length) },
      async () => {
        while (
          index < nextJob.agentIds.length &&
          !requestController.signal.aborted
        ) {
          const agentId = nextJob.agentIds[index++];
          try {
            const version = await generateDiscoveryVersion({
              lensId: agentId,
              pack,
              question: nextJob.question,
              investigationType: "problem",
              action: nextJob.deeper ? "explore_deeper" : "initial",
              guidance: nextJob.question,
              previous: [],
              signal: requestController.signal,
            });
            if (requestController.signal.aborted) return;
            if (version.provider === "mock")
              throw new Error(
                "The server returned mock output instead of live research. Check its AI mode and retry.",
              );
            const finding = version.findings[0];
            if (!finding)
              throw new Error("The agent returned no validated finding.");
            const findings = version.findings.map((item) => ({
              title: item.title,
              text: item.whatWeFound,
              evidenceState: item.evidenceState,
              citations: item.evidence.map(({ source, locator, excerpt }) => ({
                source,
                locator,
                excerpt,
              })),
            }));
            setMessages((current) =>
              current.some(
                (message) => message.id === `${nextJob.id}-${agentId}`,
              )
                ? current
                : [
                    ...current,
                    {
                      id: `${nextJob.id}-${agentId}`,
                      author: agentId,
                      text: finding.whatWeFound,
                      evidenceState: findings.every(
                        (item) => item.evidenceState === "research_gap",
                      )
                        ? "research_gap"
                        : "evidence_supported",
                      findings,
                      provider: version.provider,
                      offersDeeperResearch:
                        agentId === "consumer" && !nextJob.deeper,
                      threadId: nextJob.threadId,
                      replyTo: nextJob.messageId,
                    },
                  ],
            );
          } catch (failure) {
            if (!requestController.signal.aborted)
              failures.push({
                agent: agentId,
                reason:
                  failure instanceof Error
                    ? failure.message
                    : "The agent failed.",
              });
          }
        }
      },
    );
    await Promise.all(workers);
    if (requestController.signal.aborted) return;
    setFailedAgents(failures.map(({ agent }) => agent));
    setError(
      failures
        .map(
          ({ agent, reason }) =>
            `${teamAgents.find((item) => item.id === agent)?.name}: ${reason}`,
        )
        .join(" "),
    );
    setJob((current) =>
      current?.id === nextJob.id
        ? { ...current, status: failures.length ? "failed" : "completed" }
        : current,
    );
    if (nextJob.deeper)
      setDeeperResearchStatus(failures.length ? "failed" : "completed");
    controller.current = null;
  }

  useEffect(() => {
    if (mode !== "mock") return;
    if (deeperResearchStatus !== "generating") return;
    const timer = window.setTimeout(() => {
      setMessages((current) => {
        const resultId = "campaign-deeper-research-result";
        if (current.some((message) => message.id === resultId)) return current;
        return [
          ...current,
          {
            id: resultId,
            author: "consumer",
            text: "No research sources were queried, so this prototype cannot verify customer behavior or market claims. Validate any strategic assumption with approved evidence.",
            threadId: messages[0]?.threadId ?? "mock-follow-up",
            ...(messages[1] ? { replyTo: messages[1].id } : {}),
          },
        ];
      });
      setDeeperResearchStatus("completed");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [deeperResearchStatus, campaignContext, messages, mode]);

  function send(text: string, retryJob?: AgentJob, deeper = false) {
    if (retryJob) {
      const retry = {
        ...retryJob,
        agentIds: mode === "live" ? failedAgents : retryJob.agentIds,
        status: "generating" as const,
        fail: false,
      };
      setJob(retry);
      setError("");
      if (retry.deeper) setDeeperResearchStatus("generating");
      if (mode === "live") void runLive(retry);
      return;
    }
    const id = `kevin-${crypto.randomUUID()}`;
    const mentioned = mentionedAgents(text);
    const directReply =
      replyTarget && replyTarget.author !== "kevin"
        ? [teamAgents.find((agent) => agent.id === replyTarget.author)!]
        : [];
    const targets = mentioned.length
      ? mentioned
      : directReply.length
        ? directReply
        : [...teamAgents];
    const message: TeamDiscussionMessage = {
      id,
      author: "kevin",
      text,
      threadId: replyTarget?.threadId ?? id,
      replyTo: replyTarget?.id,
      addressedTo: mentioned.map((agent) => agent.id),
    };
    const nextJob: AgentJob = {
      id: `job-${crypto.randomUUID()}`,
      messageId: id,
      threadId: message.threadId,
      agentIds: targets.map((agent) => agent.id),
      fail: failNext,
      status: "generating",
      question: text,
      deeper,
    };
    setMessages((current) => [...current, message]);
    setJob(nextJob);
    setDraft("");
    setReplyTarget(null);
    setFailNext(false);
    setError("");
    setFailedAgents([]);
    setDeeperResearchStatus(deeper ? "generating" : "offered");
    if (mode === "live") void runLive(nextJob);
  }

  const prototypeProps: TeamDiscussionProps = {
    messages,
    savedIds,
    onToggleSave: (messageId) =>
      setSavedIds((current) => {
        const next = new Set(current);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      }),
    onReply: setReplyTarget,
    replyTarget,
    onClearReply: () => setReplyTarget(null),
    draft,
    onDraftChange: setDraft,
    onSend: (text) => send(text),
    status: job?.status ?? "idle",
    onRetry: () => {
      if (job) send(job.messageId, job);
    },
    failNext,
    onFailNextChange: setFailNext,
    deeperResearchStatus,
    onApproveDeeperResearch: (message) =>
      mode === "live"
        ? send(
            `@Consumer Please investigate this question more deeply using the supplied brief: ${messages.find((item) => item.id === message.replyTo)?.text ?? campaignContext.objective}`,
            undefined,
            true,
          )
        : setDeeperResearchStatus((current) =>
            current === "offered" ? "generating" : current,
          ),
    onDeclineDeeperResearch: () =>
      setDeeperResearchStatus((current) =>
        current === "offered" ? "declined" : current,
      ),
    live: mode === "live",
    canSend:
      (mode === "live" && campaignContext.hasInputPack) || mode === "mock",
    error,
  };

  return {
    messages,
    prototypeProps,
    loadSample: () => {
      setMessages(campaignMessages(campaignContext));
      setSavedIds(new Set());
      setDraft("");
      setReplyTarget(null);
      setJob(null);
      setError("");
      setFailedAgents([]);
      setFailNext(false);
      setDeeperResearchStatus("offered");
    },
  };
}

export default function TeamDiscussion({
  campaignContext,
  pack,
}: {
  campaignContext: TeamDiscussionContext;
  pack: StrategyInputPack;
}) {
  const [layout, setLayout] = useState<Layout>("group-chat");
  const [mode, setMode] = useState<ResearchMode>("checking");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/agent", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("AI status unavailable");
        const status = await response.json();
        setMode(
          status.configured
            ? status.mode === "live"
              ? "live"
              : "mock"
            : "unavailable",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setMode("unavailable");
      });
    return () => controller.abort();
  }, []);
  // Each prototype owns its conversation, drafts, saved items, and mock jobs.
  // Keep all three state hooks mounted so switching layouts preserves each one's work.
  const group = useTeamConversation(campaignContext, pack, mode);
  const threaded = useTeamConversation(campaignContext, pack, mode);
  const hybrid = useTeamConversation(campaignContext, pack, mode);
  const active =
    layout === "group-chat"
      ? group
      : layout === "threaded-discussion"
        ? threaded
        : hybrid;

  useEffect(() => {
    if (window.location.hash !== "#team-discussion-reset") return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  return (
    <section
      className="team-discussion"
      aria-label="Experimental Team Discussion"
    >
      <header className="team-discussion-intro">
        <div>
          <span className="eyebrow">TEAM DISCUSSION · BETA</span>
          <h2>Team Discussion</h2>
          <p>
            Compare three ways Kevin Mercer and the five agents could discuss
            the active campaign. Live responses analyze supplied brief sources;
            source claims and agent interpretations still need human review.
          </p>
        </div>
        <span className="team-mock-badge">
          {mode === "live"
            ? "LIVE BRIEF ANALYSIS"
            : mode === "checking"
              ? "CHECKING AI CONNECTION"
              : mode === "unavailable"
                ? "AI UNAVAILABLE"
                : !active.messages.length
                  ? "NO CONVERSATION YET"
                  : campaignContext.hasInputPack
                    ? "MOCK RESPONSES · INPUT-PACK CONTEXT"
                    : "MOCK SAMPLE · NO INPUT PACK"}
        </span>
      </header>
      {mode === "mock" && (
        <button
          type="button"
          className="team-secondary-button"
          onClick={active.loadSample}
        >
          Load sample conversation
        </button>
      )}
      {mode === "unavailable" && (
        <p role="alert">
          The AI service is unavailable. Check the server configuration and
          retry after it is restored.
        </p>
      )}
      {mode === "live" && !campaignContext.hasInputPack && (
        <p role="alert">Add an IMC brief before asking the live agents.</p>
      )}
      {campaignContext.hasInputPack && (
        <div className="team-campaign-context" role="note">
          <b>Active Input Pack: {campaignContext.campaignName}</b>
          <span>
            Objective:{" "}
            {contextText(
              campaignContext.objective,
              "Not supplied in this Input Pack.",
            )}
          </span>
          <span>
            Audience:{" "}
            {contextText(
              campaignContext.audience,
              "Not supplied in this Input Pack.",
            )}
          </span>
          {campaignContext.channel && (
            <span>
              Channel: {contextText(campaignContext.channel, "Not supplied.")}
            </span>
          )}
          {campaignContext.constraints && (
            <span>
              Constraints:{" "}
              {contextText(campaignContext.constraints, "Not supplied.")}
            </span>
          )}
          <small>
            {mode === "live"
              ? "Agents analyze supplied brief sources through the current AI provider. No external research source is connected. Review citations and gaps before using an answer in strategy."
              : "In mock mode, replies are illustrative and no research source is queried."}
          </small>
        </div>
      )}
      {briefQuestions(campaignContext).length > 0 && (
        <div
          className="team-starter-questions"
          aria-label="Questions from the active brief"
        >
          <b>Five questions Kevin can ask the team</b>
          <div>
            {briefQuestions(campaignContext).map((question, index) => (
              <button
                key={index}
                type="button"
                disabled={
                  mode === "checking" ||
                  mode === "unavailable" ||
                  active.prototypeProps.status === "generating"
                }
                onClick={() => active.prototypeProps.onDraftChange(question)}
              >
                {index + 1}. {question}
              </button>
            ))}
          </div>
          <small>
            Select a question, then press Send to team. An unaddressed question
            goes to all five agents.
          </small>
        </div>
      )}
      <div
        className="team-layout-selector"
        role="tablist"
        aria-label="Team Discussion prototype layout"
      >
        {layouts.map((option) => (
          <button
            key={option.id}
            role="tab"
            aria-selected={layout === option.id}
            aria-controls={`team-layout-${option.id}`}
            id={`team-tab-${option.id}`}
            className={layout === option.id ? "is-active" : ""}
            onClick={() => setLayout(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {layouts.map((option) => (
        <div
          key={option.id}
          id={`team-layout-${option.id}`}
          role="tabpanel"
          aria-labelledby={`team-tab-${option.id}`}
          hidden={layout !== option.id}
        >
          {option.id === "group-chat" ? (
            <GroupChatPrototype {...group.prototypeProps} />
          ) : option.id === "threaded-discussion" ? (
            <ThreadedDiscussionPrototype {...threaded.prototypeProps} />
          ) : (
            <HybridRoundtablePrototype {...hybrid.prototypeProps} />
          )}
        </div>
      ))}
    </section>
  );
}
