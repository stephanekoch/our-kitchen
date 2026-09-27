"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlagTags, Photo, Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { APP } from "@/lib/app-config";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import { amount, duration } from "@/lib/client/format";
import { recipesOnList } from "@/lib/client/known";
import { singularise } from "@/lib/ingredients";
import type { Recipe, ShoppingList } from "@/lib/client/types";

type Loaded = { recipe: Recipe };
type Cooking = { done: number[]; startedAt: number };
const COOK_EXPIRY_MS = 12 * 60 * 60 * 1000; // a cooking session left open is forgotten after 12 hours

/** "carrots" → "carrot" when you only need one (or less). */
function oneOf(name: string): string {
  const words = name.split(" ");
  words[words.length - 1] = singularise(words[words.length - 1]!);
  return words.join(" ");
}

type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portions, setPortions] = useState<number>(APP.defaultPortions);
  const [onList, setOnList] = useState<Map<string, number | null>>(new Map());
  const [cooking, setCooking] = useState<Cooking | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const method = useRef<HTMLElement>(null);
  const cookKey = `cook:${id}`;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const cached = readCache<Loaded>(`recipe:${id}`);
    if (cached?.recipe) setData(cached);
    api<Loaded>(`/api/recipes/${id}`)
      .then((d) => {
        setData(d);
        writeCache(`recipe:${id}`, d);
      })
      .catch((e: Error) => setError(e.message));

    const applyList = (list: ShoppingList | null | undefined) => {
      const map = recipesOnList(list);
      setOnList(map);
      const p = map.get(id);
      if (p) setPortions(p);
    };
    applyList(readCache<ShoppingList>("list"));
    api<{ list: ShoppingList | null }>("/api/shopping-lists")
      .then(({ list }) => {
        applyList(list);
        writeCache("list", list);
      })
      .catch(() => {});

    const saved = readCache<Cooking>(cookKey);
    if (saved && Date.now() - saved.startedAt < COOK_EXPIRY_MS) setCooking(saved);
  }, [id, cookKey]);

  // While cooking, the phone screen stays on (no dimming or locking with messy hands).
  useEffect(() => {
    const nav = navigator as WakeLockNav;
    if (!cooking || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = () =>
      nav.wakeLock!
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    void request();
    const again = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => {});
    };
  }, [cooking !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCooking = useCallback(
    (c: Cooking | null) => {
      setCooking(c);
      writeCache(cookKey, c);
    },
    [cookKey],
  );

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
  const base = r.servings;
  const factor = base ? portions / base : 1;
  const listed = onList.has(r.id);
  const steps = r.instructions;
  const doneSet = new Set(cooking?.done ?? []);
  const current = cooking ? steps.findIndex((_, n) => !doneSet.has(n)) : -1;
  const allDone = cooking !== null && steps.length > 0 && current === -1;

  async function listAction() {
    setBusy("list");
    try {
      if (listed) {
        const listId = readCache<ShoppingList>("list")?.id;
        if (!listId) throw new Error("Open the list once with signal, then try again");
        const res = await api<{ list: ShoppingList | null }>(`/api/shopping-lists/${listId}/recipes/${r.id}`, { method: "DELETE" });
        writeCache("list", res.list);
        setOnList(recipesOnList(res.list));
        setToast("Removed from the shopping list");
      } else {
        const res = await api<{ list: ShoppingList | null }>("/api/shopping-lists", {
          method: "POST",
          json: { recipes: [{ id: r.id, servings: base ? portions : null }] },
        });
        writeCache("list", res.list);
        setOnList(recipesOnList(res.list));
        setToast(base ? `Added for ${portions} ${portions === 1 ? "person" : "people"}` : "Added to the shopping list");
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function startCooking() {
    saveCooking({ done: [], startedAt: Date.now() });
    setTimeout(() => method.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function stopCooking() {
    if (!allDone && (cooking?.done.length ?? 0) > 0 && !confirm("Stop cooking? Your ticked steps will be cleared.")) return;
    saveCooking(null);
    if (allDone) setToast("Enjoy your meal!");
  }

  function toggleStep(n: number) {
    if (!cooking) return;
    const next = doneSet.has(n) ? cooking.done.filter((x) => x !== n) : [...cooking.done, n];
    saveCooking({ ...cooking, done: next });
    // Bring the next step into view.
    const following = steps.findIndex((_, i) => !next.includes(i));
    if (following >= 0 && !doneSet.has(n)) {
      setTimeout(() => document.getElementById(`step-${following}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    setBusy("delete");
    try {
      await api(`/api/recipes/${r.id}`, { method: "DELETE" });
      const cached = readCache<{ id: string }[]>("recipes");
      if (cached) writeCache("recipes", cached.filter((x) => x.id !== r.id));
      writeCache(cookKey, null);
      router.replace("/");
    } catch (e) {
      setToast((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Screen
      tabs={false}
      dockHeight={90}
      dock={
        <div className="row">
          <button type="button" className={`btn ${listed ? "btn-secondary" : "btn-secondary"}`} style={{ flex: 1, paddingInline: 10 }} onClick={listAction} disabled={busy === "list"}>
            <Icon name={listed ? "x" : "cart"} size={20} />
            {busy === "list" ? "…" : listed ? "Remove from list" : "Add to list"}
          </button>
          {cooking ? (
            <button type="button" className={`btn ${allDone ? "btn-primary" : "btn-dark"}`} style={{ flex: 1 }} onClick={stopCooking} aria-label={allDone ? "Finish cooking" : "Stop cooking"}>
              <Icon name={allDone ? "check" : "stop"} size={20} /> {allDone ? "Finish" : "Stop"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={startCooking} disabled={!steps.length}>
              <Icon name="play" size={20} /> Cook
            </button>
          )}
        </div>
      }
    >
      <div style={{ position: "relative" }}>
        <Photo src={r.photo_url ?? r.image_url} className="hero" iconSize={76} />
        <div className="hero-bar">
          <Link href="/" className="icon-btn on-photo" aria-label="Back to recipes">
            <Icon name="back" stroke={2.4} />
          </Link>
          <div className="row" style={{ gap: 8 }}>
            <Link href={`/recipes/${r.id}/edit`} className="icon-btn on-photo" aria-label="Edit recipe and photo">
              <Icon name="pencil" />
            </Link>
            <button type="button" className="icon-btn on-photo" aria-label="Delete recipe" onClick={remove} disabled={busy === "delete"}>
              <Icon name="trash" />
            </button>
          </div>
        </div>
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
          {listed && (
            <Link href="/list" className="tag tag-onlist">
              <Icon name="cart" size={12} stroke={2.6} /> On the list{onList.get(r.id) ? ` (${onList.get(r.id)})` : ""}
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

        <section className="card">
          <div className="spread" style={{ marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>Ingredients</h2>
            {base ? (
              <div className="stepper">
                <button type="button" aria-label="Fewer portions" disabled={portions <= 1} onClick={() => setPortions(Math.max(1, portions - 1))}>
                  <Icon name="minus" stroke={2.4} />
                </button>
                <span aria-live="polite">
                  {portions} {portions === 1 ? "person" : "people"}
                </span>
                <button type="button" aria-label="More portions" disabled={portions >= 24} onClick={() => setPortions(Math.min(24, portions + 1))}>
                  <Icon name="plus" stroke={2.4} />
                </button>
              </div>
            ) : (
              <Link href={`/recipes/${r.id}/edit`} className="small">Add how many it serves</Link>
            )}
          </div>
          <ul className="ingredients">
            {r.ingredients.map((i, n) => {
              const amt = amount(i.quantity, i.unit, factor);
              return (
                <li key={n}>
                  {amt ? <b>{amt}</b> : null}
                  <span>
                    {i.quantity == null && !amt ? i.raw : !i.unit && i.quantity != null && Number(i.quantity) * factor <= 1 ? oneOf(i.name) : i.name}
                    {i.note && i.quantity != null && <span className="note">, {i.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {steps.length > 0 && (
          <section className={`card${cooking ? " cooking" : ""}`} ref={method} style={{ scrollMarginTop: 16 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Method</h2>
              {cooking && (
                <span className="small muted" aria-live="polite">
                  {allDone ? "All done" : `Step ${current + 1} of ${steps.length}`}
                </span>
              )}
            </div>
            {cooking && !allDone && cooking.done.length === 0 && (
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                Tap each step when it&apos;s done. The screen stays on while you cook.
              </p>
            )}
            {cooking ? (
              <ol className="cook-steps">
                {steps.map((step, n) => (
                  <li key={n} id={`step-${n}`}>
                    <button type="button" aria-pressed={doneSet.has(n)} className={n === current ? "current" : undefined} onClick={() => toggleStep(n)}>
                      <span className="step-box">{doneSet.has(n) ? <Icon name="check" size={18} stroke={3} /> : n + 1}</span>
                      <span>{step}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="plain-steps">
                {steps.map((step, n) => (
                  <li key={n}>{step}</li>
                ))}
              </ol>
            )}
          </section>
        )}

        {r.notes && (
          <section className="card">
            <h2>Our notes</h2>
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{r.notes}</p>
          </section>
        )}

        {r.source_url && (
          <a href={r.source_url} target="_blank" rel="noreferrer" className="btn btn-quiet small" style={{ alignSelf: "flex-start" }}>
            <Icon name="external" size={18} /> {new URL(r.source_url).hostname.replace(/^www\./, "")}
          </a>
        )}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {toast.startsWith("Added") ? (
            <Link href="/list">Open list</Link>
          ) : (
            <button type="button" style={{ color: "#fff", background: "none", border: 0, fontWeight: 700 }} onClick={() => setToast(null)}>
              OK
            </button>
          )}
        </div>
      )}
    </Screen>
  );
}
