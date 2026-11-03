"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api, write, errorText } from "./api";
import { useWorkspace } from "./context";
import { Icon, SourceLink } from "./ui";
import type { ChatMessage, Page } from "./types";

export function MentorWidget() {
  const path = usePathname(), ws = useWorkspace();
  const [open, setOpen] = useState(false), [messages, setMessages] = useState<ChatMessage[]>([]),
    [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const loaded = useRef(false), end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || loaded.current || !ws.ready || ws.error) return;
    loaded.current = true;
    api<Page<ChatMessage>>("/mentor/messages?limit=30").then((data) => setMessages((current) => current.length ? current : data.items)).catch(() => { loaded.current = false; });
  }, [open, ws.ready, ws.error]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);
  if (path === "/mentor" || !ws.ready || ws.deleted || ws.error || !ws.dashboard) return null;
  async function send(message: string, proposalId?: string) {
    if (!message.trim() || busy) return;
    setBusy(true); setError(""); setText("");
    setMessages((old) => [...old, { role: "user", content: message.trim() }]);
    try {
      const result = await write<ChatMessage & { reply: string }>("/mentor/chat", { message: message.trim(), locale: ws.locale, page_path: path, ...(proposalId ? { confirm_preference_change_id: proposalId } : {}) });
      setMessages((old) => [...old, { ...result, role: "assistant", content: result.reply }]);
      if (proposalId) await ws.refresh();
    } catch (e) { setError(errorText(e)); setText(message); }
    finally { setBusy(false); }
  }
  return <div className="mentor-widget">
    {open && <section className="mentor-widget-panel" aria-label="Career mentor" role="dialog" aria-modal="false">
      <div className="mentor-widget-header"><div><strong>Ask Kompas</strong><small>Your career mentor</small></div><button type="button" aria-label="Close mentor" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button></div>
      <div className="mentor-widget-messages" aria-live="polite">
        {messages.length === 0 && <div className="mentor-widget-welcome"><strong>Need a hand?</strong><p>Ask about this page, your marks, careers or colleges you’re considering.</p>{["What should I look for here?", "Which careers suit my interests?", "Which colleges fit my marks?"].map((q) => <button key={q} onClick={() => send(q)}>{q} ↗</button>)}</div>}
        {messages.map((m, i) => <div key={m.id || i} className={'mentor-widget-message ' + m.role}>
          <p>{m.content}</p>
          {m.sources?.map((id, n) => <SourceLink key={id} id={id} label={'Source ' + (n + 1)} />)}
          {m.source_links?.map((url, n) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">Reference {n + 1} ↗</a>)}
          {m.actions && m.actions.length > 0 && <div className="mentor-widget-actions">{m.actions.map((a) => <Link key={a.href} href={a.href}>{a.label} →</Link>)}</div>}
          {i === messages.length - 1 && !busy && m.follow_ups && m.follow_ups.length > 0 && <div className="mentor-widget-followups">{m.follow_ups.map((q) => <button key={q} type="button" onClick={() => send(q)}>{q}</button>)}</div>}
          {m.pending_preference_change && <button disabled={busy} onClick={() => send('Yes, save this proposed preference change.', m.pending_preference_change!.proposal_id)}>Confirm proposed change</button>}
        </div>)}
        {busy && <p className="mentor-widget-status" role="status">Checking your information…</p>}
        {error && <p className="mentor-widget-error" role="alert">{error}</p>}<div ref={end} />
      </div>
      <form className="mentor-widget-form" onSubmit={(event) => { event.preventDefault(); send(text); }}>
        <textarea aria-label="Message to the career mentor" placeholder="Ask about careers, colleges or this page…" rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)} />
        <button type="submit" aria-label="Send mentor message" disabled={busy || !text.trim()}><Icon name="send" size={18} /></button>
      </form>
      <div className="mentor-widget-footer"><span>AI answers via Groq. Check sources before deciding.</span><Link href="/mentor">Full conversation ↗</Link></div>
    </section>}
    <button className="mentor-widget-trigger" type="button" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? "close" : "chat"} size={19} /><span className="mentor-widget-label">{open ? ws.t("close") : ws.t("ask")}</span></button>
  </div>;
}
