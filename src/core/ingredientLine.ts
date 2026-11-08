/**
 * Reading a written ingredient line such as "1 1/2 cups plain flour, sifted"
 * into amount, unit, name and note. Used when pasting a list into the recipe
 * editor, and later by URL import.
 */
import { parseQuantity } from './fractions';
import type { Aisle } from './types';
import { parseUnit } from './units';

export interface ParsedIngredientLine {
  quantity: number | null;
  /** As written ("cups", "clove"), or null for a plain count ("2 eggs"). */
  unit: string | null;
  name: string;
  note?: string;
  optional: boolean;
}

/** Units we keep as written: they can't be converted, but they are units, not part of the name. */
const COUNT_UNITS = new Set([
  'bag', 'bags', 'bunch', 'bunches', 'can', 'cans', 'clove', 'cloves', 'dash', 'dashes', 'drop', 'drops',
  'fillet', 'fillets', 'handful', 'handfuls', 'head', 'heads', 'jar', 'jars', 'knob', 'leaf', 'leaves',
  'packet', 'packets', 'pkt', 'pinch', 'pinches', 'punnet', 'punnets', 'rasher', 'rashers', 'sheet', 'sheets',
  'slice', 'slices', 'sprig', 'sprigs', 'stalk', 'stalks', 'stick', 'sticks', 'tin', 'tins',
]);

