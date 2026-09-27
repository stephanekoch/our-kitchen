export type BabyWarning = { level: "avoid" | "check"; rule: string; ingredient: string; message: string };

export type RecipeSummary = {
  id: string;
  title: string;
  description: string | null;
  servings: number | null;
  total_minutes: number | null;
  baby_friendly: boolean;
  easy: boolean;
  quick: boolean;
  freezes_well: boolean;
  tags: string[];
  tag_ids: string[];
  search_text?: string | null;
  image_url: string | null;
  photo_url: string | null;
  source_type: "manual" | "url" | "photo";
  updated_at: string;
};

export type Ingredient = {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  category: string;
};

export type Recipe = RecipeSummary & {
  prep_minutes: number | null;
  cook_minutes: number | null;
  instructions: string[];
  source_url: string | null;
  photo_path: string | null;
  notes: string | null;
  ingredients: Ingredient[];
};

/** What the Add and Edit screens edit; POSTed/PATCHed to /api/recipes as-is. */
export type Draft = {
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  ingredients: Ingredient[] | string;
  instructions: string[] | string;
  source_type: "manual" | "url" | "photo";
  source_url: string | null;
  image_url: string | null;
  photo_path: string | null;
  photo_url?: string | null;
  baby_friendly: boolean;
  easy: boolean;
  quick?: boolean;
  freezes_well: boolean;
  tags: string[];
  tag_ids?: string[];
  notes: string | null;
};

export type ImportResult = {
  method: "structured-data" | "ai";
  draft: Draft;
  baby_warnings: BabyWarning[];
  existing?: { id: string; title: string } | null;
  photo_url?: string | null;
};

export type ListItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  source_recipe_ids: string[];
  is_manual: boolean;
  checked: boolean;
  amount: string;
};

export type ShoppingList = {
  id: string;
  title: string;
  recipes: { id: string; title: string; servings: number | null }[];
  groups: { category: string; label: string; items: ListItem[] }[];
  checked: ListItem[];
  counts: { total: number; remaining: number };
};

export type TagOption = { id: string; name: string; count: number };
export type TagCategory = { id: string; name: string; options: TagOption[] };
