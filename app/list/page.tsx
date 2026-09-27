"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { CATEGORY_LABELS, categorise, categoryRank, type Category } from "@/lib/categories";
import { parseIngredientLine } from "@/lib/ingredients";
import { api, ApiError } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import type { ListItem, ShoppingList } from "@/lib/client/types";
import { createClient } from "@/lib/supabase/browser";

type Pending = Record<string, boolean>; // item id → ticked, not yet saved (e.g. no signal in the shop)

export default function ListPage() {
  const [list, setList] = useState<ShoppingList | null | undefined>(undefined);
  const [pending, setPending] = useState<Pending>({});
  const [offline, setOffline] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [editText, setEditText] = useState("");
  const flushing = useRef(false);
  const pendingRef = useRef<Pending>({});

  const load = useCallback(async () => {
    try {
      const { list } = await api<{ list: ShoppingList | null }>("/api/shopping-lists");
      setList(list);
      writeCache("list", list);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else setMessage((e as Error).message);
    }
  }, []);

  const savePending = (p: Pending) => {
    pendingRef.current = p;
    setPending(p);
    writeCache("pending", p);
  };

  // Send any ticks made while offline; keep them if there's still no signal.
  const flush = useCallback(async () => {
    if (flushing.current) return;
    const entries = Object.entries(pendingRef.current);
    if (!entries.length) return;
    const listId = readCache<ShoppingList>("list")?.id;
    if (!listId) return;
    flushing.current = true;
    for (const [itemId, checked] of entries) {
      try {
        await api(`/api/shopping-lists/${listId}/items/${itemId}`, { method: "PATCH", json: { checked } });
        const rest = { ...pendingRef.current };
        if (rest[itemId] === checked) delete rest[itemId];
        savePending(rest);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          setOffline(true);
          break;
        }
        const rest = { ...pendingRef.current }; // item was deleted on the other phone, etc.
        delete rest[itemId];
        savePending(rest);
      }
    }
    flushing.current = false;
  }, []);

  useEffect(() => {
    const cached = readCache<ShoppingList | null>("list");
    if (cached !== null) setList(cached);
    const p = readCache<Pending>("pending") ?? {};
    pendingRef.current = p;
    setPending(p);
    void flush().then(load);
    const back = () => {
      if (document.visibilityState === "visible") void flush().then(load);
    };
    window.addEventListener("online", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("online", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [flush, load]);

  // Live updates: when the other phone ticks something, this one updates within a second or two.
  const listId = list?.id;
  useEffect(() => {
    if (!listId) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`list-${listId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_list_items", filter: `list_id=eq.${listId}` }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => void load(), 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [listId, load]);

  const items = useMemo(() => {
    if (!list) return [];
    const all: ListItem[] = [...list.groups.flatMap((g) => g.items), ...list.checked];
    return all.map((i) => (i.id in pending ? { ...i, checked: pending[i.id]! } : i));
  }, [list, pending]);

  const groups = useMemo(() => {
    const byCat = new Map<string, ListItem[]>();
    for (const i of items) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
    return [...byCat.entries()]
      .sort(([a], [b]) => categoryRank(a) - categoryRank(b))
      .map(([category, its]) => ({
        category,
        label: CATEGORY_LABELS[category as Category] ?? "Other",
        items: its.sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name, "en-GB")),
      }));
  }, [items]);

  const recipeTitles = useMemo(() => new Map((list?.recipes ?? []).map((r) => [r.id, r.title])), [list]);
  const ticked = items.filter((i) => i.checked).length;

  function toggle(item: ListItem) {
    savePending({ ...pendingRef.current, [item.id]: !item.checked });
    void flush();
  }

  async function addItem() {
    const name = newItem.trim();
    if (!name) return;
    setMessage(null);
    try {
      let id = list?.id;
      if (!id) {
        const res = await api<{ list: ShoppingList }>("/api/shopping-lists", { method: "POST", json: { recipes: [] } });
        id = res.list.id;
      }
      await api(`/api/shopping-lists/${id}/items`, { method: "POST", json: { name } });
      setNewItem("");
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  function openEdit(item: ListItem) {
    setEditing(item);
    setEditText(`${item.amount} ${item.name}`.trim());
  }

  async function saveEdit() {
    if (!list || !editing) return;
    const p = parseIngredientLine(editText);
    if (!p.name.trim()) return;
    // Keep weights and volumes in g/ml so they still merge with amounts added from recipes.
    let { quantity, unit } = p;
    if (quantity != null && unit === "kg") [quantity, unit] = [quantity * 1000, "g"];
    if (quantity != null && unit === "l") [quantity, unit] = [quantity * 1000, "ml"];
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    try {
      await api(`/api/shopping-lists/${list.id}/items/${editing.id}`, {
        method: "PATCH",
        json: { name, quantity, unit, category: name.toLowerCase() === editing.name.toLowerCase() ? editing.category : categorise(name) },
      });
      setEditing(null);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function removeItem() {
    if (!list || !editing) return;
    try {
      await api(`/api/shopping-lists/${list.id}/items/${editing.id}`, { method: "DELETE" });
      setEditing(null);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function clear(all: boolean) {
    if (!list) return;
    if (all && !confirm("Empty the whole list?")) return;
    try {
      await api(`/api/shopping-lists/${list.id}/items?${all ? "all" : "checked"}=true`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  const subtitle = list === undefined ? "" : items.length ? `${ticked} of ${items.length} ticked` : "Nothing on the list yet";

  return (
    <Screen
      title="Shopping list"
      subtitle={subtitle}
      right={
        items.length > 0 ? (
          <button type="button" className="btn btn-quiet" aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>
            {editMode ? "Done" : "Edit"}
          </button>
        ) : undefined
      }
      dockHeight={170}
      dock={
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            void addItem();
          }}
        >
          <label className="sr-only" htmlFor="new-item">Add something else</label>
          <input id="new-item" className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add something else, e.g. 2 lemons" enterKeyHint="done" autoComplete="off" />
          <button type="submit" aria-label="Add to list" disabled={!newItem.trim()}>
            <Icon name="plus" size={24} stroke={2.6} />
          </button>
        </form>
      }
    >
      {items.length > 0 && (
        <div className="progress" aria-hidden="true">
          <i style={{ width: `${Math.round((ticked / items.length) * 100)}%` }} />
        </div>
      )}
      {offline && <p className="offline">No signal — showing the last copy. Ticks save when you&apos;re back online.</p>}
      <main className="screen-body" style={{ paddingTop: 8 }}>
        {list === undefined && <Spinner label="Loading the list…" />}
        {message && <p className="error" role="alert">{message}</p>}
        {list !== undefined && items.length === 0 && (
          <div className="card empty">
            <Icon name="list" size={40} />
            <h2>Nothing to buy</h2>
            <p>Open a recipe and tap “Add to shopping list”, or type something below.</p>
            <Link href="/" className="btn btn-secondary">
              <Icon name="book" /> Recipes
            </Link>
          </div>
        )}
        {list && list.recipes.length > 0 && items.length > 0 && (
          <p className="small muted" style={{ margin: "0 4px" }}>
            For: {list.recipes.map((r) => r.title).join(" · ")}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.category} className="aisle">
            <h2>{g.label}</h2>
            <ul>
              {g.items.map((i) => {
                const from = i.is_manual ? "" : i.source_recipe_ids.map((id) => recipeTitles.get(id)).filter(Boolean).join(", ");
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      className="item"
                      aria-pressed={editMode ? undefined : i.checked}
                      aria-label={editMode ? `Change ${i.name}` : undefined}
                      onClick={() => (editMode ? openEdit(i) : toggle(i))}
                    >
                      {editMode ? (
                        <span className="box" style={{ border: 0, color: "var(--primary)" }}>
                          <Icon name="pencil" size={20} />
                        </span>
                      ) : (
                        <span className="box">{i.checked && <Icon name="check" size={18} stroke={3} />}</span>
                      )}
                      <span className="name">
                        <b>{i.name}</b>
                        {from && <small>{from}</small>}
                      </span>
                      <span className="qty">{i.amount}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {items.length > 0 && (
          <div className="spread" style={{ marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => clear(false)} disabled={!ticked}>
              <Icon name="check" size={18} /> Clear ticked ({ticked})
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => clear(true)}>
              Empty list
            </button>
          </div>
        )}
      </main>
      {editing && (
        <Sheet title="Change item" onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <label className="field">
              What to buy <span className="hint">Amount first, e.g. “3 onions” or “1.5 kg potatoes”</span>
              <input className="input" value={editText} onChange={(e) => setEditText(e.target.value)} autoComplete="off" enterKeyHint="done" />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={!editText.trim()}>
              <Icon name="check" /> Save
            </button>
            <button type="button" className="btn btn-danger btn-block" onClick={removeItem}>
              <Icon name="trash" size={18} /> Remove from list
            </button>
          </form>
        </Sheet>
      )}
    </Screen>
  );
}
