import { describe, expect, it } from 'vitest';
import { guessAisle, looksLikeStepHeading, parseIngredientLine } from '../ingredientLine';

describe('parseIngredientLine', () => {
  it.each([
    ['1 1/2 cups plain flour, sifted', { quantity: 1.5, unit: 'cups', name: 'Plain flour', note: 'sifted' }],
    ['500g chicken thighs', { quantity: 500, unit: 'g', name: 'Chicken thighs' }],
    ['2 cloves garlic, crushed', { quantity: 2, unit: 'cloves', name: 'Garlic', note: 'crushed' }],
    ['3 eggs', { quantity: 3, unit: null, name: 'Eggs' }],
    ['2 large eggs', { quantity: 2, unit: null, name: 'Large eggs' }],
    ['½ tsp. salt', { quantity: 0.5, unit: 'tsp', name: 'Salt' }],
    ['1 cup of milk', { quantity: 1, unit: 'cup', name: 'Milk' }],
    ['4 fl oz cream', { quantity: 4, unit: 'fl oz', name: 'Cream' }],
    ['- 1 can (400 g) crushed tomatoes', { quantity: 1, unit: 'can', name: 'Crushed tomatoes', note: '400 g' }],
    ['2-3 tbsp olive oil', { quantity: 2, unit: 'tbsp', name: 'Olive oil', note: '2–3' }],
    ['Salt, to taste', { quantity: null, unit: null, name: 'Salt', note: 'to taste' }],
    ['1 tbsp chilli flakes (optional)', { quantity: 1, unit: 'tbsp', name: 'Chilli flakes', optional: true }],
  ])('%s', (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject({ optional: false, ...expected });
  });

  // Captions and handwritten lists often put the amount after the name.
  it.each([
    ['Garlic, 50g', { quantity: 50, unit: 'g', name: 'Garlic' }],
    ['Olive oil, 1/2 Cup', { quantity: 0.5, unit: 'Cup', name: 'Olive oil' }],
    ['Chili Flakes, 1/2 tsp (optional)', { quantity: 0.5, unit: 'tsp', name: 'Chili Flakes', optional: true }],
    ['Olive oil - 2 tbsp', { quantity: 2, unit: 'tbsp', name: 'Olive oil' }],
    ['Flour: 2 cups, sifted', { quantity: 2, unit: 'cups', name: 'Flour', note: 'sifted' }],
    ['Milk 1 1/2 cups', { quantity: 1.5, unit: 'cups', name: 'Milk' }],
    ['Eggs 2', { quantity: 2, unit: null, name: 'Eggs' }],
    ['Tomatoes 2-3', { quantity: 2, unit: null, name: 'Tomatoes', note: '2–3' }],
    // Not an amount: left as a note.
    ['Chicken, cut into 2 slices', { quantity: null, name: 'Chicken', note: 'cut into 2 slices' }],
    ['Eggs, 2 large', { quantity: null, name: 'Eggs', note: '2 large' }],
    ['Vitamin B12', { quantity: null, name: 'Vitamin B12' }],
    ['Mozarella cheese', { quantity: null, name: 'Mozarella cheese' }],
  ])('amount after the name: %s', (line, expected) => {
    expect(parseIngredientLine(line)).toMatchObject({ optional: false, ...expected });
  });

  it('skips blank lines', () => {
    expect(parseIngredientLine('   ')).toBeNull();
    expect(parseIngredientLine('- ')).toBeNull();
  });
});

