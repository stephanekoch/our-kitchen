"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { readCache, writeCache } from "./cache";
import type { TagCategory } from "./types";

export type KnownIngredient = { key: string; name: string; count: number };
export type KnownTag = { tag: string; count: number }; // single-level tags (before v1.3)

/** The household's ingredient names and tags, for suggestions while typing. Cached for offline use. */
export function useKnown() {
  const [ingredients, setIngredients] = useState<KnownIngredient[]>([]);
  const [tags] = useState<KnownTag[]>([]);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  useEffect(() => {
    setIngredients(readCache<KnownIngredient[]>("ingredients") ?? []);
    setCategories(readCache<TagCategory[]>("categories") ?? []);
    api<{ ingredients: KnownIngredient[] }>("/api/ingredients")
      .then((d) => {
        setIngredients(d.ingredients);
        writeCache("ingredients", d.ingredients);
      })
      .catch(() => {});
    api<{ categories: TagCategory[] }>("/api/tags")
      .then((d) => {
        setCategories(d.categories);
        writeCache("categories", d.categories);
      })
      .catch(() => {});
  }, []);
  return { ingredients, tags, categories };
}

/** Recipes on the shopping list, with the portions you're shopping for. */
export function recipesOnList(list: { recipes: { id: string; servings: number | null }[] } | null | undefined): Map<string, number | null> {
  return new Map((list?.recipes ?? []).map((r) => [r.id, r.servings]));
}
