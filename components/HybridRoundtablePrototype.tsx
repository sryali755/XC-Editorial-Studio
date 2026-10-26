"use client";

import {
  GenerationStatus,
  AgentStrip,
  MessageCard,
  MessageComposer,
  SavedInsightsPanel,
  getReplyContext,
  type TeamDiscussionProps,
} from "./team-discussion-types";

export default function HybridRoundtablePrototype(props: TeamDiscussionProps) {
  const byId = new Map(props.messages.map((message) => [message.id, message]));
  return (
    <section
      className="team-prototype team-hybrid"
      data-team-prototype="hybrid-roundtable"
    >
      <header className="team-prototype-header">
        <div>
          <span className="eyebrow">EXPERIMENTAL · OPTION C</span>
          <h2>Hybrid Roundtable</h2>
          <p>
            Keep the team, shared conversation, and saved considerations
            together.
          </p>
        </div>
        <span className="team-participant-count">Kevin + 5 agents</span>
      </header>
      <AgentStrip />
      <div className="team-hybrid-grid">
        <div className="team-hybrid-conversation">
          <div
            className="team-chat-feed"
            aria-label="Shared roundtable discussion"
          >
            {props.messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                replyContext={getReplyContext(message, byId)}
                saved={props.savedIds.has(message.id)}
                onToggleSave={() => props.onToggleSave(message.id)}
                onReply={() => props.onReply(message)}
                researchStatus={props.deeperResearchStatus}
                onApproveDeeperResearch={props.onApproveDeeperResearch}
                onDeclineDeeperResearch={props.onDeclineDeeperResearch}
              />
            ))}
            <GenerationStatus status={props.status} onRetry={props.onRetry} />
          </div>
          <MessageComposer
            draft={props.draft}
            onDraftChange={props.onDraftChange}
            onSend={props.onSend}
            replyTarget={props.replyTarget}
            onClearReply={props.onClearReply}
            failNext={props.failNext}
            onFailNextChange={props.onFailNextChange}
            disabled={props.status === "generating"}
          />
        </div>
        <SavedInsightsPanel
          messages={props.messages}
          savedIds={props.savedIds}
          onToggleSave={props.onToggleSave}
          onReply={props.onReply}
          compact
        />
      </div>
    </section>
  );
}
