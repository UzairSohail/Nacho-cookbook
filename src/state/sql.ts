/** SQL statements for the offline database, from the writes in rows.ts. */
import type { SqlValue, Write } from './rows';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (name: string) => {
  if (!IDENT.test(name)) throw new Error(`Bad column or table name: ${name}`);
  return name;
};

export function toSql(w: Write): { sql: string; params: SqlValue[] } {
  const table = ident(w.table);
  const cols = Object.keys(w.data ?? {}).map(ident);
  const vals = cols.map((c) => w.data![c]);
  switch (w.op) {
    case 'insert':
      return {
        sql: `INSERT INTO ${table} (id${cols.map((c) => `, ${c}`).join('')}) VALUES (?${cols.map(() => ', ?').join('')})`,
        params: [w.id, ...vals],
      };
    case 'update':
      return { sql: `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, params: [...vals, w.id] };
    case 'delete':
      return { sql: `DELETE FROM ${table} WHERE id = ?`, params: [w.id] };
  }
}
