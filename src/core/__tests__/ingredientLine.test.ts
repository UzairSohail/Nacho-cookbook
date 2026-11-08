import { describe, expect, it } from 'vitest';
import { guessAisle, parseIngredientLine } from '../ingredientLine';

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
