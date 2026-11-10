import { describe, expect, it } from 'vitest';

import { cleanCaption } from '../instagram';
import { parseRecipeText } from '../recipeText';
import { draftFromImport, draftToRecipe } from '../../state/recipeDraft';
import amountsAfterNames from './captions/amounts-after-names.txt?raw';
import pancakes from './captions/bullets-everywhere.txt?raw';
import chickenTenders from './captions/chicken-tenders.txt?raw';
import emojiPasta from './captions/emoji-headings-pasta.txt?raw';
import peanutNoodles from './captions/inline-lists.txt?raw';
import stickyChicken from './captions/sticky-chicken-fries.txt?raw';
import brownies from './captions/story-then-recipe.txt?raw';
import salmon from './captions/unlabelled-parts.txt?raw';
import burritoBowl from './captions/what-you-need-bowl.txt?raw';
import naan from './captions/garlic-naan-storage.txt?raw';
import smashBurger from './captions/method-only-smash-burger.txt?raw';

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

/**
 * More caption shapes: parts named "For the fries:" with no Ingredients
 * heading, steps as plain sentences between the parts, emoji headings and
 * keycap steps, bullets on everything, lists written on one line, and the
 * promos, macros and dots that fill out a caption.
 */
describe('captions without the usual headings', () => {
  const parse = (text: string) => parseRecipeText(cleanCaption(text));
  const steps = (r: ReturnType<typeof parseRecipeText>) => r.instructions.flatMap((g) => g.steps);

  it('sorts parts named "For the …:" into sections, with the steps between them as the method', () => {
    const r = parse(stickyChicken);
    expect(r.ingredients).toEqual([
      { heading: 'Fries', items: ['2-3 medium russet potatoes, cut into thin fries', 'Avocado oil spray'] },
      {
        heading: 'Sticky chicken',
        items: ['1.5 lbs ground chicken', 'Salt & Pepper, to taste', '1 tsp garlic powder', 'Avocado oil, spray'],
      },
      {
        heading: 'Sauce',
        items: [
          '4 tbsp favorite bbq sauce, I used @sweetbabyrays honey bbq - sugar free is even better but I ran out!!',
          'Chives, to garnish',
        ],
      },
    ]);
    expect(steps(r)).toEqual([
      'Air fry at 400°F FOR 12-15 mins shake every 5 mins.',
      'Cook on high heat for 6-7 mins! Turn heat to low and add enough sauce to coat the chicken.',
      'Serve over the air fried French fries',
    ]);
    // The promo, "Announcements:" and the macros are left out; "(x3 servings)" is kept.
    expect(r.title).toBe('Pasted recipe');
    expect(r.description).toBeUndefined();
    expect(r.servings).toBe(3);
  });

  it('opens in the editor with amounts read properly', () => {
    const saved = draftToRecipe(draftFromImport(parse(stickyChicken), 2));
    const byName = Object.fromEntries(saved.ingredients.map((i) => [i.name, i]));
    expect(byName['Medium russet potatoes']).toMatchObject({ quantity: 2, unit: null, note: '2–3, cut into thin fries' });
    expect(byName['Avocado oil spray']).toMatchObject({ quantity: null, unit: null });
    expect(byName['Ground chicken']).toMatchObject({ quantity: 1.5, unit: 'lbs' });
    expect(byName['Favorite bbq sauce']).toMatchObject({ quantity: 4, unit: 'tbsp' });
    expect(byName['Chives']).toMatchObject({ quantity: null, note: 'to garnish' });
    expect(saved.steps).toHaveLength(3);
  });

  it('reads emoji headings, keycap steps and a details line', () => {
    const r = parse(emojiPasta);
    expect(r).toMatchObject({ title: 'Creamy Tuscan Chicken Pasta', servings: 4, prepMinutes: 10, cookMinutes: 20 });
    expect(r.description).toMatch(/^Ready in 20 minutes!/);
    expect(r.ingredients).toHaveLength(1);
    expect(r.ingredients[0].items).toHaveLength(8);
    expect(r.ingredients[0].items[0]).toBe('400g penne');
    expect(steps(r)).toHaveLength(5);
    expect(steps(r)[0]).toBe('Cook the pasta in salted water until al dente.');
  });

  it('finds plain-sentence steps after the ingredients, and servings in the heading', () => {
    const r = parse(brownies);
    expect(r.servings).toBe(16);
    expect(r.ingredients).toEqual([{ items: expect.arrayContaining(['200g dark chocolate', 'Pinch of salt']) }]);
    expect(r.ingredients[0].items).toHaveLength(7);
    expect(steps(r)).toHaveLength(4);
    expect(steps(r)[0]).toMatch(/^Melt the chocolate/);
    expect(r.notes).toBe('They firm up overnight in the fridge.');
    expect(r.description).toMatch(/^Honestly these are the best brownies/);
  });

  it('reads "What you\'ll need" and "How to make it" with bullets, and drops the macros', () => {
    const r = parse(burritoBowl);
    expect(r.title).toBe('HIGH PROTEIN BURRITO BOWL');
    expect(r.ingredients[0].items).toHaveLength(7);
    expect(r.ingredients[0].items).toContain('Light sour cream, to serve');
    expect(steps(r)).toHaveLength(4);
    expect(steps(r)[3]).toMatch(/^Build your bowls/);
  });

  it('reads unlabelled parts ("Glaze:") followed by plain steps', () => {
    const r = parse(salmon);
    expect(r.title).toBe('Honey garlic salmon bites');
    expect(r.ingredients.map((g) => [g.heading, g.items.length])).toEqual([
      ['Salmon', 3],
      ['Glaze', 4],
    ]);
    expect(steps(r)).toHaveLength(4);
    expect(steps(r)[3]).toBe('Serve with rice and greens!');
  });

  it('splits ingredients and steps written on one line after the heading', () => {
    const r = parse(peanutNoodles);
    expect(r.title).toBe('5 Minute Peanut Noodles');
    expect(r.ingredients[0].items).toEqual([
      '2 nests egg noodles',
      '2 tbsp peanut butter',
      '1 tbsp soy sauce',
      '1 tsp sriracha',
      '1 tsp honey',
      'spring onion to serve',
    ]);
    expect(steps(r)).toEqual([
      'Cook the noodles.',
      'Whisk the peanut butter, soy, sriracha and honey with 3 tbsp of the hot noodle water, then toss through the noodles.',
      'Top with spring onion.',
    ]);
  });

  it('tells bulleted steps from bulleted ingredients', () => {
    const r = parse(pancakes);
    expect(r.title).toBe('Fluffy protein pancakes');
    expect(r.ingredients).toEqual([
      { items: ['1 cup self raising flour', '1 scoop vanilla protein powder', '1 egg', '3/4 cup milk'] },
    ]);
    expect(steps(r)).toEqual([
      'Whisk everything together until smooth',
      'Cook 1/4 cup at a time in a non-stick pan over medium heat',
      'Flip when bubbles appear',
      'Top with berries & maple syrup',
    ]);
  });

  it('reads amounts after names, "Step 1 -" steps, servings in the name and a tip', () => {
    const r = parse(amountsAfterNames);
    expect(r).toMatchObject({ title: 'Garlic butter prawns', servings: 2 });
    expect(r.ingredients[0].items).toHaveLength(5);
    expect(steps(r)).toEqual([
      'Melt the butter in a pan over medium heat.',
      'Add garlic and cook for 30 seconds.',
      'Add prawns and cook 2 mins each side.',
      'Finish with parsley and lemon juice.',
    ]);
    expect(r.notes).toBe("Don't overcook the prawns or they go rubbery!");
    const saved = draftToRecipe(draftFromImport(r, 2));
    expect(saved.ingredients[0]).toMatchObject({ name: 'Prawns', quantity: 500, unit: 'g' });
  });

  it('finds the method below the notes, keeps "Storage & Heating" as steps and drops the hashtags', () => {
    const r = parse(naan);
    expect(r.title).toBe('High Protein Cheesy Garlic Naans');
    expect(r.ingredients.map((g) => [g.heading, g.items.length])).toEqual([
      ['Naan', 5],
      ['Garlic butter (optional)', 3],
    ]);
    expect(r.instructions).toEqual([
      {
        steps: [
          'Place in a pan with cooking spray on medium-low heat, cover with a lid and cook for 1-2 minutes then flip and cook till the naan puffs up',
        ],
      },
      {
        heading: 'Storage & Heating',
        steps: [
          'Once cooled wrap in foil and store in the fridge or freezer',
          'To reheat from the fridge, unwrap from the foil and airfry for for 4-5 minutes at 200°C till crispy and lightly puffed again',
          'to reheat from the freezer unwrap from the foil, airfry at 200° for 10-12 minutes to get crispy and light puffed',
        ],
      },
    ]);
    expect(r.notes).toMatch(/^once you’ve mixed the dough into clumps let it rest/);
    expect(r.notes).not.toMatch(/#|Place in a pan|Storage/);
    expect(JSON.stringify(r)).not.toMatch(/#mealprep|tastymealprep|calories\b.*Per Naan/);
  });

  it('keeps a notes paragraph as a note once the steps have been given', () => {
    const r = parseRecipeText(
      'Toast\n\nIngredients\n- 2 slices bread\n- 1 tbsp butter\n\nMethod\n1. Toast the bread.\n2. Spread the butter.\n\nNotes\n- Any bread works\n\nServe it while warm with a cup of tea.',
    );
    expect(steps(r)).toEqual(['Toast the bread.', 'Spread the butter.']);
    expect(r.notes).toBe('Any bread works\nServe it while warm with a cup of tea.');
  });

  it('puts storage and reheating sections in the method in captions without headings too', () => {
    const r = parse(
      'Chicken soup\n\n- 500g chicken thighs\n- 1 litre stock\n- 2 carrots, diced\n\nSimmer everything for 30 minutes, then shred the chicken.\n\nTo reheat:\nWarm on the stove until hot. #soup #easy',
    );
    expect(r.ingredients[0].items).toHaveLength(3);
    expect(r.instructions).toEqual([
      { steps: ['Simmer everything for 30 minutes, then shred the chicken.'] },
      { heading: 'To reheat', steps: ['Warm on the stove until hot.'] },
    ]);
  });

  it('reads a method-only caption: numbered steps in parts, ingredients from the amounts in the steps, no promo', () => {
    const r = parse(smashBurger);
    expect(r.title).toBe('Double Patty Chicken Smash Burger');
    expect(r.instructions.map((g) => [g.heading, g.steps.length])).toEqual([
      ['Chicken Smash Burger', 9],
      ['Caramelized Onions', 4],
      ['Burger Sauce', 3],
      ['Assembly', 7],
    ]);
    expect(r.instructions[3].steps[2]).toBe('Add a generous layer of caramelized onions.');
    expect(r.ingredients).toEqual([
      {
        heading: 'Chicken Smash Burger',
        items: ['250 g finely minced boneless chicken', '1 tsp red chilli powder', '½ tsp black pepper powder', '1 tsp chicken masala', 'Salt, to taste', '1 Cheese Slice'],
      },
      { heading: 'Caramelized Onions', items: ['1 large onion', '1 tbsp butter', 'Pinch of salt', '½ tsp sugar'] },
      {
        heading: 'Burger Sauce',
        items: ['4 tbsp mayonnaise', '1 tbsp mustard sauce', '2 tbsp ketchup', '½ tsp red chili powder', '½ tsp garlic powder', '½ tsp sugar', 'Salt, to taste'],
      },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/reel|Subscribe|#chicken/);
    expect(JSON.stringify(r.ingredients)).not.toMatch(/portions|Assembly/);
    const saved = draftToRecipe(draftFromImport(r, 2));
    expect(saved.ingredients[0]).toMatchObject({ name: expect.stringMatching(/chicken/), quantity: 250, unit: 'g' });
  });

  it('keeps numbered steps as steps when a zero-width space hides in the number', () => {
    const r = parse(smashBurger.replace('3. Add a generous', '3\u200B. Add a generous'));
    expect(r.instructions[3].steps[2]).toBe('Add a generous layer of caramelized onions.');
    expect(r.ingredients.flatMap((g) => g.items)).not.toContainEqual(expect.stringMatching(/generous/));
  });

  it('drops calls to action but keeps storage steps that start the same way', () => {
    const r = parseRecipeText(
      'Soup\n\nIngredients\n- 1 litre stock\n\nMethod\n1. Simmer the stock.\n2. Save the leftovers in a container in the fridge.\n\nSave this recipe for later!\nFollow @cook for more\nTurn on post notifications',
    );
    expect(steps(r)).toEqual(['Simmer the stock.', 'Save the leftovers in a container in the fridge.']);
    expect(r.notes).toBeUndefined();
  });
});
