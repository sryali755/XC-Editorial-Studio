"use client";

import { useState } from "react";
import { Bookmark, ChevronDown, ChevronRight } from "lucide-react";
import {
  GenerationStatus,
  EmptyConversation,
  MessageCard,
  MessageComposer,
  SavedInsightsPanel,
  getReplyContext,
  type TeamDiscussionProps,
} from "./team-discussion-types";

export default function ThreadedDiscussionPrototype(
  props: TeamDiscussionProps,
) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showSaved, setShowSaved] = useState(false);
  const byId = new Map(props.messages.map((message) => [message.id, message]));
  const questions = props.messages.filter(
    (message) => message.id === message.threadId,
  );
  return (
    <section
      className="team-prototype team-threaded"
      data-team-prototype="threaded-discussion"
    >
      <header className="team-prototype-header">
        <div>
          <span className="eyebrow">EXPERIMENTAL · OPTION B</span>
          <h2>Threaded Discussion</h2>
          <p>
            Give each strategic question its own expandable discussion topic.
          </p>
        </div>
        <button
          className={`team-secondary-button ${showSaved ? "is-active" : ""}`}
          onClick={() => setShowSaved((value) => !value)}
          aria-expanded={showSaved}
        >
          <Bookmark size={14} />
          Saved insights ({props.savedIds.size})
        </button>
      </header>
      <div className={`team-threaded-grid ${showSaved ? "has-saved" : ""}`}>
        <div className="team-topics">
          {!questions.length && <EmptyConversation />}
          {questions.map((question) => {
            const replies = props.messages.filter(
              (message) =>
                message.threadId === question.threadId &&
                message.id !== question.id,
            );
            const isCollapsed = collapsed.has(question.id);
            const related = question.relatedTo
              ? byId.get(question.relatedTo)
              : undefined;
            return (
              <article className="team-topic" key={question.id}>
                <header className="team-topic-header">
                  <button
                    className="team-thread-toggle"
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} discussion: ${question.text}`}
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(question.id)) next.delete(question.id);
                        else next.add(question.id);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? (
                      <ChevronRight size={17} />
                    ) : (
                      <ChevronDown size={17} />
                    )}
                  </button>
                  <div className="team-topic-title">
                    <span className="team-topic-label">STRATEGIC QUESTION</span>
                    <h3>{question.text}</h3>
                    {related && (
                      <p className="team-topic-related">
                        Follow-up topic connected to: “{related.text}”
                      </p>
                    )}
                  </div>
                  <span className="team-topic-count">
                    {replies.length}{" "}
                    {replies.length === 1 ? "reply" : "replies"}
                  </span>
                </header>
                {!isCollapsed && (
                  <div className="team-topic-replies">
                    <MessageCard
                      message={question}
                      saved={false}
                      replyContext={getReplyContext(question, byId)}
                      onToggleSave={() => undefined}
                      onReply={() => props.onReply(question)}
                      researchStatus={props.deeperResearchStatus}
                      onApproveDeeperResearch={props.onApproveDeeperResearch}
                      onDeclineDeeperResearch={props.onDeclineDeeperResearch}
                    />
                    {replies.map((message) => (
                      <div className="team-topic-reply" key={message.id}>
                        <MessageCard
                          message={message}
                          replyContext={getReplyContext(message, byId)}
                          saved={props.savedIds.has(message.id)}
                          onToggleSave={() => props.onToggleSave(message.id)}
                          onReply={() => props.onReply(message)}
                          researchStatus={props.deeperResearchStatus}
                          onApproveDeeperResearch={
                            props.onApproveDeeperResearch
                          }
                          onDeclineDeeperResearch={
                            props.onDeclineDeeperResearch
                          }
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          <GenerationStatus status={props.status} onRetry={props.onRetry} />
          {props.status === "generating" && (
            <p className="team-thread-generation">
              New question and agent perspectives will appear as a topic when
              ready.
            </p>
          )}
        </div>
        {showSaved && (
          <SavedInsightsPanel
            messages={props.messages}
            savedIds={props.savedIds}
            onToggleSave={props.onToggleSave}
            onReply={props.onReply}
          />
        )}
      </div>
      <MessageComposer
        composerId="team-discussion-threaded-message"
        draft={props.draft}
        onDraftChange={props.onDraftChange}
        onSend={props.onSend}
        replyTarget={props.replyTarget}
        onClearReply={props.onClearReply}
        failNext={props.failNext}
        onFailNextChange={props.onFailNextChange}
        disabled={props.status === "generating"}
      />
    </section>
  );
}
