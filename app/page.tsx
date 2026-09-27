"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlagTags, Photo, Spinner } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/client/api";
import { readCache, writeCache } from "@/lib/client/cache";
import { duration } from "@/lib/client/format";
import { recipesOnList, useKnown } from "@/lib/client/known";
import type { RecipeSummary, ShoppingList } from "@/lib/client/types";

const FILTERS = [
  { id: "baby_friendly", label: "Baby", long: "Baby-friendly" },
  { id: "easy", label: "Easy", long: "Easy" },
  { id: "quick", label: "Quick", long: "Quick" },
  { id: "freezes_well", label: "Freezes", long: "Freezes well" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

export default function Recipes() {
  const [all, setAll] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [on, setOn] = useState<Set<FilterId>>(new Set());
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Record<string, string[]>>({}); // category id → option ids
  const [sheet, setSheet] = useState<string | null>(null); // category id, or "flags"
  const { categories } = useKnown();
  const [onList, setOnList] = useState<Map<string, number | null>>(new Map());

  useEffect(() => {
    const cached = readCache<RecipeSummary[]>("recipes");
    if (cached) setAll(cached);
    api<{ recipes: RecipeSummary[] }>("/api/recipes")
      .then(({ recipes }) => {
        setAll(recipes);
        writeCache("recipes", recipes);
      })
      .catch((e: Error) => setError(e.message));
    setOnList(recipesOnList(readCache<ShoppingList>("list")));
    api<{ list: ShoppingList | null }>("/api/shopping-lists")
      .then(({ list }) => {
        setOnList(recipesOnList(list));
        writeCache("list", list);
      })
      .catch(() => {});
  }, []);


  // Any option within a category; every category you've picked from must match.
  const shown = useMemo(
    () =>
      (all ?? []).filter(
        (r) =>
          [...on].every((f) => r[f]) &&
          Object.values(picked).every((ids) => !ids.length || ids.some((id) => (r.tag_ids ?? []).includes(id))) &&
          true,
      ),
    [all, on, picked],
  );
  const pickedCount = Object.values(picked).reduce((n, ids) => n + ids.length, 0);
  const usedCategories = categories.filter((c) => c.options.length > 0);
  const sheetCategory = usedCategories.find((c) => c.id === sheet) ?? null;
  const toggleOption = (catId: string, optId: string) =>
    setPicked((p) => {
      const cur = p[catId] ?? [];
      return { ...p, [catId]: cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId] };
    });

  const toggle = (f: FilterId) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const subtitle = all === null ? "" : on.size || pickedCount ? `${shown.length} of ${all.length} recipes` : `${all.length} recipes`;

  return (
    <Screen
      title="Recipes"
      subtitle={subtitle}
      right={
        <Link href="/settings" className="icon-btn" aria-label="Settings">
          <Icon name="settings" />
        </Link>
      }
      dockHeight={150}
      dock={
          <div className="filter-row" role="group" aria-label="Search and filters">
            <button type="button" className="chip chip-icon" aria-label="Search recipes" onClick={() => setSearching(true)}>
              <Icon name="search" size={20} />
            </button>
            {usedCategories.map((c) => {
              const n = (picked[c.id] ?? []).length;
              return (
                <button key={c.id} type="button" className="chip chip-pill" aria-pressed={n > 0} aria-haspopup="dialog" onClick={() => setSheet(c.id)}>
                  {n ? `${c.name} · ${n}` : c.name}
                  <Icon name="chevron" size={16} stroke={2.4} />
                </button>
              );
            })}
          </div>
      }
    >
      <main className="screen-body">
        {all === null && !error && <Spinner label="Loading recipes…" />}
        {error && all === null && <p className="error">{error}</p>}
        {all !== null && all.length === 0 && (
          <div className="card empty">
            <Icon name="bowl" size={44} stroke={1.6} />
            <h2>No recipes yet</h2>
            <p>Add one from a link, a photo of a cookbook page, or type it in.</p>
            <Link href="/add" className="btn btn-primary">
              <Icon name="plus" /> Add a recipe
            </Link>
          </div>
        )}
        {all !== null && all.length > 0 && shown.length === 0 && (
          <p className="muted" style={{ margin: "16px 4px" }}>
            Nothing matches. Try fewer filters or a different word.
          </p>
        )}
        <div className="recipe-grid">
          {shown.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="recipe-tile">
              <div className="tile-photo">
                <Photo src={r.photo_url ?? r.image_url} className="thumb-fill" iconSize={40} />
                {onList.has(r.id) && (
                  <span className="tile-badge" title="On the shopping list">
                    <Icon name="cart" size={16} stroke={2.4} />
                    <span className="sr-only">On the shopping list</span>
                  </span>
                )}
              </div>
              <div className="tile-body">
                <h3>{r.title}</h3>
                <div className="recipe-meta">
                  {r.total_minutes != null && <span>{duration(r.total_minutes)}</span>}
                  <FlagTags r={r} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      {sheetCategory && (
        <Sheet title={sheetCategory.name} onClose={() => setSheet(null)}>
          <p className="small muted" style={{ margin: 0 }}>
            Pick as many as you like: recipes matching any of them show.
          </p>
          <div>
            {sheetCategory.options.map((o) => {
              const on_ = (picked[sheetCategory.id] ?? []).includes(o.id);
              return (
                <button key={o.id} type="button" className="optrow" aria-pressed={on_} onClick={() => toggleOption(sheetCategory.id, o.id)}>
                  <span>
                    {o.name} <small>{o.count}</small>
                  </span>
                  <span className="ck">{on_ && <Icon name="check" size={16} stroke={3} />}</span>
                </button>
              );
            })}
          </div>
          <div className="spread">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setPicked((p) => ({ ...p, [sheetCategory.id]: [] }))}
            >
              Clear
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSheet(null)}>
              Show {shown.length} recipe{shown.length === 1 ? "" : "s"}
            </button>
          </div>
        </Sheet>
      )}
      {searching && all && <SearchOverlay recipes={all} onClose={() => setSearching(false)} />}
    </Screen>
  );
}
