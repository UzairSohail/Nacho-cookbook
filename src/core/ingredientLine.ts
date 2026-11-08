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
  ['seafood', /\b(fish|salmon|tuna|prawns?|shrimp|barramundi|cod|snapper|squid|mussels?|scallops?|crab)\b/],
  ['meat', /\b(chicken|beef|pork|lamb|mince|bacon|ham|sausages?|steak|turkey|chorizo|prosciutto|salami)\b/],
  ['dairy', /\b(milk|butter|cheese|cheddar|parmesan|mozzarella|feta|cream|yoghurt|yogurt|eggs?|ricotta|haloumi|halloumi)\b/],
  ['bakery', /\b(bread|rolls?|buns?|tortillas?|wraps?|pita|naan|croissants?|baguette)\b/],
  ['frozen', /\b(frozen|ice cream|peas)\b/],
  ['spices', /\b(salt|pepper|cumin|paprika|turmeric|cinnamon|nutmeg|oregano|thyme|chilli flakes|chili flakes|curry powder|garam masala|spice|ground cloves|bay lea(f|ves)|vanilla)\b/],
  ['produce', /\b(onions?|garlic|tomato(es)?|potato(es)?|carrots?|celery|lettuce|spinach|capsicum|peppers?|zucchini|broccoli|cauliflower|mushrooms?|lemons?|limes?|apples?|bananas?|berries|avocados?|ginger|herbs?|parsley|coriander|cilantro|basil|mint|chillies|chilli|chili|cucumber|kale|cabbage|leeks?|shallots?|spring onions?|pumpkin|sweet potato|corn|beans?|fruit)\b/],
  ['drinks', /\b(juice|soda|wine|beer|coffee|tea)\b/],
  ['pantry', /\b(flour|sugar|rice|pasta|spaghetti|noodles|oil|vinegar|stock|broth|oats|honey|syrup|sauce|tinned|canned|beans|lentils|chickpeas|nuts?|almonds|cocoa|chocolate|baking|yeast|cornflour|cornstarch|breadcrumbs|coconut|paste|mustard|mayonnaise|jam|peanut)\b/],
];

/** A best guess at the shop aisle for a new ingredient, from its name. */
export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase();
  // Tinned and dried things live in the pantry whatever they are.
  if (/\b(tinned|canned|dried|crushed tomatoes|tomato paste|coconut milk|peanut butter|stock)\b/.test(n)) return 'pantry';
  for (const [aisle, re] of AISLE_WORDS) if (re.test(n)) return aisle;
  return 'other';
}
