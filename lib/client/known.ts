"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { readCache, writeCache } from "./cache";

export type KnownIngredient = { key: string; name: string; count: number };
export type KnownTag = { tag: string; count: number };

/** The household's ingredient names and tags, for suggestions while typing. Cached for offline use. */
export function useKnown() {
  const [ingredients, setIngredients] = useState<KnownIngredient[]>([]);
  const [tags, setTags] = useState<KnownTag[]>([]);
  useEffect(() => {
    setIngredients(readCache<KnownIngredient[]>("ingredients") ?? []);
    setTags(readCache<KnownTag[]>("tags") ?? []);
    api<{ ingredients: KnownIngredient[] }>("/api/ingredients")
      .then((d) => {
        setIngredients(d.ingredients);
        writeCache("ingredients", d.ingredients);
      })
      .catch(() => {});
    api<{ tags: KnownTag[] }>("/api/tags")
      .then((d) => {
        setTags(d.tags);
        writeCache("tags", d.tags);
      })
      .catch(() => {});
  }, []);
  return { ingredients, tags };
}

/** Recipes with something still to buy on the list (ticked-off items don't count). */
export function recipesOnList(list: { groups: { items: { source_recipe_ids: string[] }[] }[] } | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const g of list?.groups ?? []) for (const i of g.items) for (const id of i.source_recipe_ids) ids.add(id);
  return ids;
}
