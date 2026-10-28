"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Reply,
  Search,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  discoveryFindingRef,
  generateDiscoveryVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import type {
  DiscoveryAction,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryRunVersion,
  DiscoveryState,
  StrategyInputPack,
} from "@/lib/types";
import styles from "./TeamChatV2.module.css";

// Group Chat v2 (test): the Meeting 3 redesign running beside the original
// Team Discussion. One answer per agent per question, agents see each other's
// answers, and saved answers join the same saved-insight list as the
// Individual Round Table.

const agents: {
  id: DiscoveryLensId;
  name: string;
  mention: string;
  lens: string;
  initials: string;
}[] = [
  {
    id: "consumer",
    name: "Consumer Agent",
    mention: "Consumer",
    lens: "Needs & behavior",
    initials: "CO",
  },
  {
    id: "culture",
    name: "Culture Agent",
    mention: "Culture",
    lens: "Culture & context",
    initials: "CU",
  },
  {
    id: "category",
    name: "Category Agent",
    mention: "Category",
    lens: "Category dynamics",
    initials: "CA",
  },
  {
    id: "brand",
    name: "Brand Agent",
    mention: "Brand",
    lens: "Brand & proof",
    initials: "BR",
  },
  {
    id: "analogous",
    name: "Analogous Solutions Agent",
    mention: "Analogous",
    lens: "Other categories",
    initials: "AN",
  },
];
const agentById = new Map(agents.map((agent) => [agent.id, agent]));

type AgentCall = {
  action: DiscoveryAction;
  guidance: string;
  selectedFinding?: DiscoveryFinding;
  routedFromLens?: DiscoveryLensId;
};
type Take = { version: DiscoveryRunVersion; finding: DiscoveryFinding };
type KevinMessage = {
  kind: "kevin";
  id: string;
  text: string;
  to: DiscoveryLensId[];
  replyTo?: string;
};
type AgentMessage = {
  kind: "agent";
  id: string;
  lensId: DiscoveryLensId;
  question: string;
  replyTo: string;
  respondsTo?: string;
  call: AgentCall;
  takes: Take[];
  active: number;
  status: "waiting" | "thinking" | "done" | "failed";
  lastAttempt: "answer" | "regenerate";
  error?: string;
};
type ChatMessage = KevinMessage | AgentMessage;
type AIMode = "checking" | "live" | "mock" | "unavailable";

