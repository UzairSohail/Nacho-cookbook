/**
 * The recipe editor's form state, kept as the text people type, and the
 * conversions to and from a saved recipe.
 */
import {
  formatFraction,
  parseIngredientLine,
  parseQuantity,
  uuid,
  type Ingredient,
  type Recipe,
} from '@/src/core';
import type { ImportedRecipe } from '@/src/core/recipeImport';
import type { RecipeInput } from './reducer';

export interface IngredientLine {
  kind: 'ingredient';
  key: string;
  amount: string;
  unit: string;
  name: string;
  note: string;
  optional: boolean;
}

/** A heading such as "For the sauce"; ingredients below it belong to that group. A blank heading ends the group. */
export interface HeadingLine {
  kind: 'heading';
  key: string;
  text: string;
}

export type DraftLine = IngredientLine | HeadingLine;

export interface StepLine {
  key: string;
  text: string;
  /** Photo path or web address. */
  photo?: string;
}

export interface RecipeDraft {
  /** Set when editing an existing recipe. */
  id?: string;
  title: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  keepsForDays: string;
  /** Written with US cups and spoons. */
  usMeasures: boolean;
  tags: string;
  sourceUrl: string;
  notes: string;
  lines: DraftLine[];
  steps: StepLine[];
  /** Cover photo first. Paths in the household's photo storage, or web addresses (imported photos). */
  photoUrls: string[];
}

const key = () => uuid();

export const blankIngredient = (): IngredientLine => ({
  kind: 'ingredient', key: key(), amount: '', unit: '', name: '', note: '', optional: false,
});
export const blankHeading = (): HeadingLine => ({ kind: 'heading', key: key(), text: '' });
export const blankStep = (): StepLine => ({ key: key(), text: '' });

export function emptyDraft(servings = 4): RecipeDraft {
  return {
    title: '', description: '', servings: String(servings), prepMinutes: '', cookMinutes: '', keepsForDays: '',
    usMeasures: false, tags: '', sourceUrl: '', notes: '', photoUrls: [],
    lines: [blankIngredient(), blankIngredient(), blankIngredient()],
    steps: [blankStep()],
  };
}

/** An amount as text that reads back to the same number ("1 1/2", or "0.43" if no fraction fits). */
export function amountText(q: number | null): string {
  if (q == null) return '';
  const f = formatFraction(q);
  const back = parseQuantity(f);
  return back != null && Math.abs(back - q) < 1e-9 ? f : String(q);
}

const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Recipes imported before amounts after the name were understood ("Garlic, 50g")
 * were saved with no amount and "50g" as the note, so they couldn't be scaled
 * by what you have. Reads such a note back into the amount and unit.
 */
export function repairIngredientLine(l: IngredientLine): IngredientLine {
  if (l.amount.trim() || !l.note.trim() || !l.name.trim()) return l;
  const p = parseIngredientLine(`${l.name}, ${l.note}`);
  if (!p || p.quantity == null || p.name.toLowerCase() !== l.name.trim().toLowerCase()) return l;
  return {
    ...l,
    amount: amountText(p.quantity),
    unit: p.unit ?? '',
    note: p.note ?? '',
    optional: l.optional || p.optional,
  };
}

/** True if some ingredient has its amount stuck in the note (see repairIngredientLine). */
export function recipeNeedsRepair(recipe: Recipe, catalog: Map<string, Ingredient>): boolean {
  return draftFromRecipe(recipe, catalog, false).lines.some(
    (l) => l.kind === 'ingredient' && repairIngredientLine(l) !== l,
  );
}

/** The recipe with amounts read back out of notes, ready to save. */
export function repairRecipe(recipe: Recipe, catalog: Map<string, Ingredient>): RecipeInput {
  return draftToRecipe(draftFromRecipe(recipe, catalog), recipe);
}

