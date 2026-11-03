"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { write, errorText } from "../api";
import { Brand } from "../ui";

type Mode = "login" | "signup";

const headings: Record<Mode, [string, string, string]> = {
  login: ["Welcome back", "Sign in to continue your journey.", "Sign in"],
  signup: ["Create your account", "Save your progress and come back anytime.", "Create account"],
};

export const PASSWORD_HINT = "At least 10 characters. A short phrase of a few unrelated words works well.";

function finishSignIn() {
  localStorage.removeItem("cq_compare");
  localStorage.removeItem("cq_compass_session");
  window.location.assign("/");
}

export function LoginPage({ signedIn = false }: { signedIn?: boolean }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (signedIn) window.location.replace("/");
  }, [signedIn]);
  function switchTo(next: Mode) {
    setMode(next); setError(""); setPassword("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      await write(`/auth/${mode}`, { email, password });
      finishSignIn();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  const [title, subtitle, action] = headings[mode];
  const newPassword = mode === "signup";
  return (
    <main className="auth-page">
      <div className="auth-wrap">
        <div className="auth-brand"><Brand /></div>
        <div className="auth-layout">
          <section className="auth-intro">
            <p className="auth-eyebrow">YOUR FUTURE, YOUR WAY</p>
            <h1>{mode === "signup" ? "Make room for what’s next." : "Your journey is waiting."}</h1>
            <p>Keep your pathways, shortlist and next steps together, wherever you explore from.</p>
            <div className="auth-color-cards" aria-hidden="true">
              <div><span>01</span><strong>Explore<br />your options</strong></div>
              <div><span>02</span><strong>Save what<br />matters</strong></div>
              <div><span>03</span><strong>Find your<br />own way</strong></div>
            </div>
          </section>
          <section className="auth-card" aria-labelledby="auth-heading">
            <h2 id="auth-heading">{title}</h2>
            <p>{subtitle}</p>
            <form onSubmit={submit} className="auth-form">
              <label htmlFor="auth-email">Email address</label>
              <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={newPassword ? 10 : 8} maxLength={128} required aria-describedby={newPassword ? "auth-password-hint" : undefined} />
              {newPassword && <small id="auth-password-hint">{PASSWORD_HINT}</small>}
              {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
              <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Please wait…" : action} <span aria-hidden="true">↗</span></button>
            </form>
            <p className="auth-switch">
              {mode === "login" ? "New to CareerQuest?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => switchTo(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button>
            </p>
            <div className="auth-guest"><Link href="/">Continue as a guest →</Link><p>Your guest workspace stays separate from your account.</p></div>
          </section>
        </div>
      </div>
    </main>
  );
}