function clip(value: string | undefined, fallback: string, limit: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

// Fixed templates filled from the Input Pack. No model call is involved.
function starterQuestions(pack: StrategyInputPack) {
  const objective = clip(pack.objective, "the campaign objective", 110);
  const audience = clip(pack.audience, "the intended audience", 100);
  const product = clip(pack.product, "the product", 80);
  const channel = clip(pack.channel, "the planned channel", 80);
  return [
    `What does the brief support about the objective to ${objective}, and what still needs evidence?`,
    `What needs or barriers might matter to ${audience}, and which are documented versus assumptions?`,
    `Which benefits of ${product} have support in the brief, and which claims need proof or approval?`,
    `What alternatives to adopting ${product} should we investigate, including doing nothing?`,
    `How could ${channel} address this audience within the brief's constraints, and what should we validate first?`,
  ];
}

// "@Category what do you think of @Consumer's answer?" → Category responds to
// Consumer. A possessive mention marks the agent being responded to.
function parseMentions(text: string) {
  const responders: DiscoveryLensId[] = [];
  const referenced: DiscoveryLensId[] = [];
  for (const match of text.matchAll(
    /@(consumer|culture|category|brand|analogous)\b(['’]s)?/gi,
  )) {
    const id = match[1].toLowerCase() as DiscoveryLensId;
    const list = match[2] ? referenced : responders;
    if (!list.includes(id)) list.push(id);
  }
  return {
    responders: responders.filter((id) => !referenced.includes(id)),
    referenced,
  };
}

export default function TeamChatV2({
  pack,
  state,
  onToggleSave,
}: {
  pack: StrategyInputPack;
  state: DiscoveryState;
  onToggleSave: (
    version: DiscoveryRunVersion,
    finding: DiscoveryFinding,
  ) => void;
}) {
  const [mode, setMode] = useState<AIMode>("checking");
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<AgentMessage | null>(null);
  const [deeperFor, setDeeperFor] = useState<string | null>(null);
  const [deeperFocus, setDeeperFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedView, setSavedView] = useState<"chat" | "individual">("chat");
  const controller = useRef<AbortController | null>(null);
  const versionCounter = useRef<Partial<Record<DiscoveryLensId, number>>>({});
  const composer = useRef<HTMLTextAreaElement>(null);

  const hasInputPack = Boolean(pack.parsedIMC?.sourceText.trim());
  const questions = useMemo(() => starterQuestions(pack), [pack]);

  useEffect(() => {
    const request = new AbortController();
    fetch("/api/ai/agent", { signal: request.signal, cache: "no-store" })
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
        if (!request.signal.aborted) setMode("unavailable");
      });
    return () => request.abort();
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  // The ref mirrors state so the sequential agent loop always reads the
  // latest answers when it builds each agent's peer context.
  function setMessages(change: (current: ChatMessage[]) => ChatMessage[]) {
    messagesRef.current = change(messagesRef.current);
    setMessagesState(messagesRef.current);
  }
  function patchAgent(id: string, change: Partial<AgentMessage>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.kind === "agent"
          ? { ...message, ...change }
          : message,
      ),
    );
  }
  function findAgent(id: string) {
    const message = messagesRef.current.find((item) => item.id === id);
    return message?.kind === "agent" ? message : undefined;
  }

  function peerFindings(lensId: DiscoveryLensId) {
    return messagesRef.current
      .flatMap((message) =>
        message.kind === "agent" &&
        message.lensId !== lensId &&
        message.takes[message.active]
          ? [message.takes[message.active].finding]
          : [],
      )
      .reverse()
      .slice(0, 20);
  }

  async function runOne(id: string, attempt: "answer" | "regenerate") {
    const message = findAgent(id);
    if (!message || !controller.current) return;
    const signal = controller.current.signal;
    patchAgent(id, {
      status: "thinking",
      lastAttempt: attempt,
      error: undefined,
    });
    const number = (versionCounter.current[message.lensId] ?? 0) + 1;
    versionCounter.current[message.lensId] = number;
    const regenerate = attempt === "regenerate";
    try {
      const version = await generateDiscoveryVersion({
        lensId: message.lensId,
        pack,
        question: message.question,
        investigationType: "problem",
        action: regenerate ? "another_answer" : message.call.action,
        guidance: message.call.guidance,
        previous: regenerate ? message.takes.map((take) => take.version) : [],
        ...(regenerate || !message.call.selectedFinding
          ? {}
          : { selectedFinding: message.call.selectedFinding }),
        ...(!regenerate && message.call.routedFromLens
          ? { routedFromLens: message.call.routedFromLens }
          : {}),
        peerFindings: peerFindings(message.lensId),
        nextVersionNumber: number,
        signal,
      });
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const finding = version.findings[0];
      if (!finding) throw new Error("The agent returned no validated answer.");
      // One question, one answer: keep only the visible first finding. The
      // pack snapshot is dropped because saved chat versions are stored
      // outside run history, where snapshots are not re-expanded.
      const stored: DiscoveryRunVersion = {
        ...version,
        findings: [finding],
        inputPackSnapshot: undefined,
      };
      const current = findAgent(id);
      const takes = [...(current?.takes ?? []), { version: stored, finding }];
      patchAgent(id, { takes, active: takes.length - 1, status: "done" });
    } catch (failure) {
      patchAgent(id, {
        status: "failed",
        error: signal.aborted
          ? "Stopped before this agent answered."
          : failure instanceof Error
            ? failure.message
            : "The agent could not answer.",
      });
    }
  }

  async function runBatch(
    jobs: { id: string; attempt: "answer" | "regenerate" }[],
  ) {
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    // Sequential on purpose: each agent sees the answers given before it.
    for (const job of jobs) {
      if (controller.current.signal.aborted) {
        patchAgent(job.id, {
          status: "failed",
          error: "Stopped before this agent answered.",
        });
        continue;
      }
      await runOne(job.id, job.attempt);
    }
    setBusy(false);
  }

  function agentMessage(
    lensId: DiscoveryLensId,
    question: string,
    replyTo: string,
    call: AgentCall,
    respondsTo?: string,
  ): AgentMessage {
    return {
      kind: "agent",
      id: `agent-${crypto.randomUUID()}`,
      lensId,
      question,
      replyTo,
      ...(respondsTo ? { respondsTo } : {}),
      call,
      takes: [],
      active: 0,
      status: "waiting",
      lastAttempt: "answer",
    };
  }

  function latestAnswer(lensId: DiscoveryLensId) {
    return [...messagesRef.current]
      .reverse()
      .find(
        (message): message is AgentMessage =>
          message.kind === "agent" &&
          message.lensId === lensId &&
          Boolean(message.takes[message.active]),
      );
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    const kevinId = `kevin-${crypto.randomUUID()}`;
    const { responders, referenced } = parseMentions(text);
    const target = replyTarget;
    const replies: AgentMessage[] = [];
    const respondTo = (subject: AgentMessage, lensIds: DiscoveryLensId[]) => {
      const finding = subject.takes[subject.active]?.finding;
      for (const lensId of lensIds)
        replies.push(
          agentMessage(
            lensId,
            subject.question,
            kevinId,
            lensId === subject.lensId || !finding
              ? {
                  action: "explore_deeper",
                  guidance: text,
                  ...(finding ? { selectedFinding: finding } : {}),
                }
              : {
                  action: "ask_another_lens",
                  guidance: text,
                  selectedFinding: finding,
                  routedFromLens: subject.lensId,
                },
            subject.id,
          ),
        );
    };
    const subject =
      target ?? (referenced.length ? latestAnswer(referenced[0]) : undefined);
    if (subject) {
      const others = responders.filter((id) => id !== subject.lensId);
      respondTo(subject, others.length ? others : [subject.lensId]);
    } else {
      const to = responders.length
        ? responders
        : agents.map((agent) => agent.id);
      for (const lensId of to)
        replies.push(
          agentMessage(lensId, text, kevinId, {
            action: "explore_deeper",
            guidance: text,
          }),
        );
    }
    const kevin: KevinMessage = {
      kind: "kevin",
      id: kevinId,
      text,
      to: replies.map((reply) => reply.lensId),
      ...(subject ? { replyTo: subject.id } : {}),
    };
    setMessages((current) => [...current, kevin, ...replies]);
    setDraft("");
    setReplyTarget(null);
    void runBatch(
      replies.map((reply) => ({ id: reply.id, attempt: "answer" })),
    );
  }

  function digDeeper(subject: AgentMessage) {
    const finding = subject.takes[subject.active]?.finding;
    if (!finding || busy) return;
    const focus = deeperFocus.trim();
    const kevinId = `kevin-${crypto.randomUUID()}`;
    const guidance =
      focus || "Investigate this answer more deeply using the supplied brief.";
    const reply = agentMessage(
      subject.lensId,
      subject.question,
      kevinId,
      { action: "explore_deeper", guidance, selectedFinding: finding },
      subject.id,
    );
    setMessages((current) => [
      ...current,
      {
        kind: "kevin",
        id: kevinId,
        text: focus
          ? `Dig deeper: ${focus}`
          : "Dig deeper on this answer using the supplied brief.",
        to: [subject.lensId],
        replyTo: subject.id,
      },
      reply,
    ]);
    setDeeperFor(null);
    setDeeperFocus("");
    void runBatch([{ id: reply.id, attempt: "answer" }]);
  }

  function insertMention(mention: string) {
    setDraft(
      (current) =>
        `${current}${current && !current.endsWith(" ") ? " " : ""}@${mention} `,
    );
    composer.current?.focus();
  }

  function clearChat() {
    if (
      messages.length &&
      !window.confirm(
        "Clear this conversation? Saved insights stay in your Input Pack.",
      )
    )
      return;
    controller.current?.abort();
    setMessages(() => []);
    setReplyTarget(null);
    setDeeperFor(null);
  }

  // Saved insights: one list shared with the Individual Round Table, split by
  // where each insight was saved.
  const known = useMemo(() => knownDiscoveryFindings(state), [state]);
  const chatRefs = useMemo(
    () =>
      new Set(
        (state.teamChatVersions ?? []).flatMap((version) =>
          version.findings.map(discoveryFindingRef),
        ),
      ),
    [state.teamChatVersions],
  );
  const savedRefs = new Set(state.savedFindingIds);
  const savedFindings = useMemo(() => {
    const seen = new Set<string>();
    return state.savedFindingIds.flatMap((id) => {
      const finding = known.get(id);
      if (!finding) return [];
      const ref = discoveryFindingRef(finding);
      if (seen.has(ref)) return [];
      seen.add(ref);
      return [finding];
    });
  }, [known, state.savedFindingIds]);
  const savedFromChat = savedFindings.filter((finding) =>
    chatRefs.has(discoveryFindingRef(finding)),
  );
  const savedFromIndividual = savedFindings.filter(
    (finding) => !chatRefs.has(discoveryFindingRef(finding)),
  );
  const chatTakeByRef = new Map<string, Take>();
  for (const message of messages)
    if (message.kind === "agent")
      for (const take of message.takes)
        chatTakeByRef.set(discoveryFindingRef(take.finding), take);

  // "Answer k of N" counts every answer an agent has given in this chat.
  const answerIndex = new Map<string, { index: number; total: number }>();
  for (const agent of agents) {
    const keys = messages.flatMap((message) =>
      message.kind === "agent" && message.lensId === agent.id
        ? message.takes.map((_, take) => `${message.id}:${take}`)
        : [],
    );
    keys.forEach((key, index) =>
      answerIndex.set(key, { index: index + 1, total: keys.length }),
    );
  }

  const byId = new Map(messages.map((message) => [message.id, message]));
  const working = messages.filter(
    (message): message is AgentMessage =>
      message.kind === "agent" &&
      (message.status === "waiting" || message.status === "thinking"),
  );
  const canSend = hasInputPack && (mode === "live" || mode === "mock") && !busy;

  function subjectLine(id: string | undefined) {
    const subject = id ? byId.get(id) : undefined;
    if (subject?.kind !== "agent") return null;
    const agent = agentById.get(subject.lensId)!;
    const title = subject.takes[subject.active]?.finding.title;
    return (
      <div className={styles.quote} data-agent={subject.lensId}>
        <Reply size={14} aria-hidden="true" />
        <span>
          <b>Replying to {agent.name}</b>
          {title ? ` · ${title}` : ""}
        </span>
      </div>
    );
  }

  return (
    <section className={styles.root} aria-label="Group Chat (test version)">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            TEAM DISCUSSION · NEW DESIGN · TEST
          </span>
          <h2 className={styles.title}>Group Chat</h2>
          <p className={styles.lede}>
            Ask once. Each of the five agents answers once, from its own point
            of view, after reading the answers before it.
          </p>
        </div>
        <span className={styles.badge} data-mode={mode}>
          {mode === "live"
            ? "LIVE"
            : mode === "mock"
              ? "MOCK RESPONSES"
              : mode === "checking"
                ? "CHECKING AI"
                : "AI UNAVAILABLE"}
        </span>
      </header>

      {!hasInputPack && (
        <p role="alert" className={styles.alert}>
          Add an IMC brief in Input Pack before asking the team.
        </p>
      )}
      {mode === "unavailable" && (
        <p role="alert" className={styles.alert}>
          The AI service is unavailable. Check the server configuration and
          retry.
        </p>
      )}

      {hasInputPack && (
        <section className={styles.panel} aria-label="Starter questions">
          <div className={styles.panelHead}>
            <b>Five questions Kevin can ask the team</b>
            <small>
              Built from your Input Pack: objective, audience, product and
              channel.
            </small>
          </div>
          <div className={styles.starters}>
            {questions.map((question, index) => (
              <button
                key={index}
                type="button"
                className={styles.starter}
                aria-pressed={draft === question}
                disabled={!canSend}
                onClick={() => {
                  setDraft(question);
                  composer.current?.focus();
                }}
              >
                {index + 1}. {question}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={styles.layout}>
        <section className={styles.chat} aria-label="Group chat">
          <div className={styles.chatHead}>
            <b>Group chat</b>
            <span>Kevin Mercer + 5 agents</span>
            <button
              type="button"
              className={styles.textButton}
              onClick={clearChat}
              disabled={!messages.length}
            >
              Clear conversation
            </button>
          </div>

          <div className={styles.thread} aria-live="polite">
            {!messages.length && (
              <p className={styles.empty}>
                Pick a starter question or type your own. With no @mention, all
                five agents answer once.
              </p>
            )}
            {messages.map((message) => {
              if (message.kind === "kevin")
                return (
                  <div key={message.id} className={styles.kevinRow}>
                    <div className={styles.kevinCol}>
                      <span className={styles.meta}>
                        Kevin Mercer ·{" "}
                        {message.to.length === agents.length
                          ? "to all five agents"
                          : `to ${message.to.map((id) => agentById.get(id)!.mention).join(", ")}`}
                      </span>
                      <p className={styles.kevinBubble}>{message.text}</p>
                    </div>
                  </div>
                );
              const agent = agentById.get(message.lensId)!;
              const take = message.takes[message.active];
              const finding = take?.finding;
              const count = answerIndex.get(`${message.id}:${message.active}`);
              const saved = finding
                ? savedRefs.has(discoveryFindingRef(finding))
                : false;
              const canSave =
                mode === "live" &&
                take?.version.provider !== undefined &&
                take.version.provider !== "mock";
              const evidence = finding?.evidence[0];
              return (
                <div key={message.id} className={styles.agentRow}>
                  <span
                    className={styles.avatar}
                    data-agent={agent.id}
                    aria-hidden="true"
                  >
                    {agent.initials}
                  </span>
                  <article
                    className={styles.card}
                    aria-label={`${agent.name} answer`}
                  >
                    <div className={styles.cardHead}>
                      <b>{agent.name}</b>
                      <span className={styles.lens} data-agent={agent.id}>
                        {agent.lens}
                      </span>
                      {!message.respondsTo && (
                        <span className={styles.meta}>Replying to Kevin</span>
                      )}
                      {message.takes.length > 1 ? (
                        <span className={styles.pager}>
                          <button
                            type="button"
                            aria-label="Previous answer"
                            disabled={message.active === 0}
                            onClick={() =>
                              patchAgent(message.id, {
                                active: message.active - 1,
                              })
                            }
                          >
                            <ChevronLeft size={14} aria-hidden="true" />
                          </button>
                          <span>
                            Answer {count?.index} of {count?.total}
                          </span>
                          <button
                            type="button"
                            aria-label="Next answer"
                            disabled={
                              message.active === message.takes.length - 1
                            }
                            onClick={() =>
                              patchAgent(message.id, {
                                active: message.active + 1,
                              })
                            }
                          >
                            <ChevronRight size={14} aria-hidden="true" />
                          </button>
                        </span>
                      ) : count ? (
                        <span className={styles.count}>
                          Answer {count.index} of {count.total}
                        </span>
                      ) : null}
                    </div>
                    {message.respondsTo && subjectLine(message.respondsTo)}

                    {message.status === "waiting" && !finding && (
                      <p className={styles.status}>
                        Waiting for the agents before it…
                      </p>
                    )}
                    {message.status === "thinking" && (
                      <p className={styles.status} role="status">
                        <span className={styles.dots} aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        {finding ? "Thinking of another answer…" : "Thinking…"}
                      </p>
                    )}
                    {message.status === "failed" && (
                      <div className={styles.failed} role="alert">
                        <span>{message.error}</span>
                        <button
                          type="button"
                          className={styles.smallButton}
                          disabled={busy}
                          onClick={() =>
                            void runBatch([
                              { id: message.id, attempt: message.lastAttempt },
                            ])
                          }
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {finding && (
                      <>
                        <h3 className={styles.headline}>{finding.title}</h3>
                        <p className={styles.body}>{finding.whatWeFound}</p>
                        {finding.evidenceState === "research_gap" ? (
                          <div className={styles.gap}>
                            <span>RESEARCH GAP</span>
                            <p>{finding.questionToExplore}</p>
                          </div>
                        ) : evidence ? (
                          <div className={styles.source}>
                            <span>SOURCE · {evidence.source}</span>
                            <p>“{evidence.excerpt}”</p>
                          </div>
                        ) : null}
                        <details className={styles.more}>
                          <summary>Why it may matter</summary>
                          <p>{finding.whyItMayMatter}</p>
                          <p>
                            <b>What complicates it:</b>{" "}
                            {finding.whatComplicatesIt}
                          </p>
                          {finding.evidence.length > 1 && (
                            <ul>
                              {finding.evidence.slice(1).map((item, index) => (
                                <li key={index}>
                                  {item.source}: “{item.excerpt}”
                                </li>
                              ))}
                            </ul>
                          )}
                        </details>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            aria-pressed={saved}
                            className={saved ? styles.isSaved : undefined}
                            disabled={!saved && !canSave}
                            title={
                              !saved && !canSave
                                ? "Only live provider findings can be saved to campaign strategy."
                                : undefined
                            }
                            onClick={() => onToggleSave(take.version, finding)}
                          >
                            {saved ? (
                              <BookmarkCheck size={16} aria-hidden="true" />
                            ) : (
                              <Bookmark size={16} aria-hidden="true" />
                            )}
                            {saved ? "Saved" : "Save insight"}
                          </button>
                          <button
                            type="button"
                            aria-expanded={deeperFor === message.id}
                            disabled={busy}
                            onClick={() => {
                              setDeeperFor(
                                deeperFor === message.id ? null : message.id,
                              );
                              setDeeperFocus("");
                            }}
                          >
                            <Search size={16} aria-hidden="true" />
                            Dig deeper
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setReplyTarget(message);
                              composer.current?.focus();
                            }}
                          >
                            <Reply size={16} aria-hidden="true" />
                            Reply
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void runBatch([
                                { id: message.id, attempt: "regenerate" },
                              ])
                            }
                          >
                            <RefreshCw size={16} aria-hidden="true" />
                            Regenerate
                          </button>
                        </div>
                        {deeperFor === message.id && (
                          <div className={styles.deeper}>
                            <b>Dig deeper with the {agent.name}?</b>
                            <span>
                              Runs another look at the supplied brief only. No
                              outside sources are searched.
                            </span>
                            <label htmlFor={`deeper-${message.id}`}>
                              Focus (optional)
                            </label>
                            <input
                              id={`deeper-${message.id}`}
                              type="text"
                              value={deeperFocus}
                              onChange={(event) =>
                                setDeeperFocus(event.target.value)
                              }
                              placeholder="What should it look at more closely?"
                            />
                            <div>
                              <button
                                type="button"
                                className={styles.primary}
                                disabled={busy}
                                onClick={() => digDeeper(message)}
                              >
                                Dig deeper
                              </button>
                              <button
                                type="button"
                                className={styles.smallButton}
                                onClick={() => setDeeperFor(null)}
                              >
                                Not now
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                </div>
              );
            })}
          </div>

          {working.length > 0 && (
            <div className={styles.thinking} role="status">
              <span className={styles.dots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <b>Agents are thinking…</b>
              <span className={styles.chips}>
                {working.map((message) => (
                  <span
                    key={message.id}
                    className={styles.chip}
                    data-agent={message.lensId}
                  >
                    {agentById.get(message.lensId)!.mention}
                    {message.status === "thinking" ? " · now" : ""}
                  </span>
                ))}
              </span>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => controller.current?.abort()}
              >
                <Square size={12} aria-hidden="true" /> Stop
              </button>
            </div>
          )}

          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            {replyTarget && (
              <div className={styles.replyChip} data-agent={replyTarget.lensId}>
                <Reply size={14} aria-hidden="true" />
                <span>
                  <b>Replying to {agentById.get(replyTarget.lensId)!.name}</b>
                  {replyTarget.takes[replyTarget.active]
                    ? ` · ${replyTarget.takes[replyTarget.active].finding.title}`
                    : ""}
                </span>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTarget(null)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className={styles.mentions}>
              <AtSign size={14} aria-hidden="true" />
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={styles.mention}
                  data-agent={agent.id}
                  onClick={() => insertMention(agent.mention)}
                >
                  {agent.mention}
                </button>
              ))}
            </div>
            <label htmlFor="team-chat-v2-composer" className={styles.srOnly}>
              Message the team
            </label>
            <div className={styles.inputRow}>
              <textarea
                id="team-chat-v2-composer"
                ref={composer}
                rows={2}
                value={draft}
                placeholder="Ask the team, or @mention an agent…"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
              />
              <button
                type="submit"
                className={styles.send}
                disabled={!canSend || !draft.trim()}
              >
                <Send size={16} aria-hidden="true" />
                Send
              </button>
            </div>
            <small className={styles.hint}>
              No @mention: all five agents answer once. @mention: only that
              agent answers. To have one agent respond to another, press Reply
              on an answer and @mention who should respond, or write “@Category
              what do you think of @Consumer’s answer?”
            </small>
          </form>
        </section>

        <aside className={styles.rail} aria-label="Saved insights">
          <div className={styles.railHead}>
            <h3>Saved insights</h3>
            <span className={styles.total}>{savedFindings.length}</span>
          </div>
          <p className={styles.railNote}>
            Everything you save goes into your Dynamic Input Pack and Finalize
            Strategy.
          </p>
          <div
            className={styles.segment}
            role="tablist"
            aria-label="Saved from"
          >
            <button
              type="button"
              role="tab"
              aria-selected={savedView === "chat"}
              onClick={() => setSavedView("chat")}
            >
              Group chat · {savedFromChat.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={savedView === "individual"}
              onClick={() => setSavedView("individual")}
            >
              Individual · {savedFromIndividual.length}
            </button>
          </div>
          <div className={styles.savedList} role="tabpanel">
            {(savedView === "chat" ? savedFromChat : savedFromIndividual).map(
              (finding) => {
                const agent = agentById.get(finding.lensId)!;
                const take = chatTakeByRef.get(discoveryFindingRef(finding));
                const version = (state.teamChatVersions ?? []).find((item) =>
                  item.findings.some(
                    (candidate) =>
                      discoveryFindingRef(candidate) ===
                      discoveryFindingRef(finding),
                  ),
                );
                return (
                  <div
                    key={discoveryFindingRef(finding)}
                    className={styles.savedItem}
                  >
                    <div>
                      <span className={styles.lens} data-agent={agent.id}>
                        {agent.mention}
                      </span>
                      <small>
                        {finding.evidenceState === "research_gap"
                          ? "Research gap"
                          : "Source-backed"}
                      </small>
                      {savedView === "chat" && version && (
                        <button
                          type="button"
                          aria-label={`Remove ${finding.title} from saved insights`}
                          onClick={() =>
                            onToggleSave(take?.version ?? version, finding)
                          }
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <b>{finding.title}</b>
                  </div>
                );
              },
            )}
            {!(savedView === "chat" ? savedFromChat : savedFromIndividual)
              .length && (
              <p className={styles.railNote}>
                {savedView === "chat"
                  ? "Nothing saved from the group chat yet."
                  : "Nothing saved from the Individual Round Table yet."}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
