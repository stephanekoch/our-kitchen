export type ExtractedRecipe = {
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  ingredients: string[];
  instructions: string[];
  image_url: string | null;
  tags: string[];
};

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", deg: "°", frac12: "½",
  frac14: "¼", frac34: "¾", eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", aacute: "á",
  ccedil: "ç", iuml: "ï", icirc: "î", ouml: "ö", uuml: "ü", auml: "ä", ntilde: "ñ", times: "×",
  pound: "£", euro: "€", reg: "®", copy: "©", trade: "™", bull: "•", middot: "·", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Strip tags and entities from a JSON-LD string field (some sites put HTML in there). */
export function cleanText(s: unknown): string {
  if (typeof s !== "string") return "";
  return decodeEntities(decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** ISO 8601 duration ("PT1H30M", "P0DT0H20M") → minutes. */
export function isoDurationToMinutes(d: unknown): number | null {
  if (typeof d !== "string") return null;
  const m = d.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return null;
  const [, days, hours, mins, secs] = m;
  const total = Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(mins ?? 0) + Number(secs ?? 0) / 60;
  if (!Number.isFinite(total) || total <= 0 || total > 2880) return null;
  return Math.round(total);
}

export function parseYield(y: unknown): number | null {
  const values = Array.isArray(y) ? y : [y];
  for (const v of values) {
    if (typeof v === "number" && v > 0) return Math.min(50, Math.round(v));
    if (typeof v === "string") {
      const m = v.match(/\d+/);
      if (m) {
        const n = Number(m[0]);
        if (n > 0 && n <= 50) return n;
      }
    }
  }
  return null;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t === type || t.endsWith(`/${type}`);
  return Array.isArray(t) && t.some((x) => typeof x === "string" && (x === type || x.endsWith(`/${type}`)));
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipe(n, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (hasType(obj, "Recipe")) return obj;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const found = findRecipe(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function flattenInstructions(node: unknown, out: string[] = []): string[] {
  if (!node) return out;
  if (typeof node === "string") {
    const text = cleanText(node);
    // A single blob: split on newlines, or on sentence-ish step numbers.
    for (const line of text.split(/\n+|(?:^|\s)(?=\d+\.\s)/)) {
      const s = line.replace(/^\d+\.\s*/, "").trim();
      if (s) out.push(s);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) flattenInstructions(n, out);
    return out;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (hasType(obj, "HowToSection") || Array.isArray(obj.itemListElement)) {
      flattenInstructions(obj.itemListElement, out);
      return out;
    }
    const text = cleanText(obj.text ?? obj.name ?? obj.description);
    if (text) out.push(text.replace(/\n+/g, " "));
  }
  return out;
}

function firstImage(img: unknown): string | null {
  if (!img) return null;
  if (typeof img === "string") return /^https?:\/\//.test(img) ? img : null;
  if (Array.isArray(img)) {
    for (const i of img) {
      const url = firstImage(i);
      if (url) return url;
    }
    return null;
  }
  if (typeof img === "object") {
    const o = img as Record<string, unknown>;
    return firstImage(o.url ?? o.contentUrl ?? o["@id"]);
  }
  return null;
}

function stringList(v: unknown): string[] {
  if (typeof v === "string") return v.split(",").map((s) => cleanText(s)).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(stringList);
  return [];
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Control characters inside strings are a common site bug.
    try {
      return JSON.parse(cleaned.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return null;
    }
  }
}

/** Find a schema.org Recipe in the page's JSON-LD. Most big recipe sites have one. */
export function extractJsonLdRecipe(html: string): ExtractedRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    const data = parseJsonLoose(block[1] ?? "");
    const r = findRecipe(data);
    if (!r) continue;

    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
      .map((i: unknown) => cleanText(i))
      .filter(Boolean);
    const instructions = flattenInstructions(r.recipeInstructions);
    const title = cleanText(r.name) || cleanText(r.headline);
    if (!title) continue;

    const prep = isoDurationToMinutes(r.prepTime);
    const cook = isoDurationToMinutes(r.cookTime);
    const tags = [...stringList(r.recipeCategory), ...stringList(r.recipeCuisine)]
      .map((t) => t.toLowerCase())
      .filter((t, i, a) => t.length <= 40 && a.indexOf(t) === i)
      .slice(0, 5);

    return {
      title: title.slice(0, 200),
      description: cleanText(r.description).slice(0, 2000) || null,
      servings: parseYield(r.recipeYield ?? r.yield),
      prep_minutes: prep,
      cook_minutes: cook,
      total_minutes: isoDurationToMinutes(r.totalTime) ?? (prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null),
      ingredients: ingredients.slice(0, 80),
      instructions: instructions.slice(0, 60),
      image_url: firstImage(r.image),
      tags,
    };
  }
  return null;
}

export function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v ? decodeEntities(v) : null;
}

/** Readable text of a page for the model: no scripts, styles or markup; capped. */
export function htmlToText(html: string, cap = 40_000): string {
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template|canvas)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|li|h[1-6]|br|tr|section|article|ul|ol|table|header)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, cap);
}
