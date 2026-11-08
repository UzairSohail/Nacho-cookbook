import { describe, expect, it } from 'vitest';

import { cleanCaption } from '../instagram';
import { parseRecipeText } from '../recipeText';
import chickenTenders from './captions/chicken-tenders.txt?raw';

/**
 * Real recipe captions, typed from screenshots of the app's paste box. They
 * use headings the paste reader didn't know, such as "Ingredients: (Chicken)",
 * and numbered steps with no Method heading.
 */


describe('Instagram caption recipes', () => {
  const tenders = cleanCaption(chickenTenders);

  it('turns "Ingredients: (Chicken)" headings into ingredient sections', () => {
    const recipe = parseRecipeText(tenders, 'https://www.instagram.com/reel/abc123/');
    expect(recipe.title).toBe("Raising Cane's Style Chicken");
    expect(recipe.ingredients.map((g) => g.heading)).toEqual(['Chicken', 'Raising Cane’s Sauce', 'Fries']);
    expect(recipe.ingredients[0].items).toEqual([
      '1.1KG Boneless & Skinless Chicken Breast (butterflied & cut into 6 strips)',
      '1 Tsp Smoked Paprika',
      '1/2 Tsp Cayenne Pepper',
      '1/2 Tsp Black Pepper',
      '1 Tsp Salt',
      '1 Tsp Garlic Powder',
      '100g Potato Starch',
      '200g Plain Flour',
      'Seasoning Flour With Same Seasonings Above',
      '1 Cup Sparkling/Soda Water',
      'Light Cooking Oil Spray',
    ]);
    expect(recipe.ingredients[1].items).toHaveLength(7);
    expect(recipe.ingredients[2].items).toEqual(['400g Carisma Potatoes', '1 Tsp Salt', '1 Tsp Smoked Paprika', 'Light Cooking Oil Spray']);
  });

  it('finds numbered steps without a Method heading, and the notes', () => {
    const recipe = parseRecipeText(tenders);
    const steps = recipe.instructions.flatMap((g) => g.steps);
    expect(steps).toHaveLength(6);
    expect(steps[0]).toBe('Butterfly & cut the chicken into thin strips, season and mix well.');
    expect(steps[4]).toBe('Mix all sauce ingredients together and refrigerate to thicken.');
    expect(recipe.notes).toMatch(/^This makes 6 tenders/);
    expect(recipe.notes).toMatch(/crispy finish\.$/);
  });

  it('works the same with a Method heading', () => {
    const withMethod = tenders.replace('\n1. Butterfly', '\nMethod:\n1. Butterfly');
    const recipe = parseRecipeText(withMethod);
    expect(recipe.ingredients.map((g) => g.heading)).toEqual(['Chicken', 'Raising Cane’s Sauce', 'Fries']);
    expect(recipe.instructions.flatMap((g) => g.steps)).toHaveLength(6);
  });
});

describe('recipe part headings', () => {
  const groups = (text: string) => parseRecipeText(text).ingredients.map((g) => [g.heading, g.items.length]);

  it('reads the common ways of naming a part', () => {
    expect(
      groups('Tacos\n\nIngredients for the filling:\n500g beef mince\n1 onion\n\nSauce ingredients:\n1 cup yoghurt\n1 lime'),
    ).toEqual([
      ['filling', 2],
      ['Sauce', 2],
    ]);
    expect(groups('Cake\n\nDry ingredients\n2 cups flour\n1 tsp baking soda\nWet ingredients\n2 eggs\n1 cup milk')).toEqual([
      ['Dry', 2],
      ['Wet', 2],
    ]);
    expect(groups('Bowl\n\nIngredients - Rice\n1 cup rice\nIngredients (Dressing)\n2 tbsp soy sauce')).toEqual([
      ['Rice', 1],
      ['Dressing', 1],
    ]);
  });

  it('keeps steps that mention ingredients as steps', () => {
    const recipe = parseRecipeText(
      'Slice\n\nIngredients\n250g biscuits\n1 tin condensed milk\n\nMethod\nMix all the ingredients\nThen the wet ingredients\nPress into a tin.',
    );
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.instructions.flatMap((g) => g.steps)).toEqual(['Mix all the ingredients', 'Then the wet ingredients', 'Press into a tin.']);
  });

  it('only splits a line into several ingredients when each piece has an amount', () => {
    const items = parseRecipeText('Ingredients\n2 chicken breasts, sliced\nSalt & pepper\n1 tsp cumin, 2 tsp paprika and 1/2 tsp chilli\n350g mayo (Heinz, light)').ingredients[0].items;
    expect(items).toEqual(['2 chicken breasts, sliced', 'Salt & pepper', '1 tsp cumin', '2 tsp paprika', '1/2 tsp chilli', '350g mayo (Heinz, light)']);
  });
});
