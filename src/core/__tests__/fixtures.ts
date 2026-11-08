import type { Ingredient, Recipe } from '../types';

export const catalog = new Map<string, Ingredient>(
  [
    { id: 'milk', name: 'Milk', aisle: 'dairy', density: 1.03 },
    { id: 'flour', name: 'Plain flour', aisle: 'pantry', density: 0.53 },
    { id: 'egg', name: 'Eggs', aisle: 'dairy' },
    { id: 'salt', name: 'Salt', aisle: 'spices' },
    { id: 'oats', name: 'Rolled oats', aisle: 'pantry' },
    { id: 'garlic', name: 'Garlic', aisle: 'produce' },
    { id: 'butter', name: 'Butter', aisle: 'dairy', density: 0.96 },
  ].map((i) => [i.id, i as Ingredient]),
);

export const pancakes: Recipe = {
  id: 'pancakes',
  title: 'Pancakes',
  servings: 4,
  ingredients: [
    { ingredientId: 'milk', quantity: 1, unit: 'cup', scalable: true },
    { ingredientId: 'flour', quantity: 150, unit: 'g', scalable: true },
    { ingredientId: 'egg', quantity: 2, unit: null, scalable: true },
    { ingredientId: 'salt', quantity: null, unit: null, scalable: false, note: 'to taste' },
  ],
  steps: [{ text: 'Mix and fry.' }],
};

export const overnightOats: Recipe = {
  id: 'oats',
  title: 'Overnight oats',
  servings: 3,
  keepsForDays: 3,
  ingredients: [
    { ingredientId: 'oats', quantity: 150, unit: 'g', scalable: true },
    { ingredientId: 'milk', quantity: 300, unit: 'ml', scalable: true },
  ],
  steps: [{ text: 'Soak overnight.' }],
};

export const bread: Recipe = {
  id: 'bread',
  title: 'Garlic bread',
  servings: 2,
  ingredients: [
    { ingredientId: 'flour', quantity: 1, unit: 'cup', scalable: true },
    { ingredientId: 'garlic', quantity: 3, unit: 'cloves', scalable: true },
    { ingredientId: 'butter', quantity: 2, unit: 'tbsp', scalable: true },
    { ingredientId: 'salt', quantity: 1, unit: 'tsp', scalable: true },
  ],
  steps: [{ text: 'Bake.' }],
};

export const recipes = new Map([pancakes, overnightOats, bread].map((r) => [r.id, r]));
