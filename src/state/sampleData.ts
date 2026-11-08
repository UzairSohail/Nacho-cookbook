import type { Ingredient, PlanEntry, Recipe } from '@/src/core';

/** Starter content so the app has something to show before sync is wired up. */
export const sampleIngredients: Ingredient[] = [
  { id: 'milk', name: 'Milk', aisle: 'dairy', density: 1.03 },
  { id: 'flour', name: 'Plain flour', aisle: 'pantry', density: 0.53 },
  { id: 'sugar', name: 'Caster sugar', aisle: 'pantry', density: 0.85 },
  { id: 'egg', name: 'Eggs', aisle: 'dairy' },
  { id: 'butter', name: 'Butter', aisle: 'dairy', density: 0.96 },
  { id: 'salt', name: 'Salt', aisle: 'spices' },
  { id: 'oats', name: 'Rolled oats', aisle: 'pantry', density: 0.36 },
  { id: 'yoghurt', name: 'Greek yoghurt', aisle: 'dairy', density: 1.05 },
  { id: 'berries', name: 'Frozen berries', aisle: 'frozen' },
  { id: 'chicken', name: 'Chicken thighs', aisle: 'meat' },
  { id: 'rice', name: 'Basmati rice', aisle: 'pantry', density: 0.85 },
  { id: 'onion', name: 'Brown onion', aisle: 'produce' },
  { id: 'garlic', name: 'Garlic', aisle: 'produce' },
  { id: 'curry', name: 'Curry powder', aisle: 'spices' },
  { id: 'coconut', name: 'Coconut milk', aisle: 'pantry' },
  { id: 'oil', name: 'Olive oil', aisle: 'pantry', density: 0.91 },
  { id: 'pasta', name: 'Spaghetti', aisle: 'pantry' },
  { id: 'mince', name: 'Beef mince', aisle: 'meat' },
  { id: 'tomatoes', name: 'Crushed tomatoes', aisle: 'pantry' },
  { id: 'cocoa', name: 'Cocoa powder', aisle: 'pantry', density: 0.5 },
];

