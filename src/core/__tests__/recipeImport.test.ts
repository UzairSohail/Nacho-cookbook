import { describe, expect, it } from 'vitest';

import { extractRecipe, NoRecipeFoundError, parseDuration, parseYield } from '../recipeImport';
import { draftFromImport, draftToRecipe, validateDraft, hasErrors } from '@/src/state/recipeDraft';

import plainBlog from './pages/plain-blog.html?raw';
import wprmBlog from './pages/wprm-blog.html?raw';

const pages: Record<string, string> = { 'wprm-blog.html': wprmBlog, 'plain-blog.html': plainBlog };
const page = (name: string) => pages[name];

describe('extractRecipe on a food blog with JSON-LD and a WP Recipe Maker card', () => {
  const r = extractRecipe(page('wprm-blog.html'), 'https://example.com/red-velvet-cheesecake/');

  it('reads the recipe details from JSON-LD, not the story around it', () => {
    expect(r.foundBy).toBe('json-ld');
    expect(r.title).toBe('Red Velvet Cheesecake');
    expect(r.description).toBe('A red velvet cake base, a creamy baked cheesecake and cream cheese frosting – all in one.');
    expect(r.servings).toBe(12);
    expect(r.prepMinutes).toBe(45);
    expect(r.cookMinutes).toBe(90);
    expect(r.tags).toEqual(['dessert', 'american']);
    expect(r.imageUrl).toBe('https://example.com/wp-content/uploads/red-velvet-cheesecake-500x500.jpg');
  });

  it('takes ingredient sections from the recipe card, without tick boxes', () => {
    expect(r.ingredients.map((g) => g.heading)).toEqual(['Red velvet cake', 'Cheesecake', 'Frosting']);
    expect(r.ingredients[0].items[0]).toBe('1 1/4 cups plain flour, all-purpose');
    expect(r.ingredients[1].items[0]).toBe('500 g cream cheese, softened');
    expect(r.ingredients.flatMap((g) => g.items)).toHaveLength(13);
  });

  it('keeps the step sections from JSON-LD and decodes entities', () => {
    expect(r.instructions.map((g) => g.heading)).toEqual(['Red velvet cake', 'Cheesecake', 'Frosting']);
    expect(r.instructions[0].steps[0]).toBe('Preheat oven to 160°C/320°F (140°C fan).');
    expect(r.instructions.flatMap((g) => g.steps)).toHaveLength(5);
  });

  it('brings the recipe notes along', () => {
    expect(r.notes).toBe('1. Red food colouring – gel colouring gives the deepest red.\n2. Storage – keeps for 5 days in the fridge.');
  });

  it('fills the editor with parsed ingredients that save cleanly', () => {
    const d = draftFromImport(r, 2);
    expect(d.title).toBe('Red Velvet Cheesecake');
    expect(d.servings).toBe('12');
    expect(d.sourceUrl).toBe('https://example.com/red-velvet-cheesecake/');
    expect(d.lines[0]).toMatchObject({ kind: 'heading', text: 'Red velvet cake' });
    expect(d.lines[1]).toMatchObject({ amount: '1 1/4', unit: 'cups', name: 'Plain flour' });
    expect(d.steps[0].text).toBe('Red velvet cake:');
    expect(d.steps[1].text).toBe('Preheat oven to 160°C/320°F (140°C fan).');
    expect(d.steps[2].text).toBe('Whisk flour, cocoa and baking soda. Add the rest and mix until smooth.');
    expect(hasErrors(validateDraft(d))).toBe(false);
    const saved = draftToRecipe(d);
    expect(saved.ingredients).toHaveLength(13);
    expect(saved.ingredients.find((i) => i.name === 'Cream cheese' && i.group === 'Cheesecake')?.quantity).toBe(500);
    expect(saved.ingredients.at(-1)).toMatchObject({ name: 'Pinch of salt', quantity: null, group: 'Frosting' });
  });
});

describe('extractRecipe fallbacks', () => {
  it('finds the lists under Ingredients and Method headings when a page has no recipe data', () => {
    const r = extractRecipe(page('plain-blog.html'), 'https://blog.example/soup');
    expect(r.foundBy).toBe('headings');
    expect(r.title).toBe("Nan's pumpkin soup");
    expect(r.description).toBe('The soup Nan made every winter.');
    expect(r.servings).toBe(6);
    expect(r.ingredients).toEqual([
      { heading: 'Soup', items: ['1 kg butternut pumpkin, peeled and chopped', '1 brown onion, diced', '2 cloves garlic, crushed', '1 L chicken stock'] },
      { heading: 'To serve', items: ['1/2 cup cream', 'Salt and pepper, to taste'] },
    ]);
    expect(r.instructions).toEqual([
      { heading: undefined, steps: ['Fry the onion and garlic in a large pot until soft.', 'Add pumpkin and stock, simmer 20 minutes.', 'Blend until smooth and stir through the cream.'] },
    ]);
  });

  it('reads schema.org microdata', () => {
    const html = `<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Toast</h1>
      <meta itemprop="recipeYield" content="2 slices"><meta itemprop="cookTime" content="PT3M">
      <ul><li itemprop="recipeIngredient">2 slices bread</li><li itemprop="recipeIngredient">Butter</li></ul>
      <div itemprop="recipeInstructions"><ol><li>Toast the bread.</li><li>Butter it.</li></ol></div></div>`;
    const r = extractRecipe(html, 'https://x.example/toast');
    expect(r).toMatchObject({ foundBy: 'microdata', title: 'Toast', servings: 2, cookMinutes: 3 });
    expect(r.ingredients[0].items).toEqual(['2 slices bread', 'Butter']);
    expect(r.instructions[0].steps).toEqual(['Toast the bread.', 'Butter it.']);
  });

  it('handles JSON-LD with instructions as one block of text and a single type array', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@type': ['Recipe', 'NewsArticle'],
      name: 'Pancakes',
      recipeYield: 'Makes 8',
      totalTime: 'PT25M',
      prepTime: 'PT10M',
      recipeIngredient: ['1 cup flour', '1 egg'],
      recipeInstructions: '<p>Mix everything.</p><p>Cook in a hot pan.</p>',
    };
    const r = extractRecipe(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`, 'https://x.example/p');
    expect(r).toMatchObject({ title: 'Pancakes', servings: 8, prepMinutes: 10, cookMinutes: 15 });
    expect(r.instructions[0].steps).toEqual(['Mix everything.', 'Cook in a hot pan.']);
  });

  it('says so when there is no recipe on the page', () => {
    expect(() => extractRecipe('<html><body><h1>About us</h1><p>Hello</p></body></html>', 'https://x.example')).toThrow(
      NoRecipeFoundError,
    );
  });
});

describe('durations and yields', () => {
  it('reads ISO durations', () => {
    expect(parseDuration('PT1H20M')).toBe(80);
    expect(parseDuration('P0DT0H45M')).toBe(45);
    expect(parseDuration('PT0S')).toBeUndefined();
    expect(parseDuration('20 minutes')).toBeUndefined();
  });
  it('reads the first number of a yield', () => {
    expect(parseYield(['12', '12 slices'])).toBe(12);
    expect(parseYield('Serves 4-6')).toBe(4);
    expect(parseYield(6)).toBe(6);
    expect(parseYield('a crowd')).toBeUndefined();
  });
});
