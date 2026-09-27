import { categorise, CATEGORIES, type Category } from "./categories";

export type Ingredient = {
  raw: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  category: Category;
};

const FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5",
  "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Canonical unit → spellings. Longest spellings are tried first.
const UNIT_ALIASES: Record<string, string[]> = {
  g: ["g", "gr", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"],
  ml: ["ml", "mls", "millilitre", "millilitres", "milliliter", "milliliters"],
  l: ["l", "litre", "litres", "liter", "liters", "ltr"],
  tsp: ["tsp", "tsps", "teaspoon", "teaspoons", "tspn"],
  tbsp: ["tbsp", "tbsps", "tbs", "tbls", "tablespoon", "tablespoons", "tbspn"],
  cup: ["cup", "cups"],
  oz: ["oz", "ounce", "ounces"],
  fl_oz: ["fl oz", "fl. oz", "fluid ounce", "fluid ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  pint: ["pint", "pints", "pt"],
  clove: ["clove", "cloves"],
  tin: ["tin", "tins", "can", "cans"],
  jar: ["jar", "jars"],
  pack: ["pack", "packs", "packet", "packets", "pkt"],
  bag: ["bag", "bags"],
  bunch: ["bunch", "bunches"],
  handful: ["handful", "handfuls"],
  pinch: ["pinch", "pinches"],
  knob: ["knob", "knobs"],
  slice: ["slice", "slices"],
  sprig: ["sprig", "sprigs"],
  stick: ["stick", "sticks"],
  piece: ["piece", "pieces"],
  head: ["head", "heads"],
  sheet: ["sheet", "sheets"],
  dash: ["dash", "dashes", "splash", "drizzle"],
};

const UNIT_LOOKUP = new Map<string, string>();
for (const [canonical, spellings] of Object.entries(UNIT_ALIASES)) {
  for (const s of spellings) UNIT_LOOKUP.set(s, canonical);
}
const UNIT_PATTERN = [...UNIT_LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[.]/g, "\\."))
  .join("|");

const METRIC = new Set(["g", "kg", "ml", "l"]);

export const CONTAINER_UNITS = new Set(["tin", "jar", "pack", "bag"]);
export const WEIGHT_VOLUME_UNITS = new Set(["g", "kg", "ml", "l", "oz", "lb", "fl_oz", "pint"]);

// Mixed numbers and fractions first, or "1/2" would match as "1".
const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|—|to|or)\s*(${NUM}))?`, "i");
const UNIT_RE = new RegExp(String.raw`^(?:(?:heaped|level|rounded|generous|large|small|medium|big)\s+)?(${UNIT_PATTERN})\.?(?=[\s,.)]|$)\s*(?:of\s+)?`, "i");
const SIZE_RE = new RegExp(String.raw`^(?:x\s*)?(${NUM})\s*(g|kg|ml|l|oz|lb)\b\s*`, "i");

function toNumber(s: string): number {
  const t = s.trim().replace(",", ".");
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t);
}

function normaliseText(s: string): string {
  return s
    .replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => FRACTIONS[c] ?? c)
    .replace(/\u2044/g, "/") // fraction slash
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Parse one ingredient line like "2 x 400g tins chopped tomatoes" or "1½ tsp ground cumin". */
export function parseIngredientLine(line: string): Ingredient {
  const raw = normaliseText(line.replace(/^\s*(?:[-•*·▢□☐]|\d+[.)](?=\s))\s*/, ""));
  let rest = raw;
  const notes: string[] = [];

  // Parenthetical asides become notes: "1 onion (finely chopped)".
  rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  rest = rest.replace(/\s+/g, " ").trim();

  // "juice of 1 lemon", "zest and juice of 2 limes"
  const juice = rest.match(/^((?:zest|juice|zest and juice|juice and zest|grated zest)\s+of)\s+(.*)$/i);
  if (juice?.[1] && juice[2]) {
    notes.push(juice[1].replace(/\s+of$/i, "").toLowerCase());
    rest = juice[2];
  }

  // Everything after the first comma is preparation: "2 carrots, peeled and diced".
  const comma = rest.indexOf(",");
  if (comma > 0) {
    const tail = rest.slice(comma + 1).trim();
    if (tail) notes.push(tail);
    rest = rest.slice(0, comma).trim();
  }

  // Trailing "to taste" / "optional" / "to serve".
  rest = rest.replace(/\s*\b(to taste|optional|to serve|for (frying|greasing|serving|dusting|the tin))\b\.?$/i, (m) => {
    notes.push(m.trim());
    return "";
  });

  let quantity: number | null = null;
  let unit: string | null = null;

  const q = rest.match(QTY_RE);
  if (q?.[1]) {
    const hi = q[2] ?? q[1]; // ranges: plan for the upper end
    quantity = toNumber(hi);
    rest = rest.slice(q[0].length).trim();
  } else {
    const article = rest.match(/^(a|an|one)\s+(?=\S)/i);
    if (article) {
      quantity = 1;
      rest = rest.slice(article[0].length);
    }
  }

  // "2 x 400g tins chickpeas" / "1 400g tin tomatoes" / "400g tin tomatoes"
  if (quantity !== null) {
    const size = rest.match(SIZE_RE);
    if (size?.[1] && size[2]) {
      const after = rest.slice(size[0].length);
      const container = after.match(UNIT_RE);
      const containerUnit = container?.[1] ? UNIT_LOOKUP.get(container[1].toLowerCase()) : undefined;
      if (containerUnit && CONTAINER_UNITS.has(containerUnit)) {
        notes.unshift(`${size[1]}${size[2].toLowerCase()}`);
        unit = containerUnit;
        rest = after.slice(container![0].length);
      } else if (/^x/i.test(size[0])) {
        notes.unshift(`${size[1]}${size[2].toLowerCase()} each`);
        rest = after;
      }
    }
  }

  if (quantity !== null && unit === null) {
    const u = rest.match(UNIT_RE);
    if (u?.[1]) {
      unit = UNIT_LOOKUP.get(u[1].toLowerCase()) ?? null;
      rest = rest.slice(u[0].length);
      // "400g tin chopped tomatoes" → 1 tin, note 400g
      if (unit && WEIGHT_VOLUME_UNITS.has(unit)) {
        const container = rest.match(UNIT_RE);
        const cu = container?.[1] ? UNIT_LOOKUP.get(container[1].toLowerCase()) : undefined;
        if (cu && CONTAINER_UNITS.has(cu)) {
          notes.unshift(`${formatNumber(quantity)}${unit}`);
          quantity = 1;
          unit = cu;
          rest = rest.slice(container![0].length);
        }
      }
    }
  } else if (quantity === null) {
    // "pinch of salt", "handful of spinach"
    const u = rest.match(new RegExp(String.raw`^(pinch|handful|knob|dash|splash|drizzle|sprig|bunch)\s+(?:of\s+)?`, "i"));
    if (u?.[1]) {
      unit = UNIT_LOOKUP.get(u[1].toLowerCase()) ?? null;
      quantity = 1;
      rest = rest.slice(u[0].length);
    }
  }

  let name = rest.replace(/^of\s+/i, "").replace(/\s+/g, " ").trim();

  // "2 garlic cloves" → 2 clove garlic
  if (unit === null) {
    const trailing = name.match(/^(.*\S)\s+(cloves?|bulbs?|sticks?|stalks?)$/i);
    if (trailing?.[1] && trailing[2] && quantity !== null) {
      const u = trailing[2].toLowerCase().replace(/s$/, "");
      unit = u === "stalk" ? "stick" : u === "bulb" ? "head" : u;
      name = trailing[1];
    }
  }

  if (!name) name = raw;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) quantity = null;

  return {
    raw,
    quantity: quantity === null ? null : round3(quantity),
    unit,
    name,
    note: notes.length ? notes.join("; ") : null,
    category: categorise(name),
  };
}

// Words that describe preparation or size rather than what you buy.
const DESCRIPTORS = new Set([
  "large", "small", "medium", "big", "fresh", "freshly", "finely", "roughly", "thinly", "coarsely",
  "chopped", "diced", "sliced", "minced", "crushed", "grated", "shredded", "peeled", "deseeded",
  "trimmed", "halved", "quartered", "ripe", "free-range", "free", "range", "organic", "boneless",
  "skinless", "skin-on", "whole", "good", "quality", "good-quality", "heaped", "level", "rounded",
  "extra", "about", "approx", "approximately", "washed", "rinsed", "drained", "softened", "melted",
  "beaten", "lightly", "cooked", "uncooked", "raw", "room", "temperature", "cold", "warm", "boiling",
  "virgin", "extra-virgin", "handful", "optional",
]);

const IRREGULAR: Record<string, string> = {
  leaves: "leaf", loaves: "loaf", knives: "knife", halves: "half", tomatoes: "tomato",
  potatoes: "potato", mangoes: "mango", chillies: "chilli", chilies: "chili", anchovies: "anchovy",
  cherries: "cherry", berries: "berry", peaches: "peach", radishes: "radish", sandwiches: "sandwich",
  dishes: "dish", boxes: "box", molasses: "molasses", asparagus: "asparagus", hummus: "hummus",
  couscous: "couscous", swiss: "swiss", citrus: "citrus", octopus: "octopus", lemongrass: "lemongrass",
  oats: "oats", grits: "grits", noodles: "noodles", peas: "peas", chickpeas: "chickpeas",
  lentils: "lentils", sprouts: "sprouts", greens: "greens", herbs: "herbs", nuts: "nuts",
  breadcrumbs: "breadcrumbs", flakes: "flakes", seeds: "seeds", sultanas: "sultanas", raisins: "raisins",
  crisps: "crisps", beans: "beans", pois: "pois",
};

export function singularise(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Key used to merge "Red onions" and "1 large red onion" onto one shopping line. */
export function nameKey(name: string): string {
  const lower = name.toLowerCase();
  // Products whose "descriptor" is part of what you buy.
  if (/\bchopped tomato/.test(lower)) return "chopped tomato";
  const words = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/'s\b/g, "")
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w) && w !== "of" && w !== "and" && w !== "the");
  if (!words.length) return name.toLowerCase().trim();
  const last = words.length - 1;
  words[last] = singularise(words[last]!);
  let key = words.join(" ");
  for (const [re, to] of SYNONYMS) key = key.replace(re, to);
  return key;
}

// Different names for the same thing you buy (mostly US recipe names → UK shop names).
const SYNONYMS: [RegExp, string][] = [
  [/\b(scallion|green onion|salad onion)\b/, "spring onion"],
  [/\bzucchini\b/, "courgette"],
  [/\bcilantro\b/, "coriander"],
  [/\beggplant\b/, "aubergine"],
  [/\barugula\b/, "rocket"],
  [/\bbell pepper\b/, "pepper"],
  [/\bcapsicum\b/, "pepper"],
  [/\bgarbanzo beans\b/, "chickpeas"],
  [/\b(ground beef|minced beef)\b/, "beef mince"],
  [/\b(ground pork|minced pork)\b/, "pork mince"],
  [/\b(ground turkey|minced turkey)\b/, "turkey mince"],
  [/\b(ground lamb|minced lamb)\b/, "lamb mince"],
  [/\bheavy cream\b/, "double cream"],
  [/\blight cream\b/, "single cream"],
  [/\b(powdered sugar|confectioners sugar|confectioner sugar)\b/, "icing sugar"],
  [/\bsuperfine sugar\b/, "caster sugar"],
  [/\bcornstarch\b/, "cornflour"],
  [/\bshrimp\b/, "prawn"],
  [/\brutabaga\b/, "swede"],
  [/\b(baking soda|bicarbonate of soda|bicarb)\b/, "bicarbonate of soda"],
  [/\ball[- ]purpose flour\b/, "plain flour"],
  [/\bself[- ]rising flour\b/, "self-raising flour"],
  [/\bsnow pea\b/, "mangetout"],
  [/\bbeet\b/, "beetroot"],
  [/\bchili\b/, "chilli"],
];

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export type IngredientInput =
  | string
  | {
      raw?: string | null;
      quantity?: number | null;
      unit?: string | null;
      name?: string | null;
      note?: string | null;
      category?: string | null;
    };

/** Turn free text, lines or partial objects into clean ingredient rows. */
export function normalizeIngredients(input: string | IngredientInput[]): Ingredient[] {
  const items = typeof input === "string" ? input.split(/\r?\n/) : input;
  const out: Ingredient[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (!item.trim() || /^[A-Z][^:]{0,40}:$/.test(item.trim())) continue; // blank or "For the sauce:"
      out.push(parseIngredientLine(item));
      continue;
    }
    const name = item.name?.trim();
    const rawText = item.raw?.trim();
    if (!name && !rawText) continue;
    if (!name) {
      out.push(parseIngredientLine(rawText!));
      continue;
    }
    const unit = item.unit ? (UNIT_LOOKUP.get(item.unit.toLowerCase().trim()) ?? item.unit.toLowerCase().trim()) : null;
    const category = CATEGORIES.includes(item.category as Category) ? (item.category as Category) : categorise(name);
    const raw =
      rawText ||
      [
        item.quantity != null ? formatNumber(item.quantity) + (unit && METRIC.has(unit) ? unit : "") : "",
        unit && !METRIC.has(unit) ? unit : "",
        name,
        item.note ? `, ${item.note}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .replace(" ,", ",");
    out.push({
      raw,
      quantity: item.quantity != null && item.quantity > 0 ? round3(item.quantity) : null,
      unit,
      name,
      note: item.note?.trim() || null,
      category,
    });
  }
  return out;
}
