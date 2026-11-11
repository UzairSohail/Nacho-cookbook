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
  // PGRST204: a column the server doesn't have yet (a migration not run). Retrying won't add it.
  return typeof code === 'string' && (/^22...$/.test(code) || /^23...$/.test(code) || code === '42501' || code === 'PGRST204');
}

/** PowerSync reports a refused sign-in token as an HTTP 401 / PSYNC_S21xx error. */
export function isAuthRejection(error: Error | undefined): boolean {
  return !!error && /\b401\b|unauthori[sz]ed|PSYNC_S21\d\d/i.test(error.message);
}

/** The parts of a queued PowerSync change the upload needs. */
export interface QueuedChange {
  op: 'PUT' | 'PATCH' | 'DELETE';
  table: string;
  id: string;
  opData?: Record<string, unknown>;
}

export type UploadStep =
  | { kind: 'upsert'; table: string; rows: Record<string, unknown>[]; changes: QueuedChange[] }
  | { kind: 'update'; table: string; id: string; values: Record<string, unknown>; change: QueuedChange }
  | { kind: 'delete'; table: string; id: string; change: QueuedChange };

/**
 * Groups queued changes into as few requests as possible while keeping their
 * order: back-to-back inserts into the same table go up as one upsert. A
 * column missing from one row is sent as null, which is what an insert of
 * that row means (the device leaves empty columns out). Adding the sample
 * recipes was ~35 requests one at a time.
 */
export function planUpload(changes: QueuedChange[]): UploadStep[] {
  const steps: UploadStep[] = [];
  for (const change of changes) {
    const values = toServerValues(change.table, change.opData);
    if (change.op === 'PUT') {
      const row = { ...values, id: change.id };
      const last = steps[steps.length - 1];
      if (last?.kind === 'upsert' && last.table === change.table && !last.rows.some((r) => r.id === change.id)) {
        last.rows.push(row);
        last.changes.push(change);
      } else {
        steps.push({ kind: 'upsert', table: change.table, rows: [row], changes: [change] });
      }
    } else if (change.op === 'PATCH') {
      steps.push({ kind: 'update', table: change.table, id: change.id, values, change });
    } else {
      steps.push({ kind: 'delete', table: change.table, id: change.id, change });
    }
  }
  return steps;
}
