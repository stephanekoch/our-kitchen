"use client";

import { useEffect, useState } from "react";

const ERRORS: Record<string, string> = {
  "link-expired": "That sign-in link has expired or was already used. Ask for a new code.",
  "not-allowed": "That email isn't on the family list.",
  setup: "Signed in, but setting up your household failed. Try again.",
};

const field = { fontSize: 18, padding: 12, width: "100%", boxSizing: "border-box" } as const;
const button = { marginTop: 12, fontSize: 18, padding: "12px 20px", minHeight: 48 } as const;

// Stopgap sign-in until the real screens are built: email → 6-digit code → in.
export default function Login() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const error = params?.get("error");

  async function post(path: string, body: unknown) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMessage(data.error ?? "Something went wrong");
    return res.ok ? data : null;
  }

  async function sendCode() {
    if (await post("/api/auth/login", { email, next: params?.get("next") ?? "/" })) setStep("code");
  }

  async function verify() {
    const data = await post("/api/auth/verify", { email, code, next: params?.get("next") ?? "/" });
    if (data) window.location.href = data.next ?? "/";
  }

  return (
    <main style={{ padding: "calc(env(safe-area-inset-top) + 24px) 24px 24px", maxWidth: 420 }}>
      <h1>Sign in</h1>
      {error && ERRORS[error] && <p role="alert">{ERRORS[error]}</p>}
      {step === "email" ? (
        <>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
          <button onClick={sendCode} disabled={!email || busy} style={button}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </>
      ) : (
        <>
          <p>We&apos;ve emailed a code to {email}.</p>
          <label htmlFor="code">Code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            style={{ ...field, letterSpacing: 4 }}
          />
          <button onClick={verify} disabled={code.length < 6 || busy} style={button}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button onClick={() => setStep("email")} style={{ ...button, marginLeft: 8 }}>
            Use a different email
          </button>
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
