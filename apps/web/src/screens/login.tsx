"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { write, errorText } from "../api";
import { Brand } from "../ui";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    // A confirmation redirect can contain provider tokens in the fragment.
    // They are not needed here; remove them from the visible browser URL.
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await write<{ signed_in: boolean; message?: string }>(`/auth/${mode}`, { email, password });
      if (result.signed_in) {
        localStorage.removeItem("cq_compare");
        localStorage.removeItem("cq_compass_session");
        window.location.assign("/");
      } else {
        setPassword("");
        setMessage(result.message || "Check your email to confirm your account, then sign in.");
      }
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return (
    <main className="auth-page">
      <div className="auth-wrap">
        <div className="auth-brand"><Brand /></div>
        <div className="auth-layout">
          <section className="auth-intro">
            <p className="auth-eyebrow">YOUR FUTURE, YOUR WAY</p>
            <h1>{mode === "login" ? "Your journey is waiting." : "Make room for what’s next."}</h1>
            <p>Keep your pathways, shortlist and next steps together, wherever you explore from.</p>
            <div className="auth-color-cards" aria-hidden="true">
              <div><span>01</span><strong>Explore<br />your options</strong></div>
              <div><span>02</span><strong>Save what<br />matters</strong></div>
              <div><span>03</span><strong>Find your<br />own way</strong></div>
            </div>
          </section>
          <section className="auth-card" aria-labelledby="auth-heading">
            <h2 id="auth-heading">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p>{mode === "login" ? "Sign in to continue your journey." : "Save your progress and come back anytime."}</p>
            <form onSubmit={submit} className="auth-form">
              <label htmlFor="auth-email">Email address</label>
              <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} required />
              {mode === "signup" && <small>Choose a password with at least 8 characters.</small>}
              {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
              {message && <p className="auth-feedback" role="status">{message}</p>}
              <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"} <span aria-hidden="true">↗</span></button>
            </form>
            <p className="auth-switch">{mode === "login" ? "New to CareerQuest?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); setPassword(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
            <div className="auth-guest"><Link href="/">Continue as a guest →</Link><p>Your guest workspace stays separate from your account.</p></div>
          </section>
        </div>
      </div>
    </main>
  );
}
