"use client";

import { useEffect, useState } from "react";

const field = { fontSize: 18, padding: 12, width: "100%", boxSizing: "border-box", marginBottom: 12 } as const;

// Temporary sign-in page until the real screens are built.
export default function Login() {
  const [next, setNext] = useState("/");
  useEffect(() => setNext(new URLSearchParams(window.location.search).get("next") ?? "/"), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, next }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = data.next ?? "/";
      return;
    }
    setBusy(false);
    setMessage(data.error ?? "Something went wrong");
  }

  return (
    <main style={{ padding: "calc(env(safe-area-inset-top) + 24px) 24px 24px", maxWidth: 420 }}>
      <h1>Sign in</h1>
      <form onSubmit={signIn}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={field}
        />
        <button type="submit" disabled={!email || !password || busy} style={{ fontSize: 18, padding: "12px 20px", minHeight: 48 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
