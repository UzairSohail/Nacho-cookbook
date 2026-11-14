/**
 * The household pantry: things you keep at home. A shopping list line for a
 * pantry ingredient moves off the list into "Already at home", so it isn't
 * bought, counted or shared, but you can still see it and put it back.
 */
import type { ListItem } from './shoppingList';

/** The ingredient a generated line is for ("<ingredient id>|<kind>"), or null for a line added by hand. */
export const lineIngredientId = (item: Pick<ListItem, 'key'>): string | null =>
  item.key ? item.key.split('|')[0] : null;

/**
 * Splits the list into what to buy and what's already at home. Only lines made
 * from the plan move: a line someone typed in by hand is always kept, because
 * they asked for it.
 */
export function splitByPantry<T extends Pick<ListItem, 'key'>>(
  list: T[],
  pantry: Iterable<string>,
): { toGet: T[]; atHome: T[] } {
  const have = new Set(pantry);
  const toGet: T[] = [];
  const atHome: T[] = [];
  for (const item of list) {
    const id = lineIngredientId(item);
    (id && have.has(id) ? atHome : toGet).push(item);
  }
  return { toGet, atHome };
}
