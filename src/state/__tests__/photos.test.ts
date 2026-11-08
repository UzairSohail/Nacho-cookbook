import { describe, expect, it } from 'vitest';

import { fitSize, isUploadablePath, isWebPhoto, MAX_PHOTO_SIDE, newPhotoPath, recipePhotos, unusedPhotos } from '@/src/photos/paths';
import { draftFromImport, draftFromRecipe, draftToRecipe, emptyDraft } from '../recipeDraft';
import { recipeRows, rowsToState, type Rows } from '../rows';

const H = '11111111-1111-4111-8111-111111111111';

describe('photo paths', () => {
  it('puts new photos in the household folder', () => {
    const p = newPhotoPath(H);
    expect(p).toMatch(new RegExp(`^${H}/[0-9a-f-]{36}\\.jpg$`));
    expect(isUploadablePath(p)).toBe(true);
    expect(isWebPhoto(p)).toBe(false);
  });

  it('keeps demo photos and web addresses on the device', () => {
    expect(isUploadablePath(newPhotoPath('demo'))).toBe(false);
    expect(isUploadablePath('https://example.com/cake.jpg')).toBe(false);
    expect(isWebPhoto('https://example.com/cake.jpg')).toBe(true);
  });

  it('lists a recipe’s photos once, cover first', () => {
    const r = { photoUrls: ['a', 'b'], steps: [{ text: '1', photoUrl: 'c' }, { text: '2' }, { text: '3', photoUrl: 'a' }] };
    expect(recipePhotos(r)).toEqual(['a', 'b', 'c']);
    expect(recipePhotos(undefined)).toEqual([]);
  });

  it('finds stored photos no longer used, never web ones', () => {
    expect(unusedPhotos(['a', 'b', 'https://x.com/p.jpg', 'a'], ['b'])).toEqual(['a']);
  });

  it('shrinks only photos bigger than the limit, keeping the longest side', () => {
    expect(fitSize(1200, 900)).toBeNull();
    expect(fitSize(4032, 3024)).toEqual({ width: MAX_PHOTO_SIDE });
    expect(fitSize(3024, 4032)).toEqual({ height: MAX_PHOTO_SIDE });
  });
});

describe('photos in the editor', () => {
  const base = {
    ...emptyDraft(),
    title: 'Pancakes',
    photoUrls: [`${H}/cover.jpg`],
    steps: [
      { key: 's1', text: 'Mix', photo: `${H}/mix.jpg` },
      { key: 's2', text: 'Fry' },
      { key: 's3', text: '  ', photo: `${H}/stack.jpg` },
      { key: 's4', text: '' },
    ],
  };

  it('saves the cover and step photos, keeping photo-only steps', () => {
    const r = draftToRecipe(base);
    expect(r.photoUrls).toEqual([`${H}/cover.jpg`]);
    expect(r.steps).toEqual([
      { text: 'Mix', photoUrl: `${H}/mix.jpg` },
      { text: 'Fry', photoUrl: undefined },
      { text: '', photoUrl: `${H}/stack.jpg` },
    ]);
  });

  it('keeps step photos with their step when steps move', () => {
    const r = draftToRecipe({ ...base, steps: [base.steps[1], base.steps[0]] });
    expect(r.steps.map((s) => s.photoUrl)).toEqual([undefined, `${H}/mix.jpg`]);
  });

  it('lets an edit remove the cover', () => {
    const saved = { ...draftToRecipe(base), ingredients: [] };
    const draft = draftFromRecipe(saved, new Map());
    expect(draft.photoUrls).toEqual([`${H}/cover.jpg`]);
    expect(draft.steps[0].photo).toBe(`${H}/mix.jpg`);
    expect(draftToRecipe({ ...draft, photoUrls: [] }, saved).photoUrls).toEqual([]);
  });

  it('keeps an imported photo', () => {
    const draft = draftFromImport({
      title: 'Cake',
      sourceUrl: 'https://example.com/cake',
      imageUrl: 'https://example.com/cake.jpg',
      ingredients: [],
      instructions: [],
      tags: [],
    } as unknown as Parameters<typeof draftFromImport>[0]);
    expect(draftToRecipe(draft).photoUrls).toEqual(['https://example.com/cake.jpg']);
  });

  it('round-trips photos through the database rows', () => {
    const recipe = { ...draftToRecipe(base), ingredients: [] };
    const rows = recipeRows(recipe, H);
    const db: Rows = {
      households: [], ingredients: [], recipe_ingredients: [], plan_entries: [], pantry_staples: [],
      shopping_items: [], shopping_dismissed: [],
      recipes: [{ id: recipe.id, ...rows.recipe }],
      recipe_steps: rows.steps.map((s) => ({ id: s.id, ...s.row })),
    };
    const back = rowsToState(db, H).recipes[0];
    expect(back.photoUrls).toEqual(recipe.photoUrls);
    expect(back.steps.map((s) => s.photoUrl)).toEqual(recipe.steps.map((s) => s.photoUrl));
  });
});
