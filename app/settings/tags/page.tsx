"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client/api";
import { writeCache } from "@/lib/client/cache";
import type { KnownTag } from "@/lib/client/known";

export default function Tags() {
  const [tags, setTags] = useState<KnownTag[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api<{ tags: KnownTag[] }>("/api/tags")
      .then((d) => {
        setTags(d.tags);
        writeCache("tags", d.tags);
        writeCache("recipes", null);
      })
      .catch((e: Error) => setMessage(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function rename() {
    if (!editing) return;
    const to = name.trim().toLowerCase();
    if (!to || to === editing) return setEditing(null);
    const target = tags?.find((t) => t.tag === to);
    if (target && !confirm(`“${to}” already exists. Merge “${editing}” into it?`)) return;
    try {
      await api("/api/tags", { method: "PATCH", json: { from: editing, to } });
      setMessage(target ? `Merged into “${to}”.` : `Renamed to “${to}”.`);
      setEditing(null);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function remove(tag: string, count: number) {
    if (!confirm(`Remove “${tag}” from ${count} recipe${count === 1 ? "" : "s"}? The recipes stay.`)) return;
    try {
      await api(`/api/tags?tag=${encodeURIComponent(tag)}`, { method: "DELETE" });
      setEditing(null);
      setMessage(`Removed “${tag}”.`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <Screen
      title="Tags"
      subtitle="Add tags on any recipe via Edit."
      right={
        <Link href="/settings" className="icon-btn" aria-label="Back to settings">
          <Icon name="back" />
        </Link>
      }
    >
      <main className="screen-body">
        {tags === null && !message && <Spinner label="Loading tags…" />}
        {message && <p className="small" role="status">{message}</p>}
        {tags?.length === 0 && (
          <div className="card empty">
            <h2>No tags yet</h2>
            <p>Open a recipe → Edit → Tags to add your first one.</p>
          </div>
        )}
        {tags && tags.length > 0 && (
          <ul className="card" style={{ listStyle: "none", margin: 0, padding: "4px 16px" }}>
            {tags.map((t) => (
              <li key={t.tag} style={{ borderBottom: "1px solid var(--soft)" }}>
                <button
                  type="button"
                  className="item"
                  style={{ padding: "10px 0" }}
                  onClick={() => {
                    setEditing(t.tag);
                    setName(t.tag);
                  }}
                >
                  <span className="name">
                    <b>{t.tag}</b>
                    <small>
                      {t.count} recipe{t.count === 1 ? "" : "s"}
                    </small>
                  </span>
                  <Icon name="pencil" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      {editing && (
        <Sheet title={`Tag: ${editing}`} onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <label className="field">
              New name <span className="hint">Use the name of an existing tag to merge the two.</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" list="tag-names" />
              <datalist id="tag-names">
                {tags?.filter((t) => t.tag !== editing).map((t) => <option key={t.tag} value={t.tag} />)}
              </datalist>
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || name.trim().toLowerCase() === editing}>
              {tags?.some((t) => t.tag === name.trim().toLowerCase() && t.tag !== editing) ? "Merge" : "Rename"}
            </button>
            <button type="button" className="btn btn-danger btn-block" onClick={() => remove(editing, tags?.find((t) => t.tag === editing)?.count ?? 0)}>
              <Icon name="trash" size={18} /> Delete tag
            </button>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}
