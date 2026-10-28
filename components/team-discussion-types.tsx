"use client";

import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Bookmark,
  Check,
  MessageSquareReply,
  Search,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";

export const teamAgents = [
  {
    id: "consumer",
    name: "Consumer Agent",
    mention: "Consumer",
    role: "Needs & behavior",
    initials: "CO",
    color: "blue",
  },
  {
    id: "culture",
    name: "Culture Agent",
    mention: "Culture",
    role: "Culture & context",
    initials: "CU",
    color: "purple",
  },
  {
    id: "category",
    name: "Category Agent",
    mention: "Category",
    role: "Category dynamics",
    initials: "CA",
    color: "green",
  },
  {
    id: "brand",
    name: "Brand Agent",
    mention: "Brand",
    role: "Brand & proof",
    initials: "BR",
    color: "amber",
  },
  {
    id: "analogous",
    name: "Analogous Solutions Agent",
    mention: "Analogous",
    role: "Analogous solutions",
    initials: "AS",
    color: "coral",
  },
] as const;

export type TeamAgentId = (typeof teamAgents)[number]["id"];
export type TeamDiscussionMessage = {
  id: string;
  author: "kevin" | TeamAgentId;
  text: string;
  threadId: string;
  replyTo?: string;
  replyToGroup?: boolean;
  addressedTo?: TeamAgentId[];
  relatedTo?: string;
  offersDeeperResearch?: boolean;
  provider?: "mock" | "openai" | "writer";
  evidenceState?: "evidence_supported" | "research_gap";
  findings?: {
    title: string;
    text: string;
    evidenceState: "evidence_supported" | "research_gap";
    citations: { source: string; locator?: string; excerpt: string }[];
  }[];
};
export type DeeperResearchStatus =
  "offered" | "declined" | "generating" | "completed" | "failed";
export type TeamDiscussionProps = {
  messages: TeamDiscussionMessage[];
  savedIds: Set<string>;
  onToggleSave: (messageId: string) => void;
  onReply: (message: TeamDiscussionMessage) => void;
  replyTarget: TeamDiscussionMessage | null;
  onClearReply: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  status: "idle" | "generating" | "completed" | "failed";
  onRetry: () => void;
  failNext: boolean;
  onFailNextChange: (value: boolean) => void;
  deeperResearchStatus: DeeperResearchStatus;
  onApproveDeeperResearch: (message: TeamDiscussionMessage) => void;
  onDeclineDeeperResearch: () => void;
  live?: boolean;
  error?: string;
  canSend?: boolean;
};

export function authorName(author: TeamDiscussionMessage["author"]) {
  return author === "kevin"
    ? "Kevin Mercer"
    : teamAgents.find((agent) => agent.id === author)!.name;
}

export function AgentAvatar({
  agentId,
  size = "normal",
}: {
  agentId: TeamAgentId | "kevin";
  size?: "normal" | "small";
}) {
  const agent =
    agentId === "kevin"
      ? { initials: "KM", color: "kevin" }
      : teamAgents.find((item) => item.id === agentId)!;
  return (
    <span
      className={`team-avatar team-avatar-${agent.color} ${size === "small" ? "is-small" : ""}`}
      {...(agentId === "kevin"
        ? { role: "img" as const, "aria-label": "Kevin Mercer" }
        : { "aria-hidden": true })}
    >
      {agentId === "kevin" ? (
        <>
          <span className="team-avatar-fallback">{agent.initials}</span>
          <Image
            src="/kevin-mercer.png"
            alt=""
            width={160}
            height={160}
            unoptimized
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        </>
      ) : (
        agent.initials
      )}
    </span>
  );
}

