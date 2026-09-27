"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";
import { clearAllCaches } from "@/lib/client/cache";

type Household = {
  household: { id: string; name: string };
  you: { email: string | null };
  members: { user_id: string; is_you: boolean }[];
  invites: { email: string }[];
};

export default function Settings() {
  const [data, setData] = useState<Household | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api<Household>("/api/household").then(setData).catch((e: Error) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function invite() {
    setMessage(null);
    try {
      await api("/api/household/invites", { method: "POST", json: { email } });
      setEmail("");
      setMessage("Invite saved. Now create their account in Supabase (see below).");
      void load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await clearAllCaches();
    window.location.href = "/login";
  }

  return (
    <Screen
      title="Settings"
      right={
        <Link href="/" className="icon-btn" aria-label="Back to recipes">
          <Icon name="x" />
        </Link>
      }
    >
      <main className="screen-body">
        {!data && !message && <Spinner label="Loading…" />}
        {data && (
          <section className="card stack">
            <h2>Our household</h2>
            <p style={{ margin: 0 }}>
              {data.members.length} {data.members.length === 1 ? "person" : "people"} share these recipes and the list.
            </p>
            <p className="small muted" style={{ margin: 0 }}>Signed in as {data.you.email}</p>
          </section>
        )}
        <Link href="/settings/tags" className="card spread" style={{ color: "var(--ink)", textDecoration: "none", minHeight: 56 }}>
          <span>
            <b>Tags</b>
            <br />
            <span className="small muted">Rename, merge or delete</span>
          </span>
          <span aria-hidden="true" style={{ transform: "rotate(180deg)", display: "flex" }}>
            <Icon name="back" />
          </span>
        </Link>
        {data && (
          <section className="card stack">
            <h2>Add someone</h2>
            <p className="small" style={{ margin: 0 }}>
              For a grandparent or a nanny. Three steps: invite them here, add their email to <b>ALLOWED_EMAILS</b> in Vercel (then redeploy),
              and create their account in Supabase → Authentication → Users with <b>Auto Confirm User</b> ticked.
            </p>
            <form
              className="add-row"
              onSubmit={(e) => {
                e.preventDefault();
                void invite();
              }}
            >
              <label className="sr-only" htmlFor="invite">Their email</label>
              <input id="invite" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com" autoComplete="off" />
              <button type="submit" aria-label="Invite" disabled={!email.includes("@")}>
                <Icon name="plus" size={24} stroke={2.6} />
              </button>
            </form>
            {data.invites.length > 0 && <p className="small muted" style={{ margin: 0 }}>Waiting to join: {data.invites.map((i) => i.email).join(", ")}</p>}
          </section>
        )}
        {message && <p className="small" role="status">{message}</p>}
        <button type="button" className="btn btn-secondary" onClick={signOut}>
          Sign out of this phone
        </button>
      </main>
    </Screen>
  );
}
