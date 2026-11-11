import { describe, expect, it } from 'vitest';

import { periodRange, plannedRecipes } from '@/src/core';
import { reducer, withSampleRecipes, type State } from '../reducer';
import { diffState } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';

function fresh(): State {
  return withSampleRecipes({
    householdId: H,
    settings: { householdSize: 2, system: 'metric', standard: 'au' },
    recipes: [], ingredients: [], plan: [], pantry: [], list: [], dismissedKeys: [],
  });
}

const week = periodRange('2026-11-11', 7);
const fortnight = periodRange('2026-11-11', 14);

describe('planner recipe list', () => {
  it('covers a week or a fortnight from Monday', () => {
    expect(week).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    expect(fortnight).toEqual({ start: '2026-11-09', end: '2026-11-22' });
  });

  it('adds recipes for the household size and puts their ingredients on the shopping list', () => {
    let s = fresh();
    const [a, b] = s.recipes;
    s = reducer(s, { type: 'planRecipe', range: fortnight, recipeId: a.id });
    s = reducer(s, { type: 'planRecipe', range: fortnight, recipeId: b.id });
    const list = plannedRecipes(s.plan, fortnight);
    expect(list.map((p) => p.recipeId)).toEqual([a.id, b.id]);
    expect(list.every((p) => p.servings === 2)).toBe(true);
    expect(s.list.some((i) => i.sources.includes(a.title))).toBe(true);
    expect(s.list.some((i) => i.sources.includes(b.title))).toBe(true);
    // Each row has its own day and meal, so the database's one-per-slot rule holds.
    expect(new Set(s.plan.map((e) => `${e.date}|${e.slot}`)).size).toBe(2);
    expect(new Set(s.plan.map((e) => e.id)).size).toBe(2);
  });

  it('does not add the same recipe twice in a period', () => {
    let s = fresh();
    const r = s.recipes[0];
    s = reducer(s, { type: 'planRecipe', range: week, recipeId: r.id });
    s = reducer(s, { type: 'planRecipe', range: week, recipeId: r.id });
    expect(s.plan).toHaveLength(1);
  });

  it('removing a recipe takes its ingredients off the list', () => {
    let s = fresh();
    const r = s.recipes[0];
    s = reducer(s, { type: 'planRecipe', range: week, recipeId: r.id });
    s = reducer(s, { type: 'unplanRecipe', range: week, recipeId: r.id });
    expect(s.plan).toHaveLength(0);
    expect(s.list.filter((i) => i.key)).toHaveLength(0);
  });

  it('scales the list with servings', () => {
    let s = fresh();
    const r = s.recipes.find((x) => x.ingredients.some((i) => i.quantity))!;
    s = reducer(s, { type: 'planRecipe', range: week, recipeId: r.id, servings: r.servings });
    const before = s.list.find((i) => i.quantity)!;
    s = reducer(s, { type: 'setPlannedServings', range: week, recipeId: r.id, servings: r.servings * 2 });
    const after = s.list.find((i) => i.key === before.key)!;
    expect(after.quantity! > before.quantity!).toBe(true);
  });

  it('folds an older plan with the recipe on several days into one line', () => {
    let s = fresh();
    const r = s.recipes[0];
    s = reducer(s, { type: 'setMeal', date: '2026-11-09', slot: 'dinner', recipeId: r.id });
    s = reducer(s, { type: 'setMeal', date: '2026-11-10', slot: 'dinner', recipeId: r.id });
    expect(plannedRecipes(s.plan, week)).toEqual([expect.objectContaining({ recipeId: r.id, servings: 4 })]);
    s = reducer(s, { type: 'setPlannedServings', range: week, recipeId: r.id, servings: 6 });
    expect(s.plan).toHaveLength(1);
    expect(s.plan[0].servings).toBe(6);
  });

  it('keeps each period separate', () => {
    let s = fresh();
    const r = s.recipes[0];
    const next = periodRange('2026-11-16', 7);
    s = reducer(s, { type: 'planRecipe', range: week, recipeId: r.id });
    s = reducer(s, { type: 'planRecipe', range: next, recipeId: r.id });
    expect(plannedRecipes(s.plan, week)).toHaveLength(1);
    expect(plannedRecipes(s.plan, next)).toHaveLength(1);
    expect(s.plan.every((e) => e.date >= '2026-11-09' && e.date <= '2026-11-22')).toBe(true);
  });

  it('syncs as plan rows', () => {
    const before = fresh();
    const after = reducer(before, { type: 'planRecipe', range: week, recipeId: before.recipes[0].id });
    const changes = diffState(before, after);
    expect(changes.some((c) => c.table === 'plan_entries')).toBe(true);
  });
});
