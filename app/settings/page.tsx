"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";
import { clearAllCaches } from "@/lib/client/cache";

function Row({ href, icon, title, hint }: { href: string; icon: IconName; title: string; hint: string }) {
  return (
    <Link href={href} className="card settings-row">
      <span className="settings-ic"><Icon name={icon} /></span>
      <span style={{ flex: 1 }}>
        <b>{title}</b>
        <br />
        <span className="small muted">{hint}</span>
      </span>
      <span aria-hidden="true" style={{ transform: "rotate(180deg)", display: "flex", color: "var(--muted)" }}>
        <Icon name="back" />
      </span>
    </Link>
  );
}

export default function Settings() {
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
        <Row href="/settings/tags" icon="tag" title="Tags" hint="Categories and their options" />
        <Row href="/settings/people" icon="people" title="Add someone" hint="Who's in, and invite someone new" />
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={signOut}>
          Sign out of this phone
        </button>
      </main>
    </Screen>
  );
}
