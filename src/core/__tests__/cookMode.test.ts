import { describe, expect, it } from 'vitest';

import { cookSteps, formatClock, stepIngredients, stepTimers } from '../cookMode';
import type { Recipe } from '../types';

const secs = (text: string) => stepTimers(text).map((t) => t.seconds);
const labels = (text: string) => stepTimers(text).map((t) => t.label);

describe('stepTimers', () => {
  it('finds common ways of writing a time', () => {
    expect(secs('Bake 20 min until golden.')).toEqual([1200]);
    expect(secs('Simmer for 20 minutes, stirring.')).toEqual([1200]);
    expect(secs('Roast for 1 hour.')).toEqual([3600]);
    expect(secs('Cook 1 hr 15 mins')).toEqual([4500]);
    expect(secs('Rest 1 hour and 20 minutes')).toEqual([4800]);
    expect(secs('Microwave for 90 seconds.')).toEqual([90]);
    expect(secs('Slow cook 1½ hours')).toEqual([5400]);
    expect(secs('Cook 1 1/2 hours')).toEqual([5400]);
    expect(secs('Let it sit a few minutes, then rest a minute')).toEqual([60]);
    expect(secs('Bake 45m')).toEqual([2700]);
    expect(secs('Leave for a 20-minute rest')).toEqual([1200]);
  });

  it('starts a range at the shorter time and says the range', () => {
    expect(stepTimers('Bake 10-12 minutes')).toEqual([{ seconds: 600, label: '10–12 min' }]);
    expect(stepTimers('Simmer 1 to 2 hours')).toEqual([{ seconds: 3600, label: '1–2 hrs' }]);
  });

  it('gives one timer per time in the step', () => {
    expect(labels('Cook 2 minutes a side, then rest 5 minutes.')).toEqual(['2 min', '5 min']);
  });

  it('ignores things that are not times', () => {
    expect(secs('Add 2 cups of flour and 5 m of string')).toEqual([]);
    expect(secs('Preheat the oven to 180°C.')).toEqual([]);
    expect(secs('Cut into 3 cm pieces')).toEqual([]);
    expect(secs('Toss as you go, I am ready')).toEqual([]);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds, with hours when needed', () => {
    expect(formatClock(1200)).toBe('20:00');
    expect(formatClock(65.2)).toBe('1:06');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('cookSteps', () => {
  it('turns heading lines into the section of the steps below', () => {
    const steps = cookSteps({
      steps: [
        { text: 'Garlic Confit:' },
        { text: 'Cover the garlic with oil.' },
        { text: 'Cook gently for 40 minutes.' },
        { text: 'To Serve' },
        { text: 'Spread on toast.' },
      ],
    });
    expect(steps.map((s) => [s.number, s.section])).toEqual([
      [1, 'Garlic Confit'],
      [2, 'Garlic Confit'],
      [3, 'To Serve'],
    ]);
    expect(steps[2].index).toBe(4);
  });

  it('keeps a last line even if it looks like a heading', () => {
    expect(cookSteps({ steps: [{ text: 'Mix well.' }, { text: 'Enjoy' }] })).toHaveLength(2);
  });
});

describe('stepIngredients', () => {
  const catalog = new Map(
    [
      ['flour', 'plain flour'],
      ['sugar', 'caster sugar'],
      ['oil', 'olive oil'],
      ['sesame', 'sesame oil'],
      ['egg', 'eggs'],
      ['tomato', 'tinned tomatoes'],
      ['curry', 'curry powder'],
      ['milk', 'coconut milk'],
      ['chicken', 'chicken thighs'],
      ['onion', 'brown onion'],
    ].map(([id, name]) => [id, { name }]),
  );
  const recipe = (ids: string[], groups: Array<string | undefined> = []): Pick<Recipe, 'ingredients'> => ({
    ingredients: ids.map((ingredientId, i) => ({ ingredientId, quantity: 1, unit: null, scalable: true, group: groups[i] })),
  });

  it('finds ingredients by full name or by their last word', () => {
    const r = recipe(['flour', 'sugar', 'egg', 'tomato']);
    expect(stepIngredients(r, { text: 'Whisk the flour, sugar and egg.' }, catalog)).toEqual([0, 1, 2]);
    expect(stepIngredients(r, { text: 'Add the tomatoes.' }, catalog)).toEqual([3]);
  });

  it('finds the main word at the front of a name, but not describing words', () => {
    const r = recipe(['chicken', 'onion']);
    expect(stepIngredients(r, { text: 'Add chicken and brown, then simmer.' }, catalog)).toEqual([0]);
    expect(stepIngredients(r, { text: 'Fry the onions.' }, catalog)).toEqual([1]);
  });

  it('lets a full name win over a shared last word', () => {
    const r = recipe(['oil', 'sesame']);
    expect(stepIngredients(r, { text: 'Fry in the olive oil.' }, catalog)).toEqual([0]);
    expect(stepIngredients(r, { text: 'Finish with sesame oil.' }, catalog)).toEqual([1]);
    expect(stepIngredients(r, { text: 'Heat the oil.' }, catalog)).toEqual([0, 1]);
  });

  it('does not match on vague words', () => {
    const r = recipe(['curry', 'milk']);
    expect(stepIngredients(r, { text: 'Cook rice while the curry simmers.' }, catalog)).toEqual([]);
    expect(stepIngredients(r, { text: 'Pour in the coconut milk.' }, catalog)).toEqual([1]);
  });

  it('uses the heading to pick between groups with the same ingredient', () => {
    const r = recipe(['flour', 'sugar', 'flour'], ['Cake', 'Cake', 'Crumble topping']);
    expect(stepIngredients(r, { text: 'Rub the flour into the butter.', section: 'Crumble' }, catalog)).toEqual([2]);
    expect(stepIngredients(r, { text: 'Sift the flour.' }, catalog)).toEqual([0, 2]);
  });

  it('gives everything for "mix everything"', () => {
    const r = recipe(['flour', 'sugar']);
    expect(stepIngredients(r, { text: 'Mix everything in a mug.' }, catalog)).toEqual([0, 1]);
  });
});
