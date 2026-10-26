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

const mockReplies: Record<TeamAgentId, string> = {
  consumer:
    "From the consumer lens, the practical need may be a simpler move-in decision. Treat any effect on spend as unverified until mover-specific evidence supports it.",
  culture:
    "A move can signal a reset, yet time pressure and decision fatigue may shape how people evaluate offers. This is a hypothesis to test, not a verified trend.",
  category:
    "A useful category question is where comparison or switching creates avoidable effort. The opportunity may be clearer next steps rather than a higher-spend assumption.",
  brand:
    "Continuity and reliable connectivity could be relevant brand benefits if the supplied proof supports them. Avoid implying a guaranteed reduction in moving stress.",
  analogous:
    "Guided onboarding in other high-friction services offers a pattern to explore: reduce choices, explain the next step, and make progress visible. The analogy needs validation.",
};

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
  campaignLabel,
}: {
  campaignLabel: string;
}) {
  const [layout, setLayout] = useState<Layout>("group-chat");
  const [messages, setMessages] = useState(initialMessages);
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
        text: mockReplies[agentId],
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
  }, [job]);

  useEffect(() => {
    if (deeperResearchStatus !== "generating") return;
    const timer = window.setTimeout(() => {
      setMessages((current) => {
        const resultId = "movers-deeper-research-result";
        if (current.some((message) => message.id === resultId)) return current;
        return [
          ...current,
          {
            id: resultId,
            author: "consumer",
            text: "Mock follow-up: This prototype cannot access research sources, so it cannot confirm whether Movers spend more. Keep the spending claim unverified and validate it with approved mover-specific evidence before using it.",
            threadId: "movers-question-stress",
            replyTo: "movers-consumer-stress",
          },
        ];
      });
      setDeeperResearchStatus("completed");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [deeperResearchStatus]);

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
            Compare three ways Kevin Mercer and the five agents could discuss a
            campaign together. This stage uses a fixed illustrative Movers
            example, not the selected campaign&apos;s Input Pack.
          </p>
        </div>
        <span className="team-mock-badge">SIMULATED SAMPLE · IN MEMORY</span>
      </header>
      <div className="team-campaign-boundary" role="note">
        <b>Current workspace: {campaignLabel}</b>
        <span>
          The messages below are clearly isolated Movers sample content. They
          are not live agent output, verified evidence, or saved campaign work,
          and they will not survive a refresh.
        </span>
      </div>
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
