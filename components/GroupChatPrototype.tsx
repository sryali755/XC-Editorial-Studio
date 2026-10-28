"use client";

import { useState } from "react";
import { Bookmark, Users } from "lucide-react";
import {
  GenerationStatus,
  MessageCard,
  MessageComposer,
  SavedInsightsPanel,
  EmptyConversation,
  authorName,
  getReplyContext,
  type TeamDiscussionProps,
} from "./team-discussion-types";

export default function GroupChatPrototype(props: TeamDiscussionProps) {
  const [showSaved, setShowSaved] = useState(false);
  const byId = new Map(props.messages.map((message) => [message.id, message]));
  return (
    <section
      className="team-prototype team-group-chat"
      data-team-prototype="group-chat"
    >
      <header className="team-prototype-header">
        <div>
          <span className="eyebrow">EXPERIMENTAL · OPTION A</span>
          <h2>Group Chat</h2>
          <p>
            A shared team conversation with direct replies and saveable
            insights.
          </p>
        </div>
        <div className="team-header-actions">
          <span className="team-participant-count">
            <Users size={15} /> Kevin + 5 agents
          </span>
          <button
            className={`team-secondary-button ${showSaved ? "is-active" : ""}`}
            onClick={() => setShowSaved((value) => !value)}
            aria-expanded={showSaved}
          >
            <Bookmark size={14} />
            Saved insights ({props.savedIds.size})
          </button>
        </div>
      </header>
      <div className={`team-group-grid ${showSaved ? "has-saved" : ""}`}>
        <div className="team-chat-column">
          <div className="team-chat-feed" aria-label="Shared conversation">
            {!props.messages.length && <EmptyConversation />}
            {props.messages.map((message) => (
              <div key={message.id} className="team-feed-item">
                {message.relatedTo && (
                  <div className="team-related-note">
                    Follow-up to{" "}
                    <b>
                      {authorName(
                        byId.get(message.relatedTo)?.author ?? "kevin",
                      )}
                      &apos;s question
                    </b>
                  </div>
                )}
                <MessageCard
                  message={message}
                  replyContext={getReplyContext(message, byId)}
                  saved={props.savedIds.has(message.id)}
                  onToggleSave={() => props.onToggleSave(message.id)}
                  onReply={() => props.onReply(message)}
                  researchStatus={props.deeperResearchStatus}
                  onApproveDeeperResearch={props.onApproveDeeperResearch}
                  onDeclineDeeperResearch={props.onDeclineDeeperResearch}
                  live={props.live}
                  researchBusy={props.status === "generating"}
                />
              </div>
            ))}
            <GenerationStatus
              status={props.status}
              onRetry={props.onRetry}
              live={props.live}
              error={props.error}
            />
          </div>
          <MessageComposer
            composerId="team-discussion-group-message"
            draft={props.draft}
            onDraftChange={props.onDraftChange}
            onSend={props.onSend}
            replyTarget={props.replyTarget}
            onClearReply={props.onClearReply}
            failNext={props.failNext}
            onFailNextChange={props.onFailNextChange}
            disabled={props.status === "generating"}
            live={props.live}
            canSend={props.canSend}
          />
        </div>
        {showSaved && (
          <SavedInsightsPanel
            messages={props.messages}
            savedIds={props.savedIds}
            onToggleSave={props.onToggleSave}
            onReply={props.onReply}
            live={props.live}
          />
        )}
      </div>
    </section>
  );
}
