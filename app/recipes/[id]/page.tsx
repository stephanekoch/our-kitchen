"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BabyPanel, FlagTags, Photo, Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import { amount, duration } from "@/lib/client/format";
import { shrinkPhoto } from "@/lib/client/image";
import { recipesOnList } from "@/lib/client/known";
import type { BabyWarning, Recipe, ShoppingList } from "@/lib/client/types";

type Loaded = { recipe: Recipe; baby_warnings: BabyWarning[] };

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [awake, setAwake] = useState(false);
  const [onList, setOnList] = useState(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cached = readCache<Loaded>(`recipe:${id}`);
    if (cached) {
      setData(cached);
      setServings(cached.recipe.servings);
    }
    api<Loaded>(`/api/recipes/${id}`)
      .then((d) => {
        setData(d);
        setServings((s) => s ?? d.recipe.servings);
        writeCache(`recipe:${id}`, d);
      })
      .catch((e: Error) => setError(e.message));
    setOnList(recipesOnList(readCache<ShoppingList>("list")).has(id));
    api<{ list: ShoppingList | null }>("/api/shopping-lists")
      .then(({ list }) => {
        setOnList(recipesOnList(list).has(id));
        writeCache("list", list);
      })
      .catch(() => {});
  }, [id]);

  // Keep the screen on while cooking.
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!awake || !nav.wakeLock) return;
    let cancelled = false;
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        if (cancelled) lock.release();
        else wakeLock.current = lock;
      })
      .catch(() => setAwake(false));
    return () => {
      cancelled = true;
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [awake]);

  if (!data) {
    return (
      <Screen tabs={false}>
        <main className="screen-body" style={{ paddingTop: "calc(var(--safe-top) + 24px)" }}>
          <Link href="/" className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
            <Icon name="back" /> Recipes
          </Link>
          {error ? <p className="error">{error}</p> : <Spinner label="Loading recipe…" />}
        </main>
      </Screen>
    );
  }

  const r = data.recipe;
  const base = r.servings ?? null;
  const target = servings ?? base;
  const factor = base && target ? target / base : 1;

  async function addToList() {
    if (onList && !confirm("This recipe is already on the shopping list. Add its ingredients again (for cooking it twice)?")) return;
    setBusy("list");
    try {
      const res = await api<{ added: number }>("/api/shopping-lists", {
        method: "POST",
        json: { recipes: [{ id: r.id, servings: target }], mode: "append" },
      });
      setToast(`Added ${res.added} item${res.added === 1 ? "" : "s"} to the list`);
      setOnList(true);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    try {
      const blob = await shrinkPhoto(file);
      const form = new FormData();
      form.append("photo", blob, "photo.jpg");
      const res = await api<{ photo_url: string | null }>(`/api/recipes/${r.id}/photo`, { method: "POST", body: form });
      const next = { ...data!, recipe: { ...r, photo_url: res.photo_url } };
      setData(next);
      writeCache(`recipe:${id}`, next);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    setBusy("delete");
    try {
      await api(`/api/recipes/${r.id}`, { method: "DELETE" });
      const cached = readCache<{ id: string }[]>("recipes");
      if (cached) writeCache("recipes", cached.filter((x) => x.id !== r.id));
      router.replace("/");
    } catch (e) {
      setToast((e as Error).message);
      setBusy(null);
    }
  }

  const toggleStep = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Screen
      tabs={false}
      dockHeight={90}
      dock={
        <button type="button" className={`btn btn-block ${onList ? "btn-secondary" : "btn-primary"}`} onClick={addToList} disabled={busy === "list"}>
          <Icon name={onList ? "check" : "list"} />{" "}
          {busy === "list" ? "Adding…" : onList ? "On the list · add again?" : target ? `Add to shopping list (serves ${target})` : "Add to shopping list"}
        </button>
      }
    >
      <div style={{ position: "relative" }}>
        <Link href="/" className="icon-btn back-btn" aria-label="Back to recipes">
          <Icon name="back" stroke={2.4} />
        </Link>
        <Photo src={r.photo_url ?? r.image_url} className="hero" iconSize={76} />
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
        <button type="button" className="btn change-photo" onClick={() => fileInput.current?.click()} disabled={busy === "photo"}>
          <Icon name="camera" size={18} /> {busy === "photo" ? "Uploading…" : "Change photo"}
        </button>
      </div>

      <main className="screen-body" style={{ paddingTop: 16 }}>
        <h1 className="recipe-title">{r.title}</h1>
        <div className="recipe-meta" style={{ marginTop: 0 }}>
          {r.total_minutes != null && (
            <span className="row" style={{ gap: 5, marginRight: 4 }}>
              <Icon name="clock" size={18} /> {duration(r.total_minutes)}
            </span>
          )}
          <FlagTags r={r} long />
          {onList && (
            <Link href="/list" className="tag tag-onlist">
              <Icon name="list" size={12} stroke={2.6} /> On the list
            </Link>
          )}
        </div>
        {r.tags.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {r.tags.map((t) => (
              <span key={t} className="tag-chip">{t}</span>
            ))}
          </div>
        )}

        <BabyPanel warnings={data.baby_warnings} babyFriendly={r.baby_friendly} />

        <section className="card">
          <div className="spread" style={{ marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>Ingredients</h2>
            {base && (
              <div className="stepper">
                <button type="button" aria-label="Fewer servings" disabled={(target ?? 1) <= 1} onClick={() => setServings(Math.max(1, (target ?? base) - 1))}>
                  <Icon name="minus" stroke={2.4} />
                </button>
                <span aria-live="polite">Serves {target}</span>
                <button type="button" aria-label="More servings" disabled={(target ?? 1) >= 24} onClick={() => setServings(Math.min(24, (target ?? base) + 1))}>
                  <Icon name="plus" stroke={2.4} />
                </button>
              </div>
            )}
          </div>
          <ul className="ingredients">
            {r.ingredients.map((i, n) => {
              const amt = amount(i.quantity, i.unit, factor);
              return (
                <li key={n}>
                  {amt ? <b>{amt}</b> : null}
                  <span>
                    {i.quantity == null && !amt ? i.raw : i.name}
                    {i.note && i.quantity != null && <span className="note">, {i.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {r.instructions.length > 0 && (
          <section className="card">
            <div className="spread" style={{ marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Method</h2>
              <button type="button" className="btn btn-quiet small" aria-pressed={awake} onClick={() => setAwake(!awake)}>
                <Icon name="sun" size={18} /> {awake ? "Screen stays on" : "Keep screen on"}
              </button>
            </div>
            <ol className="steps">
              {r.instructions.map((step, n) => (
                <li key={n}>
                  <button type="button" aria-pressed={done.has(n)} onClick={() => toggleStep(n)}>
                    <span>{step}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {r.notes && (
          <section className="card">
            <h2>Our notes</h2>
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.notes}</p>
          </section>
        )}

        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          {r.source_url ? (
            <a href={r.source_url} target="_blank" rel="noreferrer" className="btn btn-quiet small">
              <Icon name="external" size={18} /> {new URL(r.source_url).hostname.replace(/^www\./, "")}
            </a>
          ) : (
            <span />
          )}
          <div className="row">
            <Link href={`/recipes/${r.id}/edit`} className="btn btn-secondary" style={{ minHeight: 44 }}>
              <Icon name="pencil" size={18} /> Edit
            </Link>
            <button type="button" className="btn btn-danger" style={{ minHeight: 44 }} onClick={remove} disabled={busy === "delete"}>
              <Icon name="trash" size={18} /> Delete
            </button>
          </div>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status" style={{ ["--dock-h" as string]: "90px" }}>
          <span>{toast}</span>
          {toast.startsWith("Added") ? <Link href="/list">Open list</Link> : <button type="button" className="btn-quiet" style={{ color: "#fff", background: "none", border: 0 }} onClick={() => setToast(null)}>OK</button>}
        </div>
      )}
    </Screen>
  );
}