export function draftFromRecipe(recipe: Recipe, catalog: Map<string, Ingredient>, repair = true): RecipeDraft {
  const lines: DraftLine[] = [];
  let group: string | undefined;
  for (const ri of recipe.ingredients) {
    // A blank heading ends a section, for ungrouped items that follow a group.
    if ((ri.group ?? undefined) !== group) lines.push({ kind: 'heading', key: key(), text: ri.group ?? '' });
    group = ri.group;
    const line: IngredientLine = {
      kind: 'ingredient',
      key: key(),
      amount: amountText(ri.quantity),
      unit: ri.unit ?? '',
      name: catalog.get(ri.ingredientId)?.name ?? '',
      note: ri.note ?? '',
      optional: !!ri.optional,
    };
    lines.push(repair ? repairIngredientLine(line) : line);
  }
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description ?? '',
    servings: numText(recipe.servings),
    prepMinutes: numText(recipe.prepMinutes),
    cookMinutes: numText(recipe.cookMinutes),
    keepsForDays: numText(recipe.keepsForDays),
    usMeasures: recipe.measureStandard === 'us',
    tags: (recipe.tags ?? []).join(', '),
    sourceUrl: recipe.sourceUrl ?? '',
    notes: recipe.notes ?? '',
    photoUrls: recipe.photoUrls ?? [],
    lines: lines.length ? lines : [blankIngredient()],
    steps: recipe.steps.length
      ? recipe.steps.map((s) => ({ key: key(), text: s.text, photo: s.photoUrl }))
      : [blankStep()],
  };
}

/** Turns pasted text, one ingredient per line, into editor lines. Lines ending in ":" become headings. */
export function linesFromText(text: string, headings = true): DraftLine[] {
  const out: DraftLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (headings && /:$/.test(line) && !/^\d/.test(line)) {
      out.push({ kind: 'heading', key: key(), text: line.replace(/:$/, '').trim() });
      continue;
    }
    const p = parseIngredientLine(line);
    if (!p) continue;
    out.push({
      kind: 'ingredient',
      key: key(),
      amount: amountText(p.quantity),
      unit: p.unit ?? '',
      name: p.name,
      note: p.note ?? '',
      optional: p.optional,
    });
  }
  return out;
}

/** Steps from pasted text: one per paragraph or line, with "1." style numbers removed. */
export function stepsFromText(text: string): StepLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^(step\s*)?\d+[.):]\s*/i, '').trim())
    .filter(Boolean)
    .map((t) => ({ key: key(), text: t }));
}

export interface DraftErrors {
  title?: string;
  servings?: string;
  prepMinutes?: string;
  cookMinutes?: string;
  keepsForDays?: string;
  /** By line key. */
  lines: Record<string, string>;
}

export const hasErrors = (e: DraftErrors) =>
  !!(e.title || e.servings || e.prepMinutes || e.cookMinutes || e.keepsForDays || Object.keys(e.lines).length);

const wholeNumber = (s: string, min: number) => {
  const t = s.trim();
  if (!t) return { value: undefined as number | undefined };
  const n = Number(t);
  if (!Number.isInteger(n) || n < min) return { error: `Enter a whole number${min > 0 ? ` from ${min}` : ''}.` };
  return { value: n };
};

const isEmptyIngredient = (l: IngredientLine) => !l.amount.trim() && !l.unit.trim() && !l.name.trim() && !l.note.trim();

export function validateDraft(d: RecipeDraft): DraftErrors {
  const errors: DraftErrors = { lines: {} };
  if (!d.title.trim()) errors.title = 'Give the recipe a name.';
  const servings = Number(d.servings.trim());
  if (!d.servings.trim() || !Number.isFinite(servings) || servings <= 0) errors.servings = 'How many servings does it make?';
  for (const field of ['prepMinutes', 'cookMinutes'] as const) {
    const r = wholeNumber(d[field], 0);
    if (r.error) errors[field] = r.error;
  }
  const keeps = wholeNumber(d.keepsForDays, 1);
  if (keeps.error) errors.keepsForDays = keeps.error;
  for (const l of d.lines) {
    if (l.kind !== 'ingredient' || isEmptyIngredient(l)) continue;
    if (!l.name.trim()) errors.lines[l.key] = 'What is the ingredient?';
    else if (l.amount.trim()) {
      const q = parseQuantity(l.amount);
      if (q == null || q <= 0) errors.lines[l.key] = 'Amounts look like 2, 1 1/2, 0.5 or ½.';
    }
  }
  return errors;
}

