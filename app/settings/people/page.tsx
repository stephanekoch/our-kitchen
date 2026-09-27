"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";

type Household = {
  you: { user_id: string; email: string | null };
  members: { user_id: string; email: string | null; role: string; is_you: boolean }[];
  invites: { email: string }[];
};

export default function People() {
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
      setMessage("Invite saved. Now do steps 2 and 3 below.");
      void load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  const initial = (e: string | null) => (e ?? "?").charAt(0).toUpperCase();

  return (
    <Screen
      title="People"
      right={
        <Link href="/settings" className="icon-btn" aria-label="Back to settings">
          <Icon name="back" />
        </Link>
      }
    >
      <main className="screen-body">
        {!data && !message && <Spinner label="Loading…" />}
        {data && (
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: "4px 16px" }}>
            {data.members.map((m) => (
              <li key={m.user_id} className="person">
                <span className="avatar" aria-hidden="true">{initial(m.email)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ overflowWrap: "anywhere" }}>{m.email ?? "Member"}</b>
                  {m.is_you && <span className="small muted"> · you</span>}
                </span>
              </li>
            ))}
            {data.invites.map((i) => (
              <li key={i.email} className="person">
                <span className="avatar avatar-pending" aria-hidden="true">{initial(i.email)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ overflowWrap: "anywhere" }}>{i.email}</b>
                  <span className="small muted"> · invited, not joined yet</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <section className="card stack">
            <h2>Add someone</h2>
            <p className="small" style={{ margin: 0 }}>For a grandparent or a nanny. Three steps:</p>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              <li>Invite their email here.</li>
              <li>Add it to <b>ALLOWED_EMAILS</b> in Vercel, then redeploy.</li>
              <li>Create their account in Supabase → Authentication → Users, with <b>Auto Confirm User</b> ticked.</li>
            </ol>
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
          </section>
        )}
        {message && <p className="small" role="status">{message}</p>}
      </main>
    </Screen>
  );
}
