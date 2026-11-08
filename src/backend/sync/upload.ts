/**
 * Turning queued local changes into values Supabase accepts. Kept free of
 * PowerSync and Supabase imports so it can be unit tested.
 */

/** Columns stored as Postgres arrays (JSON text on the device). */
const ARRAY_COLUMNS: Record<string, string[]> = {
  recipes: ['photo_paths', 'tags'],
  shopping_items: ['sources'],
};

/** Columns stored as Postgres booleans (0/1 on the device). */
const BOOLEAN_COLUMNS: Record<string, string[]> = {
  recipes: ['favourite'],
  recipe_ingredients: ['scalable', 'optional'],
  shopping_items: ['checked', 'edited'],
};

/** Columns the server owns; never sent back up. */
const SERVER_COLUMNS = new Set(['created_at', 'updated_at', 'joined_at', 'invite_code']);

export function toServerValues(table: string, data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (SERVER_COLUMNS.has(k)) continue;
    if (ARRAY_COLUMNS[table]?.includes(k)) {
      out[k] = parseArray(v);
    } else if (BOOLEAN_COLUMNS[table]?.includes(k)) {
      out[k] = v == null ? v : Number(v) === 1 || v === true;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function parseArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Postgres errors that retrying can never fix (bad data, a broken constraint,
 * or row level security saying no). Those changes are dropped so they don't
 * block everything queued behind them.
 */
export function isPermanentError(code: unknown): boolean {
  return typeof code === 'string' && (/^22...$/.test(code) || /^23...$/.test(code) || code === '42501');
}