/**
 * The recipe to save. Call validateDraft first. Fields the editor doesn't
 * show (favourite) are kept from `base`.
 */
export function draftToRecipe(d: RecipeDraft, base?: Recipe): RecipeInput {
  const opt = (s: string) => s.trim() || undefined;
  const int = (s: string) => (s.trim() ? Number(s.trim()) : undefined);
  const ingredients: RecipeInput['ingredients'] = [];
  let group: string | undefined;
  for (const l of d.lines) {
    if (l.kind === 'heading') {
      group = opt(l.text);
      continue;
    }
    if (isEmptyIngredient(l) || !l.name.trim()) continue;
    const quantity = l.amount.trim() ? parseQuantity(l.amount) : null;
    ingredients.push({
      name: l.name.trim(),
      quantity,
      unit: opt(l.unit) ?? null,
      note: opt(l.note),
      group,
      // "Salt, to taste" has no amount, so there is nothing to scale.
      scalable: quantity != null,
      optional: l.optional || undefined,
    });
  }
  const tags = [...new Set(d.tags.split(',').map((t) => t.trim()).filter(Boolean))];
  return {
    id: d.id ?? base?.id ?? uuid(),
    title: d.title.trim(),
    description: opt(d.description),
    servings: Number(d.servings.trim()),
    // The editor only offers US or the household's own; keep any other standard an import set.
    measureStandard: d.usMeasures ? 'us' : base?.measureStandard === 'us' ? null : (base?.measureStandard ?? null),
    keepsForDays: int(d.keepsForDays) ?? null,
    prepMinutes: int(d.prepMinutes),
    cookMinutes: int(d.cookMinutes),
    photoUrls: d.photoUrls.filter(Boolean),
    tags,
    sourceUrl: opt(d.sourceUrl),
    notes: opt(d.notes),
    favourite: base?.favourite ?? false,
    ingredients,
    // A step with only a photo is kept; one with neither text nor photo is dropped.
    steps: d.steps
      .filter((s) => s.text.trim() || s.photo)
      .map((s) => ({ text: s.text.trim(), photoUrl: s.photo || undefined })),
  };
}

/** An editor draft from a recipe found on a web page, for the person to check before saving. */
export function draftFromImport(r: ImportedRecipe, householdSize = 4): RecipeDraft {
  const lines: DraftLine[] = [];
  for (const group of r.ingredients) {
    // A blank heading after a section ends it, so an unnamed group isn't swallowed by the one above.
    if (group.heading || lines.length) lines.push({ kind: 'heading', key: key(), text: group.heading ?? '' });
    lines.push(...linesFromText(group.items.join('\n'), false));
  }
  // Steps have no sections, so a section name is a step of its own ending in ":",
  // which the recipe page shows as a sub-heading: "Garlic Confit:" then its steps.
  const steps: StepLine[] = r.instructions.flatMap((g) => [
    ...(g.heading ? [{ key: key(), text: `${g.heading.replace(/:+$/, '')}:` }] : []),
    ...g.steps.map((text) => ({ key: key(), text })),
  ]);
  return {
    ...emptyDraft(householdSize),
    title: r.title,
    description: r.description ?? '',
    servings: String(r.servings ?? householdSize),
    prepMinutes: r.prepMinutes != null ? String(r.prepMinutes) : '',
    cookMinutes: r.cookMinutes != null ? String(r.cookMinutes) : '',
    tags: r.tags.join(', '),
    sourceUrl: r.sourceUrl,
    notes: r.notes ?? '',
    lines: lines.length ? lines : [blankIngredient()],
    steps: steps.length ? steps : [blankStep()],
    photoUrls: r.imageUrl ? [r.imageUrl] : [],
  };
}
