"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import type { TagCategory } from "@/lib/client/types";

const STARTER: [string, string[]][] = [
  ["Type", ["Western", "Asian"]],
  ["Ingredients", ["Meat", "Seafood", "Vegetarian"]],
];

export default function TagCategories() {
  const router = useRouter();
  const [cats, setCats] = useState<TagCategory[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const keep = (c: TagCategory[]) => {
    setCats(c);
    writeCache("categories", c);
  };

  useEffect(() => {
    const cached = readCache<TagCategory[]>("categories");
    if (cached) setCats(cached);
    api<{ categories: TagCategory[] }>("/api/tags")
      .then((d) => keep(d.categories))
      .catch((e: Error) => setMessage(e.message));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await api<{ id: string; categories: TagCategory[] }>("/api/tags", { method: "POST", json: { name } });
      keep(res.categories);
      router.push(`/settings/tags/${res.id}`);
    } catch (e) {
      setMessage((e as Error).message);
      setBusy(false);
    }
  }

  async function starter() {
    setBusy(true);
    try {
      let latest: TagCategory[] = cats ?? [];
      for (const [cat, options] of STARTER) {
        if (latest.some((c) => c.name.toLowerCase() === cat.toLowerCase())) continue;
        const res = await api<{ id: string; categories: TagCategory[] }>("/api/tags", { method: "POST", json: { name: cat } });
        latest = res.categories;
        for (const o of options) {
          latest = (await api<{ categories: TagCategory[] }>(`/api/tags/${res.id}/options`, { method: "POST", json: { name: o } })).categories;
        }
      }
      keep(latest);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Tags"
      subtitle="Tap a category to change its options."
      right={
        <Link href="/settings" className="icon-btn" aria-label="Back to settings">
          <Icon name="back" />
        </Link>
      }
    >
      <main className="screen-body">
        {cats === null && !message && <Spinner label="Loading tags…" />}
        {message && <p className="error" role="alert">{message}</p>}
        {cats?.length === 0 && (
          <div className="card stack">
            <h2>Group your tags</h2>
            <p style={{ margin: 0 }}>
              A category holds options: <b>Type</b> (Western, Asian) or <b>Ingredients</b> (Meat, Seafood, Vegetarian). You pick options when you add or edit a
              recipe, and filter by them on Recipes.
            </p>
            <button type="button" className="btn btn-secondary" onClick={starter} disabled={busy}>
              {busy ? "Adding…" : "Start with Type and Ingredients"}
            </button>
          </div>
        )}
        {cats && cats.length > 0 && (
          <section className="card" style={{ padding: "4px 16px" }}>
            {cats.map((c) => (
              <Link key={c.id} href={`/settings/tags/${c.id}`} className="link-row">
                <span>
                  <b>{c.name}</b>
                  <br />
                  <span className="small muted">
                    {c.options.length ? c.options.map((o) => o.name).join(", ") : "No options yet"}
                  </span>
                </span>
                <span style={{ transform: "rotate(180deg)", display: "flex", color: "var(--muted)" }} aria-hidden="true">
                  <Icon name="back" />
                </span>
              </Link>
            ))}
          </section>
        )}
        {cats !== null && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setName("");
              setAdding(true);
            }}
          >
            <Icon name="plus" /> New category
          </button>
        )}
      </main>
      {adding && (
        <Sheet title="New category" onClose={() => setAdding(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void create();
            }}
          >
            <label className="field">
              Name <span className="hint">e.g. Type, Ingredients, Meal, Cuisine</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" enterKeyHint="done" />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || busy}>
              {busy ? "Creating…" : "Create and add options"}
            </button>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}