const NUMBER = String.raw`(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞])`;
const LEADING_AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|to)\s*(${NUMBER}))?\s*`);

const DUAL_MEASURE = new RegExp(String.raw`^(${NUMBER})\s*([a-zA-Z]+)\.?\s*/\s*(${NUMBER}\s*[a-zA-Z]+\.?)\s+`);

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Index of the first comma outside brackets, or -1. */
function topLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth = Math.max(0, depth - 1);
    else if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}

export function parseIngredientLine(input: string): ParsedIngredientLine | null {
  let rest = input.trim().replace(/^[-•*·]\s*/, '').trim();
  if (!rest) return null;

  // "60g / 4 tbsp butter" or "200g/ 7oz Oreos": keep the first measure, and the other goes in the note.
  let altMeasure: string | undefined;
  const dual = DUAL_MEASURE.exec(rest);
  if (dual && (parseUnit(dual[2]) || COUNT_UNITS.has(dual[2].toLowerCase()))) {
    altMeasure = dual[3].trim();
    rest = `${dual[1]} ${dual[2]} ${rest.slice(dual[0].length)}`;
  }

  let quantity: number | null = null;
  let range: string | undefined;
  const amount = LEADING_AMOUNT.exec(rest);
  if (amount) {
    quantity = parseQuantity(amount[1]);
    if (amount[2]) range = `${amount[1].trim()}–${amount[2].trim()}`;
    rest = rest.slice(amount[0].length);
  }

  let unit: string | null = null;
  // "500g" works too: the amount match stops at the number, leaving "g flour".
  const words = rest.split(/\s+/);
  const two = words.slice(0, 2).join(' ').replace(/\.$/, '');
  if (quantity != null && words.length > 2 && two.includes(' ') && parseUnit(two) && parseUnit(two) !== 'piece') {
    unit = two;
    rest = words.slice(2).join(' ');
  } else if (quantity != null && words.length > 1) {
    const w = words[0].replace(/\.$/, '');
    const known = parseUnit(w);
    if ((known && known !== 'piece' && w !== 'whole') || COUNT_UNITS.has(w.toLowerCase())) {
      unit = words[0].replace(/\.$/, '');
      rest = words.slice(1).join(' ');
    }
  }
  if (unit) rest = rest.replace(/^of\s+/i, '');

  // "1 can (400 g) tomatoes": the size goes in the note.
  let size: string | undefined;
  const paren = /^\(([^)]*)\)\s*/.exec(rest);
  if (paren) {
    size = paren[1].trim() || undefined;
    rest = rest.slice(paren[0].length);
  }

  let optional = false;
  rest = rest.replace(/\s*\(\s*optional\s*\)\s*/i, () => {
    optional = true;
    return ' ';
  }).trim();
  if (/,\s*optional$/i.test(rest)) {
    optional = true;
    rest = rest.replace(/,\s*optional$/i, '');
  }

  let name = rest;
  let note: string | undefined;
  const comma = topLevelComma(rest);
  if (comma > 0) {
    name = rest.slice(0, comma);
    note = rest.slice(comma + 1).trim() || undefined;
  }
  // "Red food colouring – UK readers especially": a spaced dash starts a note.
  const dash = /\s+[–—-]\s+/.exec(name);
  if (dash && dash.index > 0) {
    const before = name.slice(0, dash.index);
    const extra = name.slice(dash.index + dash[0].length).trim();
    if (/^optional$/i.test(before.trim())) {
      // "Optional – grated chocolate"
      optional = true;
      name = extra;
    } else {
      name = before;
      if (extra) note = note ? `${extra}, ${note}` : extra;
    }
  }
  // "Plain flour (all-purpose)": the bracket is a note, so the name matches other recipes' "plain flour".
  for (let trailing; (trailing = /^(.*?\S)\s*\(+([^()]*)\)+$/.exec(name.trim())); ) {
    name = trailing[1];
    const extra = trailing[2].trim();
    if (extra) note = note ? `${extra}, ${note}` : extra;
  }
  name = capitalise(name.trim());
  for (const extra of [size, altMeasure, range]) if (extra) note = note ? `${extra}, ${note}` : extra;
  if (!name) return null;
  return { quantity, unit, name, note, optional };
}

const AISLE_WORDS: Array<[Aisle, RegExp]> = [
  ['household', /\b(dish(washing)? (soap|liquid|tablets)|detergent|laundry|toilet (paper|rolls?)|paper towels?|tissues|bin bags|garbage bags|cling wrap|glad wrap|foil|baking paper|sponges?|batteries|shampoo|conditioner|toothpaste|soap|deodorant|nappies)\b/],
  ['frozen', /\b(frozen|ice cream|gelato|ice blocks?|puff pastry|shortcrust pastry|filo|fish fingers|hash browns|ice)\b/],
  ['seafood', /\b(fish|salmon|tuna|prawns?|shrimp|barramundi|cod|snapper|squid|calamari|mussels?|scallops?|crab|oysters?|whiting|flathead|ling|basa|anchov(y|ies))\b/],
  ['meat', /\b(chicken|beef|pork|lamb|mince|bacon|ham|sausages?|snags?|steak|turkey|chorizo|prosciutto|salami|pancetta|veal|brisket|ribs|cutlets?|drumsticks?|schnitzel|rump|sirloin|scotch fillet|chuck|pastrami)\b/],
  ['dairy', /\b(milk|buttermilk|butter|cheese|cheddar|tasty|parmesan|parmigiano|pecorino|mozzarella|bocconcini|burrata|feta|brie|camembert|gouda|cream|creme fraiche|crème fraîche|mascarpone|yoghurt|yogurt|eggs?|ricotta|haloumi|halloumi|custard|tofu|margarine)\b/],
  ['bakery', /\b(bread|loaf|sourdough|rolls?|buns?|tortillas?|wraps?|pita|pitta|naan|croissants?|baguette|brioche|muffins?|crumpets?|bagels?|focaccia|ciabatta|english muffins?)\b/],
  ['drinks', /\b(juice|soda|soft drink|lemonade|cola|mineral water|sparkling water|wine|beer|cider|coffee beans|kombucha)\b/],
  ['spices', /\b(salt|peppercorns?|pepper|cayenne|cumin|paprika|turmeric|cinnamon|nutmeg|allspice|cardamom|oregano|dried thyme|dried rosemary|dried basil|chilli flakes|chili flakes|chilli powder|chili powder|curry powder|garam masala|five spice|spice|spices|seasoning|ground cloves|whole cloves|bay lea(f|ves)|vanilla|fennel seeds?|coriander seeds?|mustard seeds?|sumac|za'?atar|saffron)\b/],
  ['produce', /\b(onions?|garlic|tomato(es)?|potato(es)?|spuds?|carrots?|celery|lettuce|rocket|spinach|silverbeet|capsicums?|zucchinis?|eggplants?|broccoli(ni)?|cauliflower|mushrooms?|lemons?|limes?|oranges?|mandarins?|apples?|pears?|bananas?|berries|strawberr(y|ies)|blueberr(y|ies)|raspberr(y|ies)|grapes|mango(es)?|pineapple|watermelon|rockmelon|kiwi ?fruit|peach(es)?|plums?|avocados?|ginger|herbs?|parsley|coriander|cilantro|basil|mint|dill|chives|thyme|rosemary|sage|lemongrass|chillies|chilli|chili|cucumbers?|kale|cabbage|wombok|bok choy|pak choy|leeks?|shallots?|spring onions?|scallions?|pumpkin|butternut|sweet potato(es)?|corn|cobs?|beans?|green beans|snow peas|sugar snap peas|asparagus|beetroot|radish(es)?|fennel|salad|sprouts|fruit)\b/],
  ['pantry', /\b(flour|sugar|rice|pasta|spaghetti|penne|fettuccine|lasagne|macaroni|noodles|couscous|quinoa|oil|vinegar|stock|broth|oats|honey|syrup|sauce|tinned|canned|lentils|chickpeas|nuts?|almonds|walnuts|cashews|pecans|peanuts?|seeds|raisins|sultanas|dates|cocoa|chocolate|baking|bicarb|yeast|cornflour|cornstarch|breadcrumbs|panko|coconut|paste|mustard|mayonnaise|mayo|jam|vegemite|cereal|crackers|biscuits|chips|gelatine|cornflakes|tahini|miso|kecap|passata)\b/],
];

/**
 * Names where one word would send them to the wrong aisle ("fish sauce" is not
 * seafood, "garlic cloves" are not a spice). Checked first, in order.
 */
const AISLE_OVERRIDES: Array<[Aisle, RegExp]> = [
  ['frozen', /\b(frozen|ice cream|gelato)\b/],
  ['produce', /\b(lemon|lime|orange) (juice|zest)\b/],
  ['spices', /\b(garlic|onion|chilli|chili|ginger|mustard) (powder|salt|flakes|seeds?)\b/],
  ['pantry', /\b(sauce|stock|broth|vinegar|oil|paste|passata|tinned|canned|egg noodles|corn ?flour|corn ?chips|corn ?flakes|dried (beans|lentils|chickpeas|fruit|apricots|cranberries|mango)|crushed tomatoes|diced tomatoes|chopped tomatoes|coconut (milk|cream)|peanut butter|evaporated milk|condensed milk|powdered milk|milk powder|(kidney|black|cannellini|baked|butter|borlotti) beans|(almond|oat|soy|rice|long ?life) milk|chocolate|desiccated)\b/],
  ['produce', /\b(red|green|yellow|bell|sweet) peppers?\b/],
  ['produce', /\bgarlic\b/],
  ['produce', /\b(snow|snap) peas\b/],
  ['frozen', /\bpeas\b/],
];

/** A best guess at the shop aisle for a new ingredient, from its name. */
export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase();
  for (const [aisle, re] of AISLE_OVERRIDES) if (re.test(n)) return aisle;
  for (const [aisle, re] of AISLE_WORDS) if (re.test(n)) return aisle;
  return 'other';
}