export const sampleRecipes: Recipe[] = [
  {
    id: 'pancakes',
    title: 'Fluffy pancakes',
    description: 'Weekend pancakes with a crisp edge. From an American recipe site.',
    servings: 4,
    measureStandard: 'us',
    keepsForDays: 1,
    prepMinutes: 10,
    cookMinutes: 15,
    tags: ['breakfast', 'vegetarian'],
    ingredients: [
      { ingredientId: 'flour', quantity: 1.5, unit: 'cups', scalable: true },
      { ingredientId: 'milk', quantity: 1, unit: 'cup', scalable: true },
      { ingredientId: 'egg', quantity: 2, unit: null, scalable: true },
      { ingredientId: 'sugar', quantity: 2, unit: 'tbsp', scalable: true },
      { ingredientId: 'butter', quantity: 30, unit: 'g', note: 'melted', scalable: true },
      { ingredientId: 'salt', quantity: null, unit: null, note: 'a pinch', scalable: false },
    ],
    steps: [
      { text: 'Whisk the flour, sugar and salt in a large bowl.' },
      { text: 'Whisk the milk, eggs and melted butter, then stir into the dry ingredients until just combined.' },
      { text: 'Cook 1/4 cup portions in a hot buttered pan for 2 minutes a side.' },
    ],
  },
  {
    id: 'oats',
    title: 'Berry overnight oats',
    description: 'Make once, breakfast for three days.',
    servings: 3,
    keepsForDays: 3,
    prepMinutes: 5,
    tags: ['breakfast', 'make ahead'],
    ingredients: [
      { ingredientId: 'oats', quantity: 150, unit: 'g', scalable: true },
      { ingredientId: 'milk', quantity: 300, unit: 'ml', scalable: true },
      { ingredientId: 'yoghurt', quantity: 0.75, unit: 'cup', scalable: true },
      { ingredientId: 'berries', quantity: 1, unit: 'cup', scalable: true },
    ],
    steps: [
      { text: 'Mix oats, milk and yoghurt in a container.' },
      { text: 'Top with berries, cover and refrigerate overnight.' },
    ],
  },
  {
    id: 'curry',
    title: 'Coconut chicken curry',
    servings: 4,
    keepsForDays: 3,
    prepMinutes: 15,
    cookMinutes: 30,
    tags: ['dinner'],
    ingredients: [
      { ingredientId: 'chicken', quantity: 600, unit: 'g', note: 'diced', scalable: true },
      { ingredientId: 'onion', quantity: 1, unit: null, note: 'sliced', scalable: true },
      { ingredientId: 'garlic', quantity: 3, unit: 'cloves', scalable: true },
      { ingredientId: 'curry', quantity: 2, unit: 'tbsp', scalable: true },
      { ingredientId: 'coconut', quantity: 1, unit: 'can', note: '400 ml', scalable: true },
      { ingredientId: 'oil', quantity: 1, unit: 'tbsp', scalable: true },
      { ingredientId: 'rice', quantity: 1.5, unit: 'cups', group: 'To serve', scalable: true },
      { ingredientId: 'salt', quantity: null, unit: null, note: 'to taste', scalable: false },
    ],
    steps: [
      { text: 'Fry the onion in oil until soft, then add garlic and curry powder for 1 minute.' },
      { text: 'Add chicken and brown, then pour in coconut milk and simmer 20 minutes.' },
      { text: 'Cook the rice while the curry simmers.' },
    ],
  },
  {
    id: 'bolognese',
    title: 'Spaghetti bolognese',
    servings: 4,
    keepsForDays: 3,
    cookMinutes: 45,
    tags: ['dinner'],
    ingredients: [
      { ingredientId: 'mince', quantity: 500, unit: 'g', scalable: true },
      { ingredientId: 'onion', quantity: 1, unit: null, note: 'diced', scalable: true },
      { ingredientId: 'garlic', quantity: 2, unit: 'cloves', scalable: true },
      { ingredientId: 'tomatoes', quantity: 2, unit: 'cans', scalable: true },
      { ingredientId: 'oil', quantity: 1, unit: 'tbsp', scalable: true },
      { ingredientId: 'pasta', quantity: 400, unit: 'g', scalable: true },
      { ingredientId: 'salt', quantity: null, unit: null, note: 'to taste', scalable: false },
    ],
    steps: [
      { text: 'Brown the mince with onion and garlic in oil.' },
      { text: 'Add tomatoes and simmer 30 minutes.' },
      { text: 'Cook spaghetti and serve with the sauce.' },
    ],
  },
  {
    id: 'mugcake',
    title: 'Chocolate mug cake',
    servings: 1,
    keepsForDays: 0,
    cookMinutes: 2,
    tags: ['dessert'],
    ingredients: [
      { ingredientId: 'flour', quantity: 4, unit: 'tbsp', scalable: true },
      { ingredientId: 'sugar', quantity: 3, unit: 'tbsp', scalable: true },
      { ingredientId: 'cocoa', quantity: 2, unit: 'tbsp', scalable: true },
      { ingredientId: 'milk', quantity: 3, unit: 'tbsp', scalable: true },
      { ingredientId: 'oil', quantity: 2, unit: 'tbsp', scalable: true },
    ],
    steps: [{ text: 'Mix everything in a mug and microwave for 90 seconds.' }],
  },
];

export const samplePantry = ['salt', 'oil', 'curry'];

export function samplePlan(fortnight: string[], householdSize: number): PlanEntry[] {
  const entries: PlanEntry[] = [];
  const add = (day: number, slot: PlanEntry['slot'], recipeId: string) =>
    entries.push({ id: `${fortnight[day]}-${slot}`, date: fortnight[day], slot, recipeId, servings: householdSize });
  [0, 1, 2].forEach((d) => add(d, 'breakfast', 'oats'));
  add(5, 'breakfast', 'pancakes');
  add(0, 'dinner', 'curry');
  add(1, 'dinner', 'curry');
  add(2, 'dinner', 'bolognese');
  add(3, 'dinner', 'bolognese');
  add(4, 'dessert', 'mugcake');
  return entries;
}
