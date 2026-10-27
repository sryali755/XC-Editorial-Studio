"use client";

import { useEffect, useState } from "react";
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
};

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
  const campaign = contextText(context.campaignName, "this campaign", 120);
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
    consumer: `Mock perspective for ${campaign}: the Input Pack names ${audience}. That does not establish their needs or behavior; validate audience motivations before treating them as findings.`,
    culture: `Mock perspective for ${campaign}: the Input Pack does not establish cultural trends or current behavior. Treat any cultural explanation as a hypothesis that needs evidence.`,
    category: `Mock perspective for ${campaign}: the pack names ${product} and ${channel}, but does not verify competitor activity or category advantage. Treat comparisons as questions to research.`,
    brand: `Mock perspective for ${campaign}: the supplied reason to believe is “${reasonToBelieve}”. Keep in view that ${constraints}; the claim still needs proof review before it is treated as a supported customer benefit.`,
    analogous: `Mock perspective for ${campaign}: this discussion has not verified an analogous solution. Any pattern from another category should be researched before it informs strategy.`,
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

export default function TeamDiscussion({
  campaignContext,
}: {
  campaignContext: TeamDiscussionContext;
}) {
  const [layout, setLayout] = useState<Layout>("group-chat");
  const [messages, setMessages] = useState(() =>
    campaignMessages(campaignContext),
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<TeamDiscussionMessage | null>(
    null,
  );
  const [job, setJob] = useState<AgentJob | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [deeperResearchStatus, setDeeperResearchStatus] =
    useState<TeamDiscussionProps["deeperResearchStatus"]>("offered");

  useEffect(() => {
    if (window.location.hash !== "#team-discussion-reset") return;
    const timer = window.setTimeout(() => {
      setMessages([]);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
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
  }, [job, campaignContext]);

  useEffect(() => {
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
            text: `Mock follow-up for ${contextText(campaignContext.campaignName, "this campaign")}: no research sources were queried, so the prototype cannot verify customer behavior or market claims. Validate any strategic assumption with approved evidence.`,
            threadId: messages[0]?.threadId ?? "mock-follow-up",
            ...(messages[1] ? { replyTo: messages[1].id } : {}),
          },
        ];
      });
      setDeeperResearchStatus("completed");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [deeperResearchStatus, campaignContext, messages]);

  function send(text: string, retryJob?: AgentJob) {
    if (retryJob) {
      setJob({ ...retryJob, status: "generating", fail: false });
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
    };
    setMessages((current) => [...current, message]);
    setJob(nextJob);
    setDraft("");
    setReplyTarget(null);
    setFailNext(false);
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
    onApproveDeeperResearch: () =>
      setDeeperResearchStatus((current) =>
        current === "offered" ? "generating" : current,
      ),
    onDeclineDeeperResearch: () =>
      setDeeperResearchStatus((current) =>
        current === "offered" ? "declined" : current,
      ),
  };

  return (
    <section
      className="team-discussion"
      aria-label="Experimental Team Discussion"
    >
      <header className="team-discussion-intro">
        <div>
          <span className="eyebrow">EXPERIMENTAL · UI PROTOTYPES</span>
          <h2>Team Discussion</h2>
          <p>
            Compare three ways Kevin Mercer and the five agents could discuss
            the active campaign. Responses are illustrative mock content, not AI
            output or verified research.
          </p>
        </div>
        <span className="team-mock-badge">
          {campaignContext.hasInputPack
            ? "MOCK RESPONSES · INPUT-PACK CONTEXT"
            : "MOCK SAMPLE · NO INPUT PACK"}
        </span>
      </header>
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
            Agent messages are local mock perspectives framed by these fields.
            No AI or research source is queried, and mock saves do not enter
            campaign findings or strategy.
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
          {layout === option.id &&
            (option.id === "group-chat" ? (
              <GroupChatPrototype {...prototypeProps} />
            ) : option.id === "threaded-discussion" ? (
              <ThreadedDiscussionPrototype {...prototypeProps} />
            ) : (
              <HybridRoundtablePrototype {...prototypeProps} />
            ))}
        </div>
      ))}
    </section>
  );
}
