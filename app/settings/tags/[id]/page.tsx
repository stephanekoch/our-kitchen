"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/bits";
import { useConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import type { TagCategory, TagOption } from "@/lib/client/types";

type Rename = { kind: "category" } | { kind: "option"; option: TagOption };

export default function TagCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [cats, setCats] = useState<TagCategory[] | null>(null);
  const [newOption, setNewOption] = useState("");
  const [renaming, setRenaming] = useState<Rename | null>(null);
  const [name, setName] = useState("");
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

  const cat = cats?.find((c) => c.id === id) ?? null;

  const run = async (fn: () => Promise<{ categories: TagCategory[] }>, done?: string) => {
    setMessage(null);
    try {
      keep((await fn()).categories);
      if (done) setMessage(done);
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  };

  async function addOption() {
    const value = newOption.trim();
    if (!value) return;
    if (await run(() => api(`/api/tags/${id}/options`, { method: "POST", json: { name: value } }))) setNewOption("");
  }

  async function saveRename() {
    if (!renaming || !cat) return;
    const value = name.trim();
    if (!value) return;
    if (renaming.kind === "category") {
      if (await run(() => api(`/api/tags/${id}`, { method: "PATCH", json: { name: value } }))) setRenaming(null);
      return;
    }
    const opt = renaming.option;
    const target = cat.options.find((o) => o.id !== opt.id && o.name.toLowerCase() === value.toLowerCase());
    if (target) {
      setRenaming(null);
      const ok = await confirm({
        title: `Merge “${opt.name}” into “${target.name}”?`,
        body: `${opt.count} recipe${opt.count === 1 ? "" : "s"} move across and “${opt.name}” is removed.`,
        confirmLabel: "Merge",
      });
      if (!ok) return;
    }
    if (await run(() => api(`/api/tag-options/${opt.id}`, { method: "PATCH", json: { name: value } }), target ? `Merged into “${target.name}”.` : undefined)) setRenaming(null);
  }

  async function removeOption(o: TagOption) {
    const ok = await confirm({
      title: `Delete “${o.name}”?`,
      body: o.count ? `It comes off ${o.count} recipe${o.count === 1 ? "" : "s"}. The recipes stay.` : "No recipes use it.",
      confirmLabel: "Delete option",
      danger: true,
      icon: "trash",
    });
    if (ok) await run(() => api(`/api/tag-options/${o.id}`, { method: "DELETE" }));
  }

  async function removeCategory() {
    if (!cat) return;
    const ok = await confirm({
      title: `Delete ${cat.name}?`,
      body: `Its ${cat.options.length} option${cat.options.length === 1 ? "" : "s"} come off every recipe. The recipes stay.`,
      confirmLabel: "Delete category",
      danger: true,
      icon: "trash",
    });
    if (!ok) return;
    if (await run(() => api(`/api/tags/${id}`, { method: "DELETE" }))) router.replace("/settings/tags");
  }

  return (
    <Screen
      title={cat?.name ?? "Tags"}
      subtitle={cat ? "Options you can pick on a recipe." : undefined}
      right={
        <div className="row" style={{ gap: 6 }}>
          {cat && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setName(cat.name);
                setRenaming({ kind: "category" });
              }}
            >
              Rename
            </button>
          )}
          <Link href="/settings/tags" className="icon-btn" aria-label="Back to categories">
            <Icon name="back" />
          </Link>
        </div>
      }
    >
      <main className="screen-body">
        {cats === null && !message && <Spinner label="Loading…" />}
        {cats && !cat && <p className="muted">That category doesn&apos;t exist any more.</p>}
        {message && <p className="small" role="status">{message}</p>}
        {cat && (
          <>
            {cat.options.length > 0 && (
              <section className="card" style={{ padding: "4px 16px" }}>
                {cat.options.map((o) => (
                  <div key={o.id} className="link-row" style={{ cursor: "default" }}>
                    <span>
                      {o.name}
                      <br />
                      <span className="small muted">
                        {o.count} recipe{o.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 0 }}>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ background: "transparent" }}
                        aria-label={`Rename ${o.name}`}
                        onClick={() => {
                          setName(o.name);
                          setRenaming({ kind: "option", option: o });
                        }}
                      >
                        <Icon name="pencil" size={20} />
                      </button>
                      <button type="button" className="icon-btn" style={{ background: "transparent" }} aria-label={`Delete ${o.name}`} onClick={() => removeOption(o)}>
                        <Icon name="trash" size={20} />
                      </button>
                    </span>
                  </div>
                ))}
              </section>
            )}
            <section className="card stack">
              <label className="field" htmlFor="new-option">
                New option in {cat.name}
              </label>
              <form
                className="add-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addOption();
                }}
              >
                <input id="new-option" className="input" value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="e.g. Middle Eastern" autoComplete="off" enterKeyHint="done" />
                <button type="submit" aria-label="Add option" disabled={!newOption.trim()}>
                  <Icon name="plus" size={24} stroke={2.6} />
                </button>
              </form>
            </section>
            <button type="button" className="btn btn-danger" onClick={removeCategory}>
              <Icon name="trash" size={18} /> Delete {cat.name}
            </button>
          </>
        )}
      </main>
      {renaming && (
        <Sheet title={renaming.kind === "category" ? "Rename category" : `Rename “${renaming.option.name}”`} onClose={() => setRenaming(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRename();
            }}
          >
            <label className="field">
              New name
              {renaming.kind === "option" && <span className="hint">Use the name of another option here to merge the two.</span>}
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" enterKeyHint="done" />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim()}>
              Save
            </button>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}
