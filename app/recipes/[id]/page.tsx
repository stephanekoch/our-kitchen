"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlagTags, Photo, Spinner } from "@/components/bits";
import { Celebration, type CookStats } from "@/components/Celebration";
import { useConfirm } from "@/components/Confirm";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { APP } from "@/lib/app-config";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import { amount, duration } from "@/lib/client/format";
import { recipesOnList, useKnown } from "@/lib/client/known";
import type { Recipe, ShoppingList } from "@/lib/client/types";
import { singularise } from "@/lib/ingredients";

type Loaded = { recipe: Recipe };
type Cooking = { done: number[]; startedAt: number };
type Timer = { recipeId: string; label: string; endAt: number };
const COOK_EXPIRY_MS = 12 * 60 * 60 * 1000; // a cooking session left open is forgotten after 12 hours

/** "carrots" → "carrot" when you only need one (or less). */
function oneOf(name: string): string {
  const words = name.split(" ");
  words[words.length - 1] = singularise(words[words.length - 1]!);
  return words.join(" ");
}

/** Minutes mentioned in a step: "simmer for 15–20 minutes" → 20, "bake 1 hour" → 60. */
function minutesIn(step: string): number | null {
  const m = step.match(/(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(minutes?|mins?|hours?|hrs?)\b/i);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  const mins = /^h/i.test(m[3]!) ? n * 60 : n;
  return mins > 0 && mins <= 600 ? mins : null;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {}
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };

export default function RecipePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { categories } = useKnown();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portions, setPortions] = useState<number>(APP.defaultPortions);
  const [onList, setOnList] = useState<Map<string, number | null>>(new Map());
  const [cooking, setCooking] = useState<Cooking | null>(null);
  const [timer, setTimer] = useState<Timer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [celebrate, setCelebrate] = useState<{ stats: CookStats | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const method = useRef<HTMLElement>(null);
  const rang = useRef(false);
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
    const t = readCache<Timer>("timer");
    if (t && t.recipeId === id && t.endAt > Date.now() - 60_000) setTimer(t);
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

  // Timer: tick every second, ring once when it's up.
  useEffect(() => {
    if (!timer) return;
    rang.current = timer.endAt <= Date.now();
    const i = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!rang.current && t >= timer.endAt) {
        rang.current = true;
        beep();
      }
    }, 1000);
    return () => clearInterval(i);
  }, [timer]);

  const saveCooking = useCallback(
    (c: Cooking | null) => {
      setCooking(c);
      writeCache(cookKey, c);
    },
    [cookKey],
  );
  const saveTimer = (t: Timer | null) => {
    setTimer(t);
    setNow(Date.now());
    writeCache("timer", t);
  };

  const catTags = useMemo(() => {
    const ids = new Set(data?.recipe.tag_ids ?? []);
    return categories.flatMap((c) => c.options.filter((o) => ids.has(o.id)).map((o) => ({ id: o.id, cat: c.name, name: o.name })));
  }, [categories, data]);

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
  const timerLeft = timer ? timer.endAt - now : 0;

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

  async function stopCooking() {
    if ((cooking?.done.length ?? 0) > 0 && !allDone) {
      const ok = await confirm({ title: "Stop cooking?", body: "Your ticked steps will be cleared.", confirmLabel: "Stop cooking", cancelLabel: "Keep cooking", icon: "stop" });
      if (!ok) return;
    }
    saveCooking(null);
    saveTimer(null);
  }

  function finish() {
    setCelebrate({ stats: null });
    api<CookStats>(`/api/recipes/${r.id}/cooked`, { method: "POST" })
      .then((stats) => setCelebrate((c) => (c ? { stats } : c)))
      .catch(() => {});
  }

  function toggleStep(n: number) {
    if (!cooking) return;
    const wasDone = doneSet.has(n);
    const next = wasDone ? cooking.done.filter((x) => x !== n) : [...cooking.done, n];
    saveCooking({ ...cooking, done: next });
    if (!wasDone && next.length === steps.length) {
      finish();
      return;
    }
    const following = steps.findIndex((_, i) => !next.includes(i));
    if (following >= 0 && !wasDone) {
      setTimeout(() => document.getElementById(`step-${following}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }

  async function startTimer(mins: number, stepNo: number) {
    if (timer && timer.endAt > Date.now()) {
      const ok = await confirm({ title: "Replace the running timer?", body: `${timer.label} has ${clock(timer.endAt - Date.now())} left.`, confirmLabel: "Start new timer", icon: "timer" });
      if (!ok) return;
    }
    saveTimer({ recipeId: r.id, label: `Step ${stepNo} · ${mins} min`, endAt: Date.now() + mins * 60_000 });
  }

  async function remove() {
    const ok = await confirm({ title: `Delete “${r.title}”?`, body: "The recipe and its photo are deleted for both of you. This can't be undone.", confirmLabel: "Delete recipe", danger: true, icon: "trash" });
    if (!ok) return;
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
          <button type="button" className="btn btn-secondary" style={{ flex: 1, paddingInline: 10 }} onClick={listAction} disabled={busy === "list"}>
            <Icon name={listed ? "x" : "cart"} size={20} />
            {busy === "list" ? "…" : listed ? "Remove from list" : "Add to list"}
          </button>
          {cooking ? (
            allDone ? (
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={finish}>
                <Icon name="check" size={20} /> Finish
              </button>
            ) : (
              <button type="button" className="btn btn-dark" style={{ flex: 1 }} onClick={stopCooking} aria-label="Stop cooking">
                <Icon name="stop" size={20} /> Stop
              </button>
            )
          ) : (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={startCooking} disabled={!steps.length}>
              <Icon name="play" size={20} /> Cook
            </button>
          )}
        </div>
      }
    >
      {/* The photo stays put; the recipe slides up over it. */}
      <div className="hero-fixed">
        <Photo src={r.photo_url ?? r.image_url} className="hero" iconSize={76} />
      </div>
      <div className="hero-bar-fixed">
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
      {timer && (
        <div className={`timer-banner${timerLeft <= 0 ? " timer-up" : ""}`} role="status" aria-live="polite">
          <span className="row" style={{ gap: 8 }}>
            <span className="pulse" aria-hidden="true" />
            {timerLeft > 0 ? (
              <>
                <b style={{ fontVariantNumeric: "tabular-nums" }}>{clock(timerLeft)}</b> <span>{timer.label}</span>
              </>
            ) : (
              <b>Time&apos;s up · {timer.label}</b>
            )}
          </span>
          <button type="button" className="btn btn-quiet" style={{ color: "#fff", minHeight: 36 }} onClick={() => saveTimer(null)}>
            {timerLeft > 0 ? "Cancel" : "OK"}
          </button>
        </div>
      )}

      <main className="screen-body over-photo">
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
        {catTags.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            {catTags.map((t) => (
              <span key={t.id} className="tag tag-cat">
                {t.cat} · {t.name}
              </span>
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
          <section className={`card${cooking ? " cooking" : ""}`} ref={method} style={{ scrollMarginTop: 80 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0 }}>Method</h2>
              {cooking && (
                <span className="small muted" aria-live="polite">
                  {allDone ? "All done" : `Step ${current + 1} of ${steps.length}`}
                </span>
              )}
            </div>
            {cooking && cooking.done.length === 0 && (
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                Tap <b>Done</b> as you finish each step. The screen stays on while you cook.
              </p>
            )}
            {cooking ? (
              <ol className="cook-steps">
                {steps.map((step, n) => {
                  const done = doneSet.has(n);
                  const mins = minutesIn(step);
                  return (
                    <li key={n} id={`step-${n}`} className={`cook-step${done ? " done" : n === current ? " current" : ""}`}>
                      <span className="step-box" aria-hidden="true">{n + 1}</span>
                      <div className="step-text">
                        <span>{step}</span>
                        {mins && !done && (
                          <button type="button" className="timer-chip" onClick={() => startTimer(mins, n + 1)}>
                            <Icon name="timer" size={16} /> Start {mins} min timer
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className={`done-circle${done ? " on" : ""}`}
                        aria-pressed={done}
                        aria-label={done ? `Step ${n + 1} done. Tap to undo` : `Mark step ${n + 1} done`}
                        onClick={() => toggleStep(n)}
                      >
                        <Icon name="check" size={22} stroke={3} />
                        {!done && <span>Done</span>}
                      </button>
                    </li>
                  );
                })}
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

      {celebrate && (
        <Celebration
          title={r.title.toLowerCase()}
          stats={celebrate.stats}
          onDone={() => {
            setCelebrate(null);
            saveCooking(null);
            saveTimer(null);
          }}
        />
      )}
    </Screen>
  );
}
