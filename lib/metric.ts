import type { Ingredient } from "./ingredients";
import { formatNumber } from "./ingredients";

// Everything is stored in European units: g, kg, ml, l (tsp and tbsp stay, they're metric spoons).
const TO_METRIC: Record<string, [string, number]> = {
  oz: ["g", 28.35],
  lb: ["g", 453.6],
  cup: ["ml", 240],
  fl_oz: ["ml", 29.57],
  pint: ["ml", 568],
};

function roundMetric(v: number): number {
  if (v < 20) return Math.round(v);
  if (v < 500) return Math.round(v / 5) * 5;
  return Math.round(v / 10) * 10;
}

export function ingredientToMetric(i: Ingredient): Ingredient {
  let unit = i.unit;
  let quantity = i.quantity;
  if (quantity != null && unit === "stick" && /butter/i.test(i.name)) {
    [quantity, unit] = [quantity * 113, "g"];
  } else if (quantity != null && unit && TO_METRIC[unit]) {
    const [to, factor] = TO_METRIC[unit]!;
    [quantity, unit] = [quantity * factor, to];
  } else {
    return i;
  }
  quantity = roundMetric(quantity);
  if (quantity >= 1000) [quantity, unit] = [quantity / 1000, unit === "g" ? "kg" : "l"];
  const raw = `${formatNumber(quantity)}${unit} ${i.name}${i.note ? `, ${i.note}` : ""}`;
  return { ...i, quantity, unit, raw };
}

const fToC = (f: number) => Math.round(((f - 32) * 5) / 9 / 10) * 10;

/** "Bake at 400°F in a 9-inch tin" → "Bake at 200°C in a 23 cm tin". */
export function textToMetric(s: string): string {
  return s
    .replace(/(\d{2,3}\s*°?\s*C)\s*(?:\/|\(|,|or)\s*\d{3}\s*°?\s*F\)?/gi, "$1") // "180C/350F" → "180C"
    .replace(/(\d{3})\s*(?:°|degrees?)?\s*(?:F|Fahrenheit)\b/gi, (_, f: string) => `${fToC(Number(f))}°C`)
    .replace(/(\d+(?:\.\d+)?)\s*-?\s*(?:inch|inches)\b|(\d+(?:\.\d+)?)"/gi, (_, a: string, b: string) => `${Math.round(Number(a ?? b) * 2.54)} cm`);
}
