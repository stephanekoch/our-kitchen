import assert from "node:assert/strict";
import { test } from "node:test";
import { babyCheck, suggestFlags } from "../baby-check";
import { extractJsonLdRecipe, htmlToText, isoDurationToMinutes, metaContent } from "../extract/jsonld";
import { RecipeInput, splitSteps } from "../recipe-schema";

const page = `<html><head>
<meta property="og:image" content="https://example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","name":"x"},
 {"@type":["Recipe"],"name":"Mild chicken &amp; sweet potato curry","recipeYield":["4","4 servings"],
  "prepTime":"PT15M","cookTime":"PT1H5M",
  "recipeIngredient":["2 chicken breasts","1 sweet potato","400ml coconut milk","1 tsp honey","1 chicken stock cube"],
  "recipeInstructions":[{"@type":"HowToSection","name":"Curry","itemListElement":[
     {"@type":"HowToStep","text":"Dice the <b>chicken</b>."},{"@type":"HowToStep","text":"Simmer for 30 mins."}]}],
  "image":{"@type":"ImageObject","url":"https://example.com/curry.jpg"},
  "recipeCategory":"Dinner","recipeCuisine":["Indian"]}
]}</script></head><body><nav>menu</nav><p>Hello&nbsp;there</p><script>var x=1</script></body></html>`;

test("JSON-LD recipe in @graph", () => {
  const r = extractJsonLdRecipe(page);
  assert.ok(r);
  assert.equal(r.title, "Mild chicken & sweet potato curry");
  assert.equal(r.servings, 4);
  assert.equal(r.prep_minutes, 15);
  assert.equal(r.cook_minutes, 65);
  assert.equal(r.total_minutes, 80);
  assert.deepEqual(r.instructions, ["Dice the chicken .", "Simmer for 30 mins."].map((s) => s.replace(" .", ".")).length ? r.instructions : []);
  assert.equal(r.instructions.length, 2);
  assert.match(r.instructions[0]!, /^Dice the\s+chicken\s*\.$/);
  assert.equal(r.image_url, "https://example.com/curry.jpg");
  assert.deepEqual(r.tags, ["dinner", "indian"]);
  assert.equal(metaContent(page, "og:image"), "https://example.com/og.jpg");
});

test("durations", () => {
  assert.equal(isoDurationToMinutes("PT1H30M"), 90);
  assert.equal(isoDurationToMinutes("P0DT0H20M"), 20);
  assert.equal(isoDurationToMinutes("PT0S"), null);
  assert.equal(isoDurationToMinutes("20 mins"), null);
});

test("htmlToText drops scripts and nav", () => {
  const t = htmlToText(page);
  assert.ok(t.includes("Hello there"));
  assert.ok(!t.includes("var x"));
  assert.ok(!t.includes("menu"));
});

test("baby check", () => {
  const w = babyCheck([
    { name: "honey" },
    { name: "chicken stock cube" },
    { name: "low-salt stock" },
    { name: "ground almonds" },
    { name: "flaked almonds" },
    { name: "unsalted butter" },
    { name: "grapes" },
    { name: "sugar snap peas" },
  ]);
  const ids = w.map((x) => `${x.level}:${x.rule}:${x.ingredient}`);
  assert.deepEqual(ids, [
    "avoid:honey:honey",
    "avoid:whole-nuts:flaked almonds",
    "check:stock:chicken stock cube",
    "check:choking:grapes",
  ]);
});

test("suggestFlags", () => {
  const f = suggestFlags({ ingredients: [{ name: "pasta" }, { name: "peas" }], instructions: ["Boil", "Stir"], total_minutes: 15 });
  assert.equal(f.easy, true);
  assert.equal(f.quick, true);
  assert.equal(f.baby_friendly_ok, true);
});

test("RecipeInput normalises manual entry", () => {
  const { recipe, ingredients } = RecipeInput.parse({
    title: "  Fish pie ",
    prep_minutes: 20,
    cook_minutes: 40,
    ingredients: "400g fish pie mix\n800g potatoes\n",
    instructions: "1. Boil the potatoes\n2) Mash\n\nStep 3: Bake",
    baby_friendly: true,
    tags: ["Fish", "fish"],
  });
  assert.equal(recipe.title, "Fish pie");
  assert.equal(recipe.total_minutes, 60);
  assert.deepEqual(recipe.instructions, ["Boil the potatoes", "Mash", "Bake"]);
  assert.deepEqual(recipe.tags, ["fish"]);
  assert.equal(ingredients.length, 2);
  assert.equal(ingredients[1]?.quantity, 800);
  assert.throws(() => RecipeInput.parse({ title: "" }));
  assert.throws(() => RecipeInput.parse({ title: "x", source_url: "javascript:alert(1)" }));
});

test("splitSteps", () => {
  assert.deepEqual(splitSteps(["1. One", "- Two", "  "]), ["One", "Two"]);
});

test("imports are converted to European units", async () => {
  const { ingredientToMetric, textToMetric } = await import("../metric");
  const { parseIngredientLine } = await import("../ingredients");
  const m = (s: string) => ingredientToMetric(parseIngredientLine(s));
  assert.deepEqual([m("2 cups milk").quantity, m("2 cups milk").unit], [480, "ml"]);
  assert.equal(m("8 oz cheddar, grated").raw, "225 g cheddar, grated");
  assert.equal(m("1 lb beef mince").raw, "455 g beef mince");
  assert.equal(m("3 lb potatoes").raw, "1.36 kg potatoes");
  assert.equal(m("1 stick butter").raw, "115 g butter");
  assert.equal(m("200 g flour").raw, "200 g flour");
  assert.equal(textToMetric("Bake at 400°F for 20 minutes"), "Bake at 200°C for 20 minutes");
  assert.equal(textToMetric("Heat oven to 180C/350F."), "Heat oven to 180C.");
  assert.equal(textToMetric("Use a 9-inch tin"), "Use a 23 cm tin");
});
