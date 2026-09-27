"use client";

import { useEffect, useState } from "react";
import { APP } from "@/lib/app-config";

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
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: "No connection — try again when you have signal" };
    if (res?.ok) {
      window.location.href = data.next ?? "/";
      return;
    }
    setBusy(false);
    setMessage(data.error ?? "Something went wrong");
  }

  return (
    <main className="screen" style={{ justifyContent: "flex-end", padding: "calc(var(--safe-top) + 24px) 20px calc(var(--safe-bottom) + 24px)", gap: 16 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={96} height={96} style={{ borderRadius: 22 }} />
        <h1 style={{ margin: 0, fontFamily: "var(--display)", fontWeight: 600, fontSize: 36 }}>{APP.name}</h1>
      </div>
      <form className="card stack" onSubmit={signIn}>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <p className="error" role="alert">{message}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={!email || !password || busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
