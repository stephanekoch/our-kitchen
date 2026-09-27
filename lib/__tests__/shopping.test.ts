import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIngredientLine } from "../ingredients";
import { buildShoppingLines, formatQuantity } from "../shopping";

const recipe = (id: string, servings: number | null, lines: string[], target?: number) => ({
  id,
  servings,
  target,
  ingredients: lines.map(parseIngredientLine),
});

test("merges, converts, scales and skips pantry basics", () => {
  const lines = buildShoppingLines([
    recipe("a", 4, ["2 red onions", "500g beef mince", "1 tbsp olive oil", "Salt and pepper", "1 tsp ground cumin", "2 x 400g tins chopped tomatoes"]),
    recipe("b", 2, ["1 red onion, sliced", "0.5kg beef mince", "200ml olive oil", "1 tin chopped tomatoes", "water"], 4),
  ]);
  const by = (n: string) => lines.find((l) => l.name_key === n);

  assert.equal(by("red onion")?.quantity, 4); // 2 + 1×2
  assert.equal(by("red onion")?.unit, null);
  assert.equal(by("beef mince")?.quantity, 1500); // 500 + 500×2
  assert.equal(by("beef mince")?.unit, "g");
  assert.equal(by("chopped tomato")?.quantity, 4); // 2 + 1×2
  assert.equal(by("chopped tomato")?.unit, "tin");
  assert.deepEqual(by("chopped tomato")?.source_recipe_ids, ["a", "b"]);
  // Spoonful of oil folds into the measured oil line.
  const oil = lines.filter((l) => l.name_key === "olive oil");
  assert.equal(oil.length, 1);
  assert.equal(oil[0]?.quantity, 400);
  assert.deepEqual(oil[0]?.source_recipe_ids, ["b", "a"]);
  // Spices become "have some"; salt, pepper and water are dropped.
  assert.equal(by("ground cumin")?.quantity, null);
  assert.equal(lines.some((l) => /salt|pepper|water/.test(l.name_key)), false);
  // Shop-walk order: veg first.
  assert.equal(lines[0]?.category, "produce");
});

test("formatQuantity", () => {
  assert.equal(formatQuantity(1500, "g"), "1.5 kg");
  assert.equal(formatQuantity(400, "ml"), "400 ml");
  assert.equal(formatQuantity(3, "tin"), "3 tins");
  assert.equal(formatQuantity(1, "clove"), "1 clove");
  assert.equal(formatQuantity(2, null), "2");
  assert.equal(formatQuantity(null, null), "");
});
