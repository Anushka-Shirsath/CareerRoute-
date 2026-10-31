"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { write, errorText } from "../api";
import { Brand } from "../ui";

type Mode = "login" | "signup" | "forgot" | "reset";

const headings: Record<Mode, [string, string, string]> = {
  login: ["Welcome back", "Sign in to continue your journey.", "Sign in"],
  signup: ["Create your account", "Save your progress and come back anytime.", "Create account"],
  forgot: ["Reset your password", "We’ll email you a link to choose a new password.", "Send reset link"],
  reset: ["Choose a new password", "This signs you out everywhere else, so only you have access.", "Save new password"],
};

export const PASSWORD_HINT = "At least 10 characters. A short phrase of a few unrelated words works well.";

let loginFragment: string | null = null;

// Supabase email links return tokens in the URL fragment. Take it once per page
// load (so a re-run effect sees the same value) and remove it from the URL.
export function takeLoginFragment() {
  if (loginFragment === null) {
    loginFragment = window.location.hash.slice(1);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return loginFragment;
}

function finishSignIn() {
  localStorage.removeItem("cq_compare");
  localStorage.removeItem("cq_compass_session");
  window.location.assign("/");
}

export function LoginPage({ signedIn = false, fragment = "" }: { signedIn?: boolean; fragment?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    // A recovery token stays in memory only; the URL was already cleaned.
    const params = new URLSearchParams(fragment);
    if (params.get("type") === "recovery" && params.get("access_token")) {
      setRecoveryToken(params.get("access_token")!);
      setMode("reset");
    } else if (params.get("error")) {
      setMode("forgot");
      setError("That email link has expired or was already used. Ask for a new one below.");
    } else if (signedIn) {
      window.location.replace("/");
    }
  }, [signedIn, fragment]);
  function switchTo(next: Mode) {
    setMode(next); setError(""); setMessage(""); setPassword("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      if (mode === "forgot") {
        const result = await write<{ message: string }>("/auth/password/forgot", { email });
        setMessage(result.message);
      } else if (mode === "reset") {
        await write("/auth/password/reset", { access_token: recoveryToken, password });
        setRecoveryToken("");
        finishSignIn();
      } else {
        const result = await write<{ signed_in: boolean; message?: string }>(`/auth/${mode}`, { email, password });
        if (result.signed_in) finishSignIn();
        else {
          setPassword("");
          setMessage(result.message || "Check your email to confirm your account, then sign in.");
        }
      }
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }
  const [title, subtitle, action] = headings[mode];
  const newPassword = mode === "signup" || mode === "reset";
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
              {mode !== "reset" && <>
                <label htmlFor="auth-email">Email address</label>
                <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              </>}
              {mode !== "forgot" && <>
                <label htmlFor="auth-password">{mode === "reset" ? "New password" : "Password"}</label>
                <input id="auth-password" type="password" autoComplete={newPassword ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={newPassword ? 10 : 8} maxLength={128} required aria-describedby={newPassword ? "auth-password-hint" : undefined} />
              </>}
              {newPassword && <small id="auth-password-hint">{PASSWORD_HINT}</small>}
              {mode === "login" && <button type="button" className="auth-inline-link" onClick={() => switchTo("forgot")}>Forgot your password?</button>}
              {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
              {message && <p className="auth-feedback" role="status">{message}</p>}
              <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Please wait…" : action} <span aria-hidden="true">↗</span></button>
            </form>
            {mode !== "reset" && (
              <p className="auth-switch">
                {mode === "login" ? "New to CareerQuest?" : mode === "signup" ? "Already have an account?" : "Remembered it?"}{" "}
                <button type="button" onClick={() => switchTo(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button>
              </p>
            )}
            <div className="auth-guest"><Link href="/">Continue as a guest →</Link><p>Your guest workspace stays separate from your account.</p></div>
          </section>
        </div>
      </div>
    </main>
  );
}
