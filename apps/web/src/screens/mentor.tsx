"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { api, write, errorText } from "../api";
import { useData, useTask, useWorkspace } from "../context";
import { pretty, route } from "../content";
import {
  ActionLink,
  Button,
  ErrorState,
  Icon,
  Loading,
  PageHeader,
  Panel,
  SourceLink,
  TextLink,
  Tag,
} from "../ui";
import type { ChatMessage, Page } from "../types";

function RichText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
    </>
  );
}
function Proposal({
  message,
  onAccept,
  busy,
}: {
  message: ChatMessage;
  onAccept: (id: string) => void;
  busy: boolean;
}) {
  const p = message.pending_preference_change;
  if (!p) return null;
  const fields: Record<string, string> = {
    target_districts: "Target districts",
    tuition_cap_inr: "Tuition budget",
    government: "Government preference",
    hostel: "Hostel preference",
    medium: "Medium",
    active_goal_pathway: "Your goal",
  };
  const value = Array.isArray(p.value)
    ? p.value.join(", ")
    : typeof p.value === "string"
      ? route(p.value)?.name || pretty(p.value)
      : String(p.value);
  return (
    <div className="confirmation-proposal">
      <p>
        <strong>{fields[p.field] || "Preference"}:</strong> {value}. This is a
        proposed change. Your saved setting stays unchanged until you confirm.
      </p>
      <Button
        variant="secondary"
        busy={busy}
        onClick={() => onAccept(p.proposal_id)}
        icon="check"
      >
        Save this change
      </Button>
    </div>
  );
}
export function MentorPage() {
  const ws = useWorkspace(),
    task = useTask(),
    pagePath = usePathname();
  const history = useData<Page<ChatMessage>>("/mentor/messages?limit=30");
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState<string[]>([]);
  const initialized = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (history.data && !initialized.current) {
      setMessages(history.data.items);
      initialized.current = true;
    }
  }, [history.data]);
  useEffect(() => {
    if (messages.length || sending)
      bottom.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "end",
      });
  }, [messages, sending]);
  const ask = async (question: string, proposalId?: string) => {
    if (!question.trim() || sending) return;
    setSending(true);
    setError("");
    setInput("");
    setMessages((old) => [...old, { role: "user", content: question.trim() }]);
    try {
      const result = await write<{
        reply: string;
        fallback: boolean;
        sources: string[];
        source_links?: string[];
        actions?: ChatMessage["actions"];
        memory_suggestions: ChatMessage["memory_suggestions"];
        pending_preference_change: ChatMessage["pending_preference_change"];
      }>("/mentor/chat", {
        message: question.trim(),
        locale: ws.locale,
        page_path: pagePath,
        ...(proposalId ? { confirm_preference_change_id: proposalId } : {}),
      });
      setMessages((old) => [
        ...old,
        { role: "assistant", content: result.reply, ...result },
      ]);
      if (proposalId) {
        setAccepted((old) => [...old, proposalId]);
        await ws.refresh();
      }
    } catch (e) {
      setError(errorText(e));
      setInput(question);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };
  const prompts = [
    "What do my confirmed marks tell me?",
    "What should I check before choosing a Polytechnic?",
    "What is still unknown about my saved colleges?",
  ];
  const goal = route(ws.dashboard!.profile.active_goal_pathway);
  return (
    <>
      <PageHeader
        title="A little help thinking it through"
        description="Ask about your confirmed information, your options, or the questions worth taking to a college."
        action={
          <TextLink href="/settings/privacy">
            What the mentor remembers
          </TextLink>
        }
      />
      <div className="mentor-layout">
        <section className="conversation" aria-label="Mentor conversation">
          <div className="conversation-top">
            <div>
              <strong>Kompas, your career mentor</strong>
              <p>Saved information, published sources, and honest unknowns.</p>
            </div>
            <Tag>AI guide</Tag>
          </div>
          <div
            className="chat-messages"
            aria-live="polite"
            aria-relevant="additions"
          >
            {history.loading && !initialized.current ? (
              <Loading />
            ) : messages.length === 0 ? (
              <div className="chat-welcome">
                <h2>You don’t need to have it all figured out.</h2>
                <p>
                  Start with one question. I can help you explore, while you
                  stay in charge of the decision.
                </p>
                <div className="prompt-buttons">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => ask(prompt)}
                      disabled={sending}
                    >
                      <span>{prompt}</span>
                      <Icon name="up" size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, i) => (
                <div
                  className={"chat-message " + message.role}
                  key={message.id || i}
                >
                  {message.role === "assistant" && (
                    <div className="message-caption">
                      <Icon name="compass" size={14} />
                      <span>
                        {message.fallback ? "Mentor fallback" : "Kompas"}
                      </span>
                    </div>
                  )}
                  <RichText text={message.content} />
                  {message.sources && message.sources.length > 0 && (
                    <div className="message-sources">
                      {message.sources.map((id, index) => (
                        <SourceLink
                          id={id}
                          key={id}
                          label={"Source " + (index + 1)}
                        />
                      ))}
                    </div>
                  )}
                  {message.source_links && message.source_links.length > 0 && <div className="message-sources">{message.source_links.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Reference {index + 1} ↗</a>)}</div>}
                  {message.actions && (
                    <div className="chat-actions">
                      {message.actions.map((action) => (
                        <ActionLink
                          href={action.href}
                          key={action.href}
                          variant="secondary"
                        >
                          {action.label}
                        </ActionLink>
                      ))}
                    </div>
                  )}
                  {message.pending_preference_change &&
                    !accepted.includes(
                      message.pending_preference_change.proposal_id,
                    ) && (
                      <Proposal
                        message={message}
                        busy={sending}
                        onAccept={(id) =>
                          ask("Yes, save this proposed preference change.", id)
                        }
                      />
                    )}{" "}
                  {message.memory_suggestions?.map((s) => (
                    <div
                      className="confirmation-proposal"
                      key={s.suggestion_id}
                    >
                      <p>{s.content}</p>
                      <Button
                        variant="text"
                        busy={task.busy}
                        disabled={accepted.includes(s.suggestion_id)}
                        onClick={() =>
                          task.run(async () => {
                            await write(
                              "/me/memory/" + s.suggestion_id + "/accept",
                            );
                            setAccepted((old) => [...old, s.suggestion_id]);
                            ws.notify(
                              "You allowed this guess to be remembered. You can delete it in privacy settings.",
                            );
                          })
                        }
                      >
                        {accepted.includes(s.suggestion_id)
                          ? "Remembered"
                          : "Remember this guess"}
                      </Button>
                    </div>
                  ))}
                </div>
              ))
            )}
            {sending && (
              <div className="typing-indicator" role="status">
                <Icon name="loading" size={15} className="spin" />
                Checking your saved information…
              </div>
            )}
            {error && <ErrorState message={error} />}{" "}
            {history.error && (
              <ErrorState message={history.error} retry={history.reload} />
            )}
            <div ref={bottom} />
          </div>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <div className="composer-field">
              <textarea
                ref={inputRef}
                aria-label="Message to the career mentor"
                placeholder="What’s on your mind?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
              />
              <button
                type="submit"
                aria-label="Send mentor message"
                disabled={sending || !input.trim()}
              >
                <Icon
                  name={sending ? "loading" : "send"}
                  size={18}
                  className={sending ? "spin" : ""}
                />
              </button>
            </div>
            <div className="composer-foot">
              <span>Your question and relevant saved details are sent to Groq. Check the sources.</span>
              <span className="num">{input.length} / 1,000</span>
            </div>
          </form>
        </section>
        <aside className="mentor-context">
          <Panel title="The context you shared">
            <div className="context-block">
              <span>Current goal</span>
              <strong>{goal?.name || "Still exploring"}</strong>
              <p>Your choice, and it can change.</p>
            </div>
            <div className="context-block">
              <span>Result</span>
              <strong>
                {ws.dashboard!.academic_snapshot
                  ? "Confirmed sample result"
                  : "No confirmed result yet"}
              </strong>
              <p>
                {ws.dashboard!.academic_snapshot
                  ? "The mentor can use these subjects."
                  : "The mentor can discuss draft marks, clearly labelled as unconfirmed."}
              </p>
            </div>
            <div className="context-block">
              <span>Shortlist</span>
              <strong>{ws.dashboard!.shortlist.length} saved offerings</strong>
            </div>
            <div className="context-block">
              <span>Private comparison category</span>
              <strong>Never sent to the mentor</strong>
            </div>
            <div className="section-gap">
              <ActionLink href="/settings/privacy" variant="secondary">
                Review memory
              </ActionLink>
            </div>
          </Panel>
        </aside>
      </div>
      {task.error && <ErrorState message={task.error} />}
    </>
  );
}
