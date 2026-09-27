export const CATEGORIES = [
  "produce",
  "meat_fish",
  "dairy_eggs",
  "bakery",
  "tins_jars",
  "dry_goods",
  "spices",
  "frozen",
  "drinks",
  "household",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  produce: "Fruit & veg",
  meat_fish: "Meat & fish",
  dairy_eggs: "Dairy & eggs",
  bakery: "Bakery",
  tins_jars: "Tins & jars",
  dry_goods: "Cupboard",
  spices: "Herbs & spices",
  frozen: "Frozen",
  drinks: "Drinks",
  household: "Household",
  other: "Other",
};

/** Order of a typical walk round a UK supermarket; the shopping list is sorted by this. */
export const CATEGORY_ORDER: Category[] = [
  "produce",
  "bakery",
  "meat_fish",
  "dairy_eggs",
  "dry_goods",
  "tins_jars",
  "spices",
  "frozen",
  "drinks",
  "household",
  "other",
];

export function categoryRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c as Category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

// First match wins, so the order matters: "olive oil" must hit oils before produce,
// "coconut milk" tins before dairy, "chicken stock" cupboard before meat.
const RULES: [Category, RegExp][] = [
  ["frozen", /\bfrozen\b|\bice cream\b|\bpetits? pois\b|(?<!snap |mange ?tout |split |sugar snap )\bpeas\b|\bedamame\b/],
  ["household", /\b(foil|cling ?film|baking (paper|parchment)|greaseproof|kitchen roll|bin bags?|washing[- ]up|nappies|wipes|cocktail sticks|skewers)\b/],
  ["dry_goods", /\b(oil|vinegar|stock|bouillon|gravy granules|stock ?pot)\b/],
  [
    "tins_jars",
    /\b(tins?|tinned|cans?|canned|jar|passata|chopped tomatoes|plum tomatoes|tomato (pur[eé]e|paste)|coconut (milk|cream)|baked beans|chickpeas|(kidney|butter|cannellini|black|borlotti|haricot|pinto) beans|sweetcorn|tuna|sardines|anchov(y|ies)|olives|capers|pesto|curry paste|harissa|tahini|peanut butter|almond butter|jam|marmalade|honey|(maple|golden) syrup|treacle|mustard|mayo(nnaise)?|ketchup|chutney|pickles?|gherkins?|soy sauce|fish sauce|oyster sauce|hoisin|sriracha|worcestershire|marmite|yeast extract|miso|hot sauce|salsa|lemon curd)\b/,
  ],
  ["spices", /^(?!.*\bgarlic\b).*\bcloves?\b/],
  [
    "spices",
    /\b(salt|(black|white|ground|cracked) pepper|peppercorns?|cumin|paprika|turmeric|cinnamon|nutmeg|ground (ginger|coriander|allspice|cloves?|mace)|coriander seeds?|chil(l)?i (powder|flakes)|cayenne|garam masala|curry powder|ras el hanout|za'?atar|sumac|five spice|cardamom|star anise|(fennel|mustard|cumin|caraway|nigella|celery) seeds?|mixed (herbs|spice)|herbes de provence|italian seasoning|oregano|bay lea(f|ves)|vanilla|allspice|saffron|dried (thyme|rosemary|basil|parsley|mint|dill|sage|herbs|chil(l)?ies?|tarragon)|seasoning)\b|^pepper$/,
  ],
  [
    "dry_goods",
    /\b(pasta|spaghetti|penne|fusilli|rigatoni|linguine|tagliatelle|macaroni|lasagne|orzo|farfalle|conchiglie|gnocchi|rice|noodles?|flour|sugar(?! snap)|oats|porridge|lentils|split peas|couscous|quinoa|bulgur|bulgar|polenta|semolina|baking powder|bicarbonate|bicarb|yeast|cornflour|cornstarch|cocoa|chocolate|almonds?|walnuts?|cashews?|peanuts?|hazelnuts?|pecans?|pistachios?|pine nuts|macadamias?|nuts|(chia|sesame|sunflower|pumpkin|flax|poppy) seeds?|linseeds?|chia|raisins|sultanas|currants|dates|dried (apricots?|fruit|cranberries|figs)|desiccated coconut|breadcrumbs|panko|crackers|rice cakes|cereal|granola|crisps|stuffing|gelatine|custard powder|icing)\b/,
  ],
  [
    "meat_fish",
    /\b(chicken|beef|pork|lamb|mince|sausages?|bacon|ham|chorizo|salami|pancetta|prosciutto|pepperoni|turkey|duck|venison|steak|meatballs?|gammon|brisket|ribs|salmon|cod|haddock|pollock|hake|sea bass|trout|mackerel|fish|prawns?|shrimp|mussels|clams|squid|scallops|crab|lobster|kippers?)\b/,
  ],
  [
    "dairy_eggs",
    /\b(milk|butter|buttermilk|cheese|cheddar|parmesan|parmigiano|pecorino|mozzarella|feta|halloumi|ricotta|mascarpone|paneer|gruy[eè]re|brie|camembert|stilton|goat'?s cheese|cream|cr[eè]me fra[iî]che|yogh?urt|kefir|fromage frais|quark|ghee|eggs?|egg (yolks?|whites?))\b/,
  ],
  [
    "bakery",
    /\b(bread|loaf|rolls?|pittas?|pitta bread|wraps?|tortillas?|naan|bagels?|baguette|brioche|crumpets|english muffins|buns?|sourdough|ciabatta|focaccia|croissants?|flatbreads?|pastry|puff pastry|filo)\b/,
  ],
  [
    "produce",
    /\b(onions?|shallots?|garlic|carrots?|potato(es)?|tomato(es)?|peppers?|courgettes?|zucchini|aubergines?|broccoli|cauliflower|spinach|kale|cabbage|lettuce|cucumbers?|celery|leeks?|mushrooms?|squash|butternut|pumpkin|parsnips?|swede|turnips?|beetroot|avocados?|lemons?|limes?|oranges?|apples?|bananas?|pears?|berries|strawberries|blueberries|raspberries|blackberries|grapes|mango(es)?|pineapple|melon|kiwis?|plums?|peaches|nectarines|apricots|cherries|rhubarb|green beans|runner beans|broad beans|mangetout|sugar snap( peas)?|spring onions?|scallions?|chil(l)?i(es|s)?|ginger|basil|parsley|coriander|mint|dill|chives|thyme|rosemary|sage|tarragon|salad|rocket|watercress|pak choi|bok choy|asparagus|fennel|radish(es)?|sprouts|sweet potato(es)?|corn on the cob|herbs|lemongrass)\b/,
  ],
  ["drinks", /\b(juice|wine|beer|cider|lager|sherry|brandy|rum|vodka|gin|sparkling water|squash drink|cola|lemonade|coffee|tea bags?)\b/],
];

/** Best-guess supermarket aisle for an ingredient name. */
export function categorise(name: string): Category {
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  for (const [category, re] of RULES) {
    if (re.test(n)) return category;
  }
  return "other";
}
