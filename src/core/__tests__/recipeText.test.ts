import { describe, expect, it } from 'vitest';

import { NoRecipeTextError, parseMinutesText, parseRecipeText } from '../recipeText';
import { draftFromImport, draftToRecipe, hasErrors, validateDraft } from '@/src/state/recipeDraft';

/** What copying a WP Recipe Maker card from a browser gives: labels and values on separate lines, tick boxes, buttons. */
const WPRM_COPY = `Chocolate Chip Cookies
Print Recipe
Pin Recipe
4.92 from 37 votes
Soft and chewy cookies with crisp edges.

Prep Time
15
minutes
Cook Time
12
minutes
Total Time
27
minutes
Course Dessert
Cuisine American
Servings 24 cookies
Author Michelle

Ingredients
1x2x3x
▢ 2 1/4 cups (281 g) all-purpose flour
▢ 1 teaspoon baking soda
▢ ½ teaspoon salt
▢ 1 cup (2 sticks) unsalted butter, softened
▢ 2 large eggs

Instructions
Preheat the oven to 375ºF.
Whisk the flour, baking soda and salt together.
Cream the butter, then beat in the eggs.

Notes
Chill the dough for 30 minutes for thicker cookies.
Store in an airtight container for up to 5 days.

Nutrition
Calories: 180kcal | Carbohydrates: 22g`;

const SECTIONED = `Lemon Cheesecake Bars
https://www.lifeloveandsugar.com/lemon-cheesecake-bars/
Serves: 16
Prep time: 30 mins | Cook time: 1 hr 5 mins

INGREDIENTS
CRUST
1 1/2 cups graham cracker crumbs
6 tbsp butter, melted
Filling:
500g cream cheese, softened
3/4 cup sugar
Zest of 2 lemons

METHOD
Crust:
1. Mix the crumbs and butter and press into the tin.
2. Bake 10 minutes.
Filling:
Step 3
Beat the cream cheese and sugar until smooth.
- Stir in the zest and pour over the crust.`;

