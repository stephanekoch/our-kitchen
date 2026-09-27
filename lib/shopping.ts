import { categoryRank } from "./categories";
import { formatNumber, nameKey } from "./ingredients";

export type ShoppingSource = {
  id: string;
  servings: number | null; // what the recipe makes
  target?: number | null; // what you want to cook
  ingredients: { name: string; quantity: number | string | null; unit: string | null; category: string }[];
};

export type ShoppingLine = {
  name: string;
  name_key: string;
  quantity: number | null; // null = "just need some"
  unit: string | null;
  category: string;
  source_recipe_ids: string[];
};

// Things every kitchen has; they never go on the list.
const SKIP =
  /^(?:(?:sea|table|flaky|rock|kosher|fine) )?salt(?: flakes?)?$|^(?:freshly )?(?:(?:ground|cracked) )?(?:black |white )?pepper$|^salt (?:and |& )?(?:freshly )?(?:ground )?(?:black )?pepper$|^(?:tap |cold |boiling |warm |hot )?water$|^ice(?: cubes?)?$/;

// Spoon and pinch amounts mean "make sure we have some", not a quantity to buy.
const PRESENCE_UNITS = new Set(["tsp", "tbsp", "pinch", "handful", "dash", "sprig", "knob"]);

const TO_BASE: Record<string, [string, number]> = {
  g: ["g", 1],
  kg: ["g", 1000],
  oz: ["g", 28.35],
  lb: ["g", 453.6],
  ml: ["ml", 1],
  l: ["ml", 1000],
  cup: ["ml", 250],
  pint: ["ml", 568],
  fl_oz: ["ml", 28.4],
};

function roundForShop(q: number, unit: string | null): number {
  if (unit === "g" || unit === "ml") {
    if (q >= 100) return Math.ceil(q / 10 - 1e-9) * 10;
    return Math.ceil(q - 1e-9);
  }
  // Counts of things you buy whole: onions, tins, cloves, packs…
  return Math.ceil(q - 1e-9);
}

/** Scale, convert and merge the ingredients of several recipes into shopping lines. */
export function buildShoppingLines(sources: ShoppingSource[]): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine>();

  for (const src of sources) {
    const scale = src.target && src.servings ? src.target / src.servings : 1;
    for (const ing of src.ingredients) {
      const key = nameKey(ing.name);
      if (!key || SKIP.test(key) || SKIP.test(ing.name.toLowerCase().trim())) continue;

      let unit = ing.unit;
      let quantity = ing.quantity == null ? null : Number(ing.quantity);
      if (quantity !== null && !Number.isFinite(quantity)) quantity = null;

      if (ing.category === "spices" || (unit && PRESENCE_UNITS.has(unit))) {
        unit = null;
        quantity = null;
      } else if (unit && TO_BASE[unit]) {
        const [base, factor] = TO_BASE[unit]!;
        unit = base;
        quantity = quantity === null ? null : quantity * factor;
      }
      if (quantity !== null) quantity *= scale;

      const mapKey = `${key}|${unit ?? ""}`;
      const existing = lines.get(mapKey);
      if (existing) {
        existing.quantity =
          existing.quantity === null || quantity === null
            ? (existing.quantity ?? quantity)
            : existing.quantity + quantity;
        if (!existing.source_recipe_ids.includes(src.id)) existing.source_recipe_ids.push(src.id);
      } else {
        lines.set(mapKey, {
          name: tidyName(ing.name),
          name_key: key,
          quantity,
          unit,
          category: ing.category,
          source_recipe_ids: [src.id],
        });
      }
    }
  }

  // A bare "olive oil" line is redundant when "olive oil 500 ml" is already there.
  const byKey = new Map<string, ShoppingLine[]>();
  for (const line of lines.values()) {
    byKey.set(line.name_key, [...(byKey.get(line.name_key) ?? []), line]);
  }
  const out: ShoppingLine[] = [];
  for (const group of byKey.values()) {
    const measured = group.filter((l) => l.quantity !== null);
    const bare = group.filter((l) => l.quantity === null);
    if (measured.length && bare.length) {
      for (const b of bare) {
        for (const id of b.source_recipe_ids) {
          if (!measured[0]!.source_recipe_ids.includes(id)) measured[0]!.source_recipe_ids.push(id);
        }
      }
      out.push(...measured);
    } else {
      out.push(...group);
    }
  }

  for (const line of out) {
    if (line.quantity !== null) line.quantity = roundForShop(line.quantity, line.unit);
  }

  return out.sort(
    (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, "en-GB"),
  );
}

function tidyName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  return n.charAt(0).toUpperCase() + n.slice(1);
}

const UNIT_LABELS: Record<string, [string, string]> = {
  clove: ["clove", "cloves"],
  tin: ["tin", "tins"],
  jar: ["jar", "jars"],
  pack: ["pack", "packs"],
  bag: ["bag", "bags"],
  bunch: ["bunch", "bunches"],
  slice: ["slice", "slices"],
  stick: ["stick", "sticks"],
  piece: ["piece", "pieces"],
  head: ["head", "heads"],
  sheet: ["sheet", "sheets"],
};

/** "400g", "1.2kg", "3 tins", "2" — empty string when there's no quantity. */
export function formatQuantity(quantity: number | string | null, unit: string | null): string {
  if (quantity == null) return "";
  const q = Number(quantity);
  if (!Number.isFinite(q)) return "";
  // Metric amounts are written joined up: 120ml, 1l, 250g, 1.5kg.
  if (unit === "g") return q >= 1000 ? `${formatNumber(Math.round(q / 100) / 10)}kg` : `${formatNumber(q)}g`;
  if (unit === "ml") return q >= 1000 ? `${formatNumber(Math.round(q / 100) / 10)}l` : `${formatNumber(q)}ml`;
  if (unit === "kg" || unit === "l") return `${formatNumber(q)}${unit}`;
  if (!unit) return formatNumber(q);
  const label = UNIT_LABELS[unit];
  if (label) return `${formatNumber(q)} ${q === 1 ? label[0] : label[1]}`;
  return `${formatNumber(q)} ${unit}`;
}
