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
