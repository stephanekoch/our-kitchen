import assert from "node:assert/strict";
import { test } from "node:test";
import { categorise } from "../categories";
import { nameKey, normalizeIngredients, parseIngredientLine } from "../ingredients";

const cases: [string, Partial<ReturnType<typeof parseIngredientLine>>][] = [
  ["2 tbsp olive oil", { quantity: 2, unit: "tbsp", name: "olive oil", category: "dry_goods" }],
  ["200g plain flour", { quantity: 200, unit: "g", name: "plain flour", category: "dry_goods" }],
  ["1½ tsp ground cumin", { quantity: 1.5, unit: "tsp", name: "ground cumin", category: "spices" }],
  ["½ tsp chilli flakes", { quantity: 0.5, unit: "tsp", name: "chilli flakes", category: "spices" }],
  ["1-2 garlic cloves, crushed", { quantity: 2, unit: "clove", name: "garlic", note: "crushed", category: "produce" }],
  ["3 cloves garlic", { quantity: 3, unit: "clove", name: "garlic" }],
  ["2 x 400g tins chickpeas, drained", { quantity: 2, unit: "tin", name: "chickpeas", note: "400g; drained", category: "tins_jars" }],
  ["1 x 400g tin chopped tomatoes", { quantity: 1, unit: "tin", name: "chopped tomatoes", note: "400g" }],
  ["400g tin chopped tomatoes", { quantity: 1, unit: "tin", name: "chopped tomatoes", note: "400g" }],
  ["1 onion (finely chopped)", { quantity: 1, unit: null, name: "onion", note: "finely chopped", category: "produce" }],
  ["a pinch of salt", { quantity: 1, unit: "pinch", name: "salt", category: "spices" }],
  ["Salt and pepper, to taste", { quantity: null, name: "Salt and pepper" }],
  ["juice of 1 lemon", { quantity: 1, name: "lemon", note: "juice" }],
  ["3 large eggs", { quantity: 3, unit: null, name: "large eggs", category: "dairy_eggs" }],
  ["1 large tin coconut milk", { quantity: 1, unit: "tin", name: "coconut milk", category: "tins_jars" }],
  ["100ml double cream", { quantity: 100, unit: "ml", name: "double cream", category: "dairy_eggs" }],
  ["1 1/2 cups rice", { quantity: 1.5, unit: "cup", name: "rice" }],
  ["2 celery sticks", { quantity: 2, unit: "stick", name: "celery" }],
  ["500g beef mince", { quantity: 500, unit: "g", name: "beef mince", category: "meat_fish" }],
  ["• 1 red pepper, sliced", { quantity: 1, name: "red pepper", category: "produce" }],
  ["small bunch of coriander", { name: "small bunch of coriander" }],
  ["1 small bunch coriander, chopped", { quantity: 1, unit: "bunch", name: "coriander", category: "produce" }],
  ["2 lemons", { quantity: 2, unit: null, name: "lemons" }],
  ["1 litre chicken stock", { quantity: 1, unit: "l", name: "chicken stock", category: "dry_goods" }],
];

for (const [line, expected] of cases) {
  test(`parse: ${line}`, () => {
    const got = parseIngredientLine(line);
    for (const [k, v] of Object.entries(expected)) {
      assert.deepEqual(got[k as keyof typeof got], v, `${k} for "${line}" → ${JSON.stringify(got)}`);
    }
  });
}

test("nameKey merges variants", () => {
  assert.equal(nameKey("Red onions"), nameKey("large red onion"));
  assert.equal(nameKey("Tomatoes"), "tomato");
  assert.equal(nameKey("free-range eggs"), "egg");
  assert.equal(nameKey("chillies"), "chilli");
  assert.equal(nameKey("chopped tomatoes"), "chopped tomato");
  assert.notEqual(nameKey("chopped tomatoes"), nameKey("tomatoes"));
  assert.equal(nameKey("chickpeas"), "chickpeas");
  assert.equal(nameKey("couscous"), "couscous");
});

test("categories", () => {
  assert.equal(categorise("olive oil"), "dry_goods");
  assert.equal(categorise("peanut butter"), "tins_jars");
  assert.equal(categorise("butter beans"), "tins_jars");
  assert.equal(categorise("frozen peas"), "frozen");
  assert.equal(categorise("peas"), "frozen");
  assert.equal(categorise("sugar snap peas"), "produce");
  assert.equal(categorise("fresh coriander"), "produce");
  assert.equal(categorise("ground coriander"), "spices");
  assert.equal(categorise("ginger"), "produce");
  assert.equal(categorise("ground ginger"), "spices");
  assert.equal(categorise("pumpkin"), "produce");
  assert.equal(categorise("pumpkin seeds"), "dry_goods");
  assert.equal(categorise("egg noodles"), "dry_goods");
  assert.equal(categorise("chicken thighs"), "meat_fish");
  assert.equal(categorise("crème fraîche"), "dairy_eggs");
  assert.equal(categorise("pitta breads"), "bakery");
  assert.equal(categorise("red wine vinegar"), "dry_goods");
  assert.equal(categorise("cloves"), "spices");
  assert.equal(categorise("nappies"), "household");
});

test("normalizeIngredients accepts text, lines and objects", () => {
  const fromText = normalizeIngredients("For the sauce:\n2 carrots\n\n1 tbsp honey");
  assert.equal(fromText.length, 2);
  const fromObjects = normalizeIngredients([{ name: "Spinach", quantity: 200, unit: "grams" }, "1 onion", { raw: "2 leeks" }]);
  assert.deepEqual(
    fromObjects.map((i) => [i.name, i.quantity, i.unit, i.category]),
    [
      ["Spinach", 200, "g", "produce"],
      ["onion", 1, null, "produce"],
      ["leeks", 2, null, "produce"],
    ],
  );
});