describe('guessAisle', () => {
  it.each([
    ['Brown onion', 'produce'],
    ['Garlic cloves', 'produce'],
    ['Chicken thighs', 'meat'],
    ['Greek yoghurt', 'dairy'],
    ['Plain flour', 'pantry'],
    ['Coconut milk', 'pantry'],
    ['Crushed tomatoes', 'pantry'],
    ['Smoked paprika', 'spices'],
    ['Frozen berries', 'frozen'],
    ['Salmon fillets', 'seafood'],
    ['Something odd', 'other'],
    ['Fish sauce', 'pantry'],
    ['Chicken stock', 'pantry'],
    ['Sweet chilli sauce', 'pantry'],
    ['Garlic powder', 'spices'],
    ['Black pepper', 'spices'],
    ['Red capsicum', 'produce'],
    ['Lemon juice', 'produce'],
    ['Frozen peas', 'frozen'],
    ['Peas', 'frozen'],
    ['Snow peas', 'produce'],
    ['Kidney beans', 'pantry'],
    ['Green beans', 'produce'],
    ['Egg noodles', 'pantry'],
    ['Free range eggs', 'dairy'],
    ['Tasty cheese', 'dairy'],
    ['Puff pastry', 'frozen'],
    ['Vanilla ice cream', 'frozen'],
    ['Sourdough loaf', 'bakery'],
    ['Lamb cutlets', 'meat'],
    ['Prawns', 'seafood'],
    ['Apple cider vinegar', 'pantry'],
    ['Ginger beer', 'drinks'],
    ['Dishwashing liquid', 'household'],
    ['Toilet paper', 'household'],
    ['Almond milk', 'pantry'],
    ['Corn chips', 'pantry'],
    ['Corn cobs', 'produce'],
  ])('%s -> %s', (name, aisle) => expect(guessAisle(name)).toBe(aisle));
});

describe('brackets after the name', () => {
  it('moves them to the note so names match across recipes', () => {
    expect(parseIngredientLine('1 1/4 cups plain flour (all-purpose)')).toMatchObject({ name: 'Plain flour', note: 'all-purpose' });
    expect(parseIngredientLine('1/2 tsp baking soda (bi-carb, sifted)')).toMatchObject({ name: 'Baking soda', note: 'bi-carb, sifted' });
    expect(parseIngredientLine('250g cream cheese (full fat), softened')).toMatchObject({ name: 'Cream cheese', note: 'full fat, softened' });
    expect(parseIngredientLine('3/4 cup caster sugar ((superfine))')).toMatchObject({ name: 'Caster sugar', note: 'superfine' });
  });
});

describe('lines from recipe sites', () => {
  it('keeps the first of two measures and notes the other', () => {
    expect(parseIngredientLine('200g/ 7oz Oreo cookies, 1.5 standard packs, Note 1')).toMatchObject({
      quantity: 200, unit: 'g', name: 'Oreo cookies', note: '7oz, 1.5 standard packs, Note 1',
    });
    expect(parseIngredientLine('60g / 4 tbsp unsalted butter, melted')).toMatchObject({
      quantity: 60, unit: 'g', name: 'Unsalted butter', note: '4 tbsp, melted',
    });
  });
  it('moves a dashed remark and several brackets to the note', () => {
    expect(parseIngredientLine('6 tsp red food colouring (Note 6) – UK readers especially!')).toMatchObject({
      name: 'Red food colouring', note: 'Note 6, UK readers especially!',
    });
    expect(parseIngredientLine('2 tsp gelatine powder (unflavoured gelatine) (Note 2)')).toMatchObject({
      name: 'Gelatine powder', note: 'unflavoured gelatine, Note 2',
    });
    expect(parseIngredientLine('Optional – grated chocolate')).toMatchObject({ name: 'Grated chocolate', optional: true });
  });
});

describe('looksLikeStepHeading', () => {
  it.each(['Garlic Confit', 'To Serve', 'Cheesecake filling:', 'Salt and Pepper Rub', 'SAUCE'])('%s is a heading', (t) => {
    expect(looksLikeStepHeading(t)).toBe(true);
  });
  it.each([
    'Simmer garlic cloves in olive oil on low heat for 25-30 mins until soft.',
    'Serve.',
    'Bake for 20 minutes',
    'Mix well',
    'Spread the Garlic Butter Over the Bread Evenly',
  ])('%s is a step', (t) => {
    expect(looksLikeStepHeading(t)).toBe(false);
  });
});
