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

/** Recipes on the shopping list, with the portions you're shopping for. */
export function recipesOnList(list: { recipes: { id: string; servings: number | null }[] } | null | undefined): Map<string, number | null> {
  return new Map((list?.recipes ?? []).map((r) => [r.id, r.servings]));
}