export function AgentStrip() {
  return (
    <div className="team-agent-strip" aria-label="Discussion participants">
      {teamAgents.map((agent) => (
        <div className="team-agent-identity" key={agent.id}>
          <AgentAvatar agentId={agent.id} size="small" />
          <span>
            <b>{agent.name}</b>
            <small>{agent.role}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyConversation() {
  return (
    <p className="team-empty-conversation">
      No messages yet. Ask the team a question to start a discussion.
    </p>
  );
}

export function MessageCard({
  message,
  saved,
  onToggleSave,
  onReply,
  replyContext,
  compact = false,
  researchStatus,
  onApproveDeeperResearch,
  onDeclineDeeperResearch,
  showResearchOffer = true,
  live = false,
  researchBusy = false,
}: {
  message: TeamDiscussionMessage;
  saved: boolean;
  onToggleSave: () => void;
  onReply: () => void;
  replyContext: string;
  compact?: boolean;
  researchStatus?: DeeperResearchStatus;
  onApproveDeeperResearch?: (message: TeamDiscussionMessage) => void;
  onDeclineDeeperResearch?: () => void;
  showResearchOffer?: boolean;
  live?: boolean;
  researchBusy?: boolean;
}) {
  const avatar = (
    <AgentAvatar agentId={message.author} size={compact ? "small" : "normal"} />
  );
  return (
    <article
      className={`team-message ${message.author === "kevin" ? "is-kevin" : `is-agent team-message-${message.author}`} ${compact ? "is-compact" : ""}`}
      data-message-id={message.id}
      data-reply-context={replyContext}
    >
      {message.author !== "kevin" && avatar}
      <div className="team-message-content">
        <header className="team-message-heading">
          <b>{authorName(message.author)}</b>
          {message.author === "kevin" && message.id === message.threadId && (
            <span className="team-question-tag">Question</span>
          )}
          {message.author !== "kevin" && (
            <span className="team-agent-tag">
              {message.provider && message.provider !== "mock"
                ? message.evidenceState === "research_gap"
                  ? "Research gap"
                  : "Supplied-source analysis"
                : "Mock perspective"}
            </span>
          )}
        </header>
        <span className="team-message-context">{replyContext}</span>
        <div className="team-message-bubble">
          {message.findings?.length ? (
            <div className="team-message-findings">
              {message.findings.map((finding, index) => (
                <section key={`${finding.title}-${index}`}>
                  <b>{finding.title}</b>
                  <p className="team-message-text">{finding.text}</p>
                  {finding.citations.length ? (
                    <details className="team-message-sources">
                      <summary>Sources ({finding.citations.length})</summary>
                      {finding.citations.map((citation, citationIndex) => (
                        <p key={`${citation.source}-${citationIndex}`}>
                          <b>
                            {citation.source}
                            {citation.locator ? ` · ${citation.locator}` : ""}
                          </b>
                          <br />
                          {citation.excerpt}
                        </p>
                      ))}
                    </details>
                  ) : (
                    <small className="team-message-gap">
                      Research gap · No supporting source found in the supplied
                      brief.
                    </small>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="team-message-text">{message.text}</p>
          )}
        </div>
        {message.offersDeeperResearch &&
          showResearchOffer &&
          researchStatus && (
            <div
              className={`team-research-offer is-${researchStatus}`}
              aria-label="Optional deeper research proposal"
            >
              <div className="team-research-offer-heading">
                <Search size={14} />
                <span>
                  OPTIONAL DEEPER LOOK · {live ? "SUPPLIED BRIEF" : "MOCK"}
                </span>
              </div>
              <p>
                {live
                  ? "Want the Consumer Agent to examine this question more deeply using the supplied brief?"
                  : "Want me to look for mover-specific evidence before we treat this as a spending driver?"}
              </p>
              {researchStatus === "offered" && (
                <>
                  <small>
                    {live
                      ? "Approval starts another validated AI analysis of supplied sources. It does not search external sources."
                      : "Approval only simulates a follow-up here. No research sources or AI models will be queried."}
                  </small>
                  <div className="team-research-actions">
                    <button
                      type="button"
                      className="team-research-approve"
                      onClick={() => onApproveDeeperResearch?.(message)}
                      disabled={researchBusy}
                    >
                      <Check size={13} />
                      Approve deeper look
                    </button>
                    <button
                      type="button"
                      className="team-research-decline"
                      onClick={onDeclineDeeperResearch}
                    >
                      <X size={13} />
                      Not now
                    </button>
                  </div>
                </>
              )}
              {researchStatus === "declined" && (
                <p className="team-research-outcome" role="status">
                  Not now — no research was started.
                </p>
              )}
              {researchStatus === "generating" && (
                <p className="team-research-outcome" role="status">
                  {live
                    ? "Approved · analyzing the supplied brief…"
                    : "Approved · preparing the illustrative mock follow-up…"}
                </p>
              )}
              {researchStatus === "completed" && (
                <p className="team-research-outcome" role="status">
                  {live
                    ? "Follow-up added below. Review its source citations and gaps."
                    : "Mock follow-up added below. No sources were queried; this is not verified research."}
                </p>
              )}
              {researchStatus === "failed" && (
                <p className="team-research-outcome" role="alert">
                  The deeper look failed. Retry the failed agent below.
                </p>
              )}
            </div>
          )}
        <footer className="team-message-actions">
          {message.author !== "kevin" && (
            <button
              className={`team-action ${saved ? "is-saved" : ""}`}
              aria-label={`${saved ? "Unsave" : "Save"} insight from ${authorName(message.author)}`}
              aria-pressed={saved}
              onClick={onToggleSave}
            >
              <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
              {saved ? "Saved" : "Save insight"}
            </button>
          )}
          <button
            className="team-action"
            aria-label={`Reply to ${authorName(message.author)}`}
            onClick={onReply}
          >
            <MessageSquareReply size={14} />
            Reply
          </button>
        </footer>
      </div>
      {message.author === "kevin" && avatar}
    </article>
  );
}

function mentionAt(value: string, caret: number) {
  const at = value.lastIndexOf("@", caret - 1);
  if (at < 0) return null;
  const query = value.slice(at + 1, caret);
  if (/\s/.test(query)) return null;
  return { start: at, end: caret, query };
}

export function MessageComposer({
  composerId,
  draft,
  onDraftChange,
  onSend,
  replyTarget,
  onClearReply,
  failNext,
  onFailNextChange,
  disabled,
  live = false,
  canSend = true,
}: {
  composerId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  replyTarget: TeamDiscussionMessage | null;
  onClearReply: () => void;
  failNext: boolean;
  onFailNextChange: (value: boolean) => void;
  disabled: boolean;
  live?: boolean;
  canSend?: boolean;
}) {
  const [mention, setMention] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const candidates = mention
    ? teamAgents.filter((agent) =>
        agent.mention.toLowerCase().startsWith(mention.query.toLowerCase()),
      )
    : [];

  function change(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value;
    onDraftChange(value);
    setMention(mentionAt(value, event.currentTarget.selectionStart));
  }

  function selectMention(name: string) {
    if (!mention) return;
    const next =
      draft.slice(0, mention.start) + `@${name} ` + draft.slice(mention.end);
    onDraftChange(next);
    setMention(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.trim() && !disabled) onSend(draft.trim());
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
    if (event.key === "Escape") setMention(null);
  }

  return (
    <form className="team-composer" onSubmit={submit}>
      {replyTarget && (
        <div className="team-replying">
          <span>
            Replying to <b>{authorName(replyTarget.author)}</b>
          </span>
          <button
            type="button"
            onClick={onClearReply}
            aria-label="Cancel reply"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="team-composer-input">
        <AgentAvatar agentId="kevin" size="small" />
        <div className="team-composer-field">
          <label className="sr-only" htmlFor={composerId}>
            Message the team
          </label>
          <textarea
            id={composerId}
            value={draft}
            onChange={change}
            onKeyDown={keyDown}
            placeholder="Ask the whole team or type @ to direct a question..."
            rows={3}
          />
          {mention && candidates.length > 0 && (
            <div
              className="team-mention-menu"
              role="listbox"
              aria-label="Mention an agent"
            >
              {candidates.map((agent) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={agent.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectMention(agent.mention)}
                >
                  <AgentAvatar agentId={agent.id} size="small" />
                  <span>
                    <b>{agent.mention}</b>
                    <small>{agent.name}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="team-composer-actions">
            {!live && (
              <label className="team-fail-toggle">
                <input
                  type="checkbox"
                  checked={failNext}
                  onChange={(event) =>
                    onFailNextChange(event.currentTarget.checked)
                  }
                />
                Simulate next response failure
              </label>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={!draft.trim() || disabled || !canSend}
            >
              <Send size={14} />
              Send to team
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

export function SavedInsightsPanel({
  messages,
  savedIds,
  onToggleSave,
  onReply,
  compact = false,
  live = false,
}: {
  messages: TeamDiscussionMessage[];
  savedIds: Set<string>;
  onToggleSave: (messageId: string) => void;
  onReply: (message: TeamDiscussionMessage) => void;
  compact?: boolean;
  live?: boolean;
}) {
  const saved = messages.filter((message) => savedIds.has(message.id));
  const byId = new Map(messages.map((message) => [message.id, message]));
  return (
    <aside className={`team-saved-panel ${compact ? "is-compact" : ""}`}>
      <header>
        <span className="eyebrow">PRIVATE TO THIS PROTOTYPE</span>
        <h3>Saved strategic considerations</h3>
        <p>
          {saved.length} saved {live ? "brief" : "mock"}{" "}
          {saved.length === 1 ? "response" : "responses"}
        </p>
      </header>
      {saved.length ? (
        <div className="team-saved-list">
          {saved.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              saved
              compact
              replyContext={getReplyContext(message, byId)}
              onToggleSave={() => onToggleSave(message.id)}
              onReply={() => onReply(message)}
              showResearchOffer={false}
              live={live}
            />
          ))}
        </div>
      ) : (
        <p className="team-empty-saved">
          Save an agent response to keep it in view here. Review its sources
          before using it in strategy.
        </p>
      )}
    </aside>
  );
}

export function getReplyContext(
  message: TeamDiscussionMessage,
  messagesById: Map<string, TeamDiscussionMessage>,
) {
  if (message.replyToGroup) return "Replying to Group";
  const referenced = message.replyTo
    ? messagesById.get(message.replyTo)
    : undefined;
  const addressedTo = message.addressedTo?.map((id) => `@${authorName(id)}`);
  const addressLabel = addressedTo?.length
    ? ` · ${addressedTo.join(", ")}`
    : "";
  if (referenced)
    return `Replying to ${authorName(referenced.author)}${addressLabel}`;
  if (addressedTo?.length) return `To ${addressedTo.join(", ")}`;
  return "Replying to Group";
}

export function GenerationStatus({
  status,
  onRetry,
  live = false,
  error,
}: {
  status: TeamDiscussionProps["status"];
  onRetry: () => void;
  live?: boolean;
  error?: string;
}) {
  if (status === "idle") return null;
  return (
    <div
      className={`team-generation-status is-${status}`}
      role={status === "failed" ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="team-status-dot" />
      <span>
        {status === "generating" &&
          (live
            ? "Agents are researching the supplied brief…"
            : "Mock agents are considering the question…")}
        {status === "completed" &&
          (live ? "Brief analysis complete" : "Mock responses complete")}
        {status === "failed" &&
          (error ||
            (live
              ? "Some agents could not complete the brief analysis. Successful replies are preserved."
              : "Mock response failed. Your question is still here."))}
      </span>
      {status === "failed" && (
        <button type="button" className="team-action" onClick={onRetry}>
          {live ? "Retry failed agents" : "Retry mock response"}
        </button>
      )}
    </div>
  );
}
