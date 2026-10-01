"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { APP } from "@/lib/app-config";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import { duration } from "@/lib/client/format";
import type { ShoppingList } from "@/lib/client/types";
import { FlagTags, Photo, Spinner } from "./bits";
import { Icon } from "./Icon";

type Card = {
  id: string;
  title: string;
  reason: string;
  total_minutes: number | null;
  baby_friendly: boolean;
  easy: boolean;
  quick: boolean;
  freezes_well: boolean;
  image_url: string | null;
  photo_url: string | null;
  status: "new" | "adding" | "added";
  portions: number;
  swapping?: boolean;
};
type Saved = { request: string; cards: Card[]; rejected: string[]; note: string | null; portions?: number };

const IDEAS = ["5 easy dinners for the week", "3 vegetarian, 2 with fish", "Quick meals on weeknights", "Things the baby can eat too", "A batch cook for the freezer"];

/** "Plan your week": describe what you fancy, get picks from your own recipes, add the ones you like. */
export function SuggestPanel({ onClose, onAdded }: { onClose: () => void; onAdded: (list: ShoppingList | null) => void }) {
  const [request, setRequest] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPortions, setLastPortions] = useState<number>(APP.defaultPortions);
  const input = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Pick up where you left off if the panel was closed.
  useEffect(() => {
    const saved = readCache<Saved>("suggest");
    if (saved) {
      setRequest(saved.request);
      setCards(saved.cards.map((c) => ({ ...c, status: c.status === "added" ? "added" : "new", swapping: false })));
      setRejected(saved.rejected);
      setNote(saved.note);
      if (saved.portions) setLastPortions(saved.portions);
    } else {
      setTimeout(() => input.current?.focus(), 50);
    }
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (cards.length || request) writeCache("suggest", { request, cards, rejected, note, portions: lastPortions } satisfies Saved);
  }, [request, cards, rejected, note, lastPortions]);

  const toCard = (s: Omit<Card, "status" | "portions">): Card => ({ ...s, status: "new", portions: lastPortions });
  const added = cards.filter((c) => c.status === "added");

  async function suggest() {
    const text = request.trim();
    if (!text) return;
    input.current?.blur();
    setLoading(true);
    setError(null);
    try {
      // Keep what you've already added; everything else is replaced by the new picks.
      const res = await api<{ suggestions: Omit<Card, "status" | "portions">[]; note: string | null }>("/api/suggestions", {
        method: "POST",
        json: { request: text, exclude: added.map((c) => c.id) },
      });
      setCards([...added, ...res.suggestions.map(toCard)]);
      setRejected([]);
      setNote(res.note);
      if (!res.suggestions.length) setError("Nothing in your recipes fits that. Try asking differently.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function swap(card: Card) {
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, swapping: true } : c)));
    setError(null);
    try {
      const res = await api<{ suggestions: Omit<Card, "status" | "portions">[] }>("/api/suggestions", {
        method: "POST",
        json: { request: request.trim() || "Something different", count: 1, exclude: [...cards.map((c) => c.id), ...rejected] },
      });
      const next = res.suggestions[0];
      setRejected((r) => [...r, card.id]);
      setCards((cs) => (next ? cs.map((c) => (c.id === card.id ? toCard(next) : c)) : cs.map((c) => (c.id === card.id ? { ...c, swapping: false } : c))));
      if (!next) setError("No other recipes fit. Add more recipes or change your request.");
    } catch (e) {
      setError((e as Error).message);
      setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, swapping: false } : c)));
    }
  }

  function reject(card: Card) {
    setRejected((r) => [...r, card.id]);
    setCards((cs) => cs.filter((c) => c.id !== card.id));
  }

  const update = (id: string, patch: Partial<Card>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setPortions = (card: Card, n: number) => {
    const portions = Math.min(24, Math.max(1, n));
    update(card.id, { portions });
    setLastPortions(portions);
    // Cards you haven't touched follow along, so a family of four sets it once.
    setCards((cs) => cs.map((c) => (c.id !== card.id && c.status === "new" && c.portions === card.portions ? { ...c, portions } : c)));
  };

  async function add(card: Card) {
    update(card.id, { status: "adding" });
    try {
      const res = await api<{ list: ShoppingList | null }>("/api/shopping-lists", {
        method: "POST",
        json: { recipes: [{ id: card.id, servings: card.portions }] },
      });
      update(card.id, { status: "added" });
      onAdded(res.list);
    } catch (e) {
      update(card.id, { status: "new" });
      setError((e as Error).message);
    }
  }

  function startOver() {
    setCards([]);
    setRejected([]);
    setNote(null);
    setRequest("");
    writeCache("suggest", null);
    setTimeout(() => input.current?.focus(), 50);
  }

  return (
    <div className="search-screen" role="dialog" aria-modal="true" aria-labelledby="suggest-title">
      <div className="search-top">
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="back" stroke={2.4} />
        </button>
        <h1 id="suggest-title" className="suggest-title">Plan your week</h1>
        {cards.length > 0 && (
          <button type="button" className="btn btn-quiet" onClick={startOver}>
            Start over
          </button>
        )}
      </div>

      <div className="suggest-body">
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            void suggest();
          }}
        >
          <label className="field" htmlFor="suggest-input">
            What do you fancy this week?
            <span className="hint">Panda only suggests recipes from your own book.</span>
          </label>
          <textarea
            id="suggest-input"
            ref={input}
            className="textarea"
            rows={3}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="e.g. 5 dinners, 2 vegetarian, quick ones on weeknights"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void suggest();
              }
            }}
          />
          {!cards.length && (
            <div className="row wrap" style={{ gap: 6 }}>
              {IDEAS.map((i) => (
                <button key={i} type="button" className="suggest" onClick={() => setRequest(i)}>
                  {i}
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={!request.trim() || loading}>
            <Icon name="sparkle" /> {loading ? "Thinking…" : cards.length ? "Suggest again" : "Suggest recipes"}
          </button>
        </form>

        {loading && (
          <div className="card">
            <Spinner label="Panda is looking through your recipes…" />
          </div>
        )}
        {note && !loading && <p className="small muted" style={{ margin: "0 4px" }}>{note}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {!loading &&
          cards.map((c) => (
            <section key={c.id} className={`card suggestion${c.status === "added" ? " is-added" : ""}`} aria-busy={c.swapping || c.status === "adding"}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <Photo src={c.photo_url ?? c.image_url} className="search-thumb" iconSize={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/recipes/${c.id}`} className="suggestion-title">{c.title}</Link>
                  <div className="recipe-meta" style={{ marginTop: 3 }}>
                    {c.total_minutes != null && <span>{duration(c.total_minutes)}</span>}
                    <FlagTags r={c} />
                  </div>
                  {c.reason && <p className="suggestion-reason">{c.reason}</p>}
                </div>
              </div>

              {c.swapping ? (
                <Spinner label="Finding another…" />
              ) : c.status === "added" ? (
                <p className="suggestion-added">
                  <Icon name="check" size={18} stroke={3} /> On the shopping list for {c.portions} {c.portions === 1 ? "person" : "people"}
                </p>
              ) : (
                <>
                  {/* Choose the portions first, then add in one tap. */}
                  <div className="spread">
                    <div className="stepper">
                      <button type="button" aria-label={`Fewer portions of ${c.title}`} disabled={c.portions <= 1 || c.status === "adding"} onClick={() => setPortions(c, c.portions - 1)}>
                        <Icon name="minus" stroke={2.4} />
                      </button>
                      <span aria-live="polite">
                        {c.portions} {c.portions === 1 ? "person" : "people"}
                      </span>
                      <button type="button" aria-label={`More portions of ${c.title}`} disabled={c.portions >= 24 || c.status === "adding"} onClick={() => setPortions(c, c.portions + 1)}>
                        <Icon name="plus" stroke={2.4} />
                      </button>
                    </div>
                    <button type="button" className="btn btn-primary" style={{ minHeight: 46 }} onClick={() => add(c)} disabled={c.status === "adding"} aria-label={`Add ${c.title} for ${c.portions} to the shopping list`}>
                      <Icon name="plus" size={18} /> {c.status === "adding" ? "Adding…" : "Add"}
                    </button>
                  </div>
                  <div className="suggestion-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => reject(c)} aria-label={`Reject ${c.title}`} disabled={c.status === "adding"}>
                      <Icon name="x" size={18} /> Reject
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => swap(c)} aria-label={`Suggest a different recipe instead of ${c.title}`} disabled={c.status === "adding"}>
                      <Icon name="refresh" size={18} /> Swap
                    </button>
                  </div>
                </>
              )}
            </section>
          ))}

        {added.length > 0 && !loading && (
          <button type="button" className="btn btn-dark btn-block" onClick={onClose}>
            <Icon name="cart" size={20} /> Done · {added.length} added to the shopping list
          </button>
        )}
      </div>
    </div>
  );
}
