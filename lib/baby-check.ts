// Weaning checks for babies under 12 months, based on NHS Start for Life guidance.
// "avoid" = leave out of the baby's portion; "check" = fine with a tweak.
// This is a prompt for the cook, not medical advice.

export type BabyWarning = {
  level: "avoid" | "check";
  rule: string;
  ingredient: string;
  message: string;
};

type Rule = {
  id: string;
  level: "avoid" | "check";
  match: RegExp;
  unless?: RegExp;
  message: string;
};

const RULES: Rule[] = [
  {
    id: "salt",
    level: "avoid",
    match: /\bsalt\b/,
    unless: /\b(unsalted|low[- ]salt|reduced[- ]salt|salt[- ]free)\b/,
    message: "No added salt for babies — leave it out and season adult portions at the table.",
  },
  {
    id: "honey",
    level: "avoid",
    match: /\bhoney\b/,
    message: "No honey under 12 months (botulism risk), even in cooking.",
  },
  {
    id: "whole-nuts",
    level: "avoid",
    match: /\b(almonds?|walnuts?|cashews?|peanuts?|hazelnuts?|pecans?|pistachios?|pine nuts|macadamias?|brazil nuts?|nuts)\b/,
    unless: /\b(ground|butter|flour|milk|smooth)\b/,
    message: "Whole or chopped nuts are a choking risk under 5 — use ground nuts or smooth nut butter.",
  },
  {
    id: "high-mercury-fish",
    level: "avoid",
    match: /\b(shark|swordfish|marlin)\b/,
    message: "Shark, swordfish and marlin are high in mercury — not for babies.",
  },
  {
    id: "rice-drink",
    level: "avoid",
    match: /\brice (milk|drink)\b/,
    message: "Rice drinks aren't suitable under 5 (arsenic).",
  },
  {
    id: "stock",
    level: "check",
    match: /\b(stock|bouillon|gravy|oxo)\b/,
    unless: /\b(low[- ]salt|salt[- ]free|no[- ]added[- ]salt|unsalted|baby|homemade)\b/,
    message: "Stock cubes and gravy are salty — use low-salt baby stock or take the baby's portion out first.",
  },
  {
    id: "salty-sauces",
    level: "check",
    match: /\b(soy sauce|tamari|fish sauce|oyster sauce|worcestershire|marmite|yeast extract|miso|hoisin|teriyaki)\b/,
    message: "Very salty — leave out of the baby's portion or use a tiny amount.",
  },
  {
    id: "cured-meat",
    level: "check",
    match: /\b(bacon|ham|chorizo|salami|pancetta|prosciutto|pepperoni|smoked salmon|smoked mackerel|kippers?|anchov(y|ies)|gammon)\b/,
    message: "Cured and smoked meat or fish is high in salt — keep baby portions small or skip.",
  },
  {
    id: "sugar",
    level: "check",
    match: /\b(sugar|syrup|treacle|jam|marmalade|condensed milk)\b/,
    unless: /\b(sugar snap|sugar[- ]free|no added sugar)\b/,
    message: "Babies don't need added sugar — reduce it or leave it out of their portion.",
  },
  {
    id: "risky-cheese",
    level: "check",
    match: /\b(brie|camembert|stilton|gorgonzola|roquefort|dolcelatte|blue cheese|unpasteuri[sz]ed|goat'?s cheese|taleggio)\b/,
    message: "Mould-ripened, blue or unpasteurised cheese only if cooked until steaming hot.",
  },
  {
    id: "shellfish",
    level: "check",
    match: /\b(prawns?|shrimp|mussels|clams|oysters|scallops|crab|lobster|squid|langoustines?)\b/,
    message: "Shellfish must be thoroughly cooked — never raw.",
  },
  {
    id: "choking",
    level: "check",
    match: /\b(grapes|cherry tomatoes|blueberries|olives|sausages?|cherries|popcorn|whole peas)\b/,
    message: "Round foods are a choking risk — cut lengthways into quarters.",
  },
  {
    id: "raw-egg",
    level: "check",
    match: /\b(mayo(nnaise)?|aioli|raw eggs?|mousse|hollandaise|tiramisu)\b/,
    message: "Raw or lightly cooked egg only if British Lion-stamped.",
  },
  {
    id: "alcohol",
    level: "check",
    match: /\b(wine|beer|cider|sherry|brandy|rum|vodka|gin|whisk(e)?y|marsala|port|stout|ale)\b/,
    unless: /\bvinegar\b/,
    message: "Alcohol doesn't all cook off — skip it for the baby's portion.",
  },
];

export function babyCheck(ingredients: { name: string; raw?: string | null }[]): BabyWarning[] {
  const warnings: BabyWarning[] = [];
  const seen = new Set<string>();
  for (const ing of ingredients) {
    const text = `${ing.name} ${ing.raw ?? ""}`.toLowerCase();
    for (const rule of RULES) {
      if (!rule.match.test(text) || rule.unless?.test(text)) continue;
      const key = `${rule.id}:${ing.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({ level: rule.level, rule: rule.id, ingredient: ing.name, message: rule.message });
    }
  }
  return warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === "avoid" ? -1 : 1));
}

/** Suggested flags for a draft; the person saving the recipe has the final say. */
export function suggestFlags(r: {
  ingredients: { name: string; raw?: string | null }[];
  instructions: string[];
  total_minutes: number | null;
}) {
  const warnings = babyCheck(r.ingredients);
  const easy =
    r.ingredients.length > 0 &&
    r.ingredients.length <= 10 &&
    r.instructions.length <= 6 &&
    (r.total_minutes === null || r.total_minutes <= 45);
  return {
    easy,
    // Never auto-ticked: only a hint that nothing needs leaving out.
    baby_friendly_ok: !warnings.some((w) => w.level === "avoid"),
    quick: r.total_minutes !== null && r.total_minutes <= 30,
    warnings,
  };
}
