const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/** 1.5 → "1½", 0.25 → "¼", 2.97 → "3" */
export function niceNumber(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.08) return whole > 0 ? String(whole) : String(Math.round(n * 100) / 100);
  if (frac > 0.92) return String(whole + 1);
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  return `${whole || ""}${best[1]}`;
}

const PLURALS: Record<string, [string, string]> = {
  clove: ["clove", "cloves"], tin: ["tin", "tins"], jar: ["jar", "jars"], pack: ["pack", "packs"],
  bag: ["bag", "bags"], bunch: ["bunch", "bunches"], handful: ["handful", "handfuls"],
  pinch: ["pinch", "pinches"], knob: ["knob", "knobs"], slice: ["slice", "slices"],
  sprig: ["sprig", "sprigs"], stick: ["stick", "sticks"], piece: ["piece", "pieces"],
  head: ["head", "heads"], sheet: ["sheet", "sheets"], cup: ["cup", "cups"], pint: ["pint", "pints"],
  dash: ["dash", "dashes"],
};

/** Amount for an ingredient, scaled for the servings you're cooking. */
export function amount(quantity: number | string | null, unit: string | null, factor = 1): string {
  if (quantity == null) return "";
  const v = Number(quantity) * factor;
  if (!Number.isFinite(v)) return "";
  if (unit === "g" || unit === "ml") {
    if (v >= 1000) return `${Math.round(v / 100) / 10} ${unit === "g" ? "kg" : "l"}`;
    return `${v >= 100 ? Math.round(v / 5) * 5 : Math.max(1, Math.round(v))} ${unit}`;
  }
  if (unit === "kg" || unit === "l") return `${Math.round(v * 100) / 100} ${unit}`;
  if (unit === "fl_oz") return `${niceNumber(v)} fl oz`;
  const n = niceNumber(v);
  if (!unit) return n;
  const p = PLURALS[unit];
  if (p) return `${n} ${v > 1 ? p[1] : p[0]}`;
  return `${n} ${unit}`;
}

export function duration(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m}` : `${h} hr`;
}