describe('parseRecipeText', () => {
  it('reads a copied recipe card, skipping buttons, ratings and nutrition', () => {
    const r = parseRecipeText(WPRM_COPY);
    expect(r.foundBy).toBe('pasted');
    expect(r.title).toBe('Chocolate Chip Cookies');
    expect(r.description).toBe('Soft and chewy cookies with crisp edges.');
    expect(r).toMatchObject({ prepMinutes: 15, cookMinutes: 12, servings: 24 });
    expect(r.tags).toEqual(['dessert', 'american']);
    expect(r.ingredients).toEqual([
      {
        items: [
          '2 1/4 cups (281 g) all-purpose flour',
          '1 teaspoon baking soda',
          '½ teaspoon salt',
          '1 cup (2 sticks) unsalted butter, softened',
          '2 large eggs',
        ],
      },
    ]);
    expect(r.instructions).toEqual([
      { steps: ['Preheat the oven to 375ºF.', 'Whisk the flour, baking soda and salt together.', 'Cream the butter, then beat in the eggs.'] },
    ]);
    expect(r.notes).toBe('Chill the dough for 30 minutes for thicker cookies.\nStore in an airtight container for up to 5 days.');
    expect(r.sourceUrl).toBe('');
  });

  it('keeps ingredient and step sections, and picks up the address', () => {
    const r = parseRecipeText(SECTIONED);
    expect(r.sourceUrl).toBe('https://www.lifeloveandsugar.com/lemon-cheesecake-bars/');
    expect(r).toMatchObject({ title: 'Lemon Cheesecake Bars', servings: 16, prepMinutes: 30, cookMinutes: 65 });
    expect(r.description).toBeUndefined();
    expect(r.ingredients.map((g) => g.heading)).toEqual(['CRUST', 'Filling']);
    expect(r.ingredients[1].items).toEqual(['500g cream cheese, softened', '3/4 cup sugar', 'Zest of 2 lemons']);
    expect(r.instructions).toEqual([
      { heading: 'Crust', steps: ['Mix the crumbs and butter and press into the tin.', 'Bake 10 minutes.'] },
      { heading: 'Filling', steps: ['Beat the cream cheese and sugar until smooth.', 'Stir in the zest and pour over the crust.'] },
    ]);
  });

  it('keeps the address the import was tried with when the text has none', () => {
    expect(parseRecipeText(WPRM_COPY, 'https://www.browneyedbaker.com/cookies/').sourceUrl).toBe(
      'https://www.browneyedbaker.com/cookies/',
    );
  });

  it('sorts a recipe with no headings into ingredients and steps', () => {
    const r = parseRecipeText(`Nan's scones

3 cups self-raising flour
1 cup cream
1 cup lemonade
Mix everything into a soft dough without overworking it, then pat it out 3 cm thick.
Cut into rounds and bake at 220°C for 12–15 minutes.`);
    expect(r.title).toBe("Nan's scones");
    expect(r.ingredients[0].items).toEqual(['3 cups self-raising flour', '1 cup cream', '1 cup lemonade']);
    expect(r.instructions[0].steps).toHaveLength(2);
  });

  it('joins an amount that the copy put on its own line', () => {
    const r = parseRecipeText('Toast\nIngredients\n2\nslices bread\n1 tbsp butter\nMethod\nToast it.');
    expect(r.ingredients[0].items).toEqual(['2 slices bread', '1 tbsp butter']);
  });

  it('reads details that a copy scattered over several lines', () => {
    const r = parseRecipeText(`Subscribe to my newsletter for the latest updates.
Beef Stew
 Author:Chef Sam  Prep: 15
minutes
 mins  Cook: 1
hour
 hr  Main  French
Servings4 Tap or hover to scale
A rich stew for cold nights, slow cooked until tender.
Ingredients
Cups
Metric
▢
1 kg beef chuck, cubed
BRAISE
▢
2 cups beef stock
Cook Mode
Prevent screen from sleeping
Instructions
BROWN
Brown the beef in batches.
SIMMER
Add the stock and simmer.`);
    expect(r).toMatchObject({ title: 'Beef Stew', prepMinutes: 15, cookMinutes: 60, servings: 4 });
    expect(r.description).toBe('A rich stew for cold nights, slow cooked until tender.');
    expect(r.ingredients).toEqual([{ items: ['1 kg beef chuck, cubed'] }, { heading: 'BRAISE', items: ['2 cups beef stock'] }]);
    expect(r.instructions.map((g) => g.heading)).toEqual(['BROWN', 'SIMMER']);
  });

  it('says so when there are no ingredients', () => {
    expect(() => parseRecipeText('Just a story about my holiday.')).toThrow(NoRecipeTextError);
    expect(() => parseRecipeText('')).toThrow(NoRecipeTextError);
  });

  it('opens in the editor and saves cleanly', () => {
    const d = draftFromImport(parseRecipeText(SECTIONED), 2);
    expect(d.lines[0]).toMatchObject({ kind: 'heading', text: 'CRUST' });
    expect(d.lines[1]).toMatchObject({ amount: '1 1/2', unit: 'cups', name: 'Graham cracker crumbs' });
    expect(hasErrors(validateDraft(d))).toBe(false);
    const saved = draftToRecipe(d);
    expect(saved.ingredients.find((i) => i.name === 'Cream cheese')).toMatchObject({ quantity: 500, group: 'Filling' });
    expect(saved.steps[0].text).toBe('Crust: Mix the crumbs and butter and press into the tin.');
  });
});

describe('parseMinutesText', () => {
  it.each([
    ['15 minutes', 15],
    ['1 hr 5 mins', 65],
    ['1 hour 20 minutes', 80],
    ['1h20m', 80],
    ['45', 45],
    ['2 hours', 120],
    ['soon', undefined],
  ])('%s', (s, m) => expect(parseMinutesText(s)).toBe(m));
});
