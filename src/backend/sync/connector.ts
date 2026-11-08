/**
 * How PowerSync talks to our backend: it signs in with the Supabase session and
 * sends queued local changes to Supabase. Row level security on the server
 * checks every change.
 */
import { UpdateType, type CommonPowerSyncDatabase, type CrudEntry, type PowerSyncBackendConnector } from '@powersync/common';

import { supabase } from '../supabase';
import { isPermanentError, toServerValues } from './upload';

export const powerSyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL || null;

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    if (!supabase || !powerSyncUrl) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error(`Not signed in: ${error?.message ?? 'no session'}`);
    return {
      endpoint: powerSyncUrl,
      token: data.session.access_token,
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : undefined,
    };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    if (!supabase) return;
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let current: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        current = op;
        const table = supabase.from(op.table);
        const values = toServerValues(op.table, op.opData);
        const result =
          op.op === UpdateType.PUT
            ? await table.upsert({ ...values, id: op.id })
            : op.op === UpdateType.PATCH
              ? await table.update(values).eq('id', op.id)
              : await table.delete().eq('id', op.id);
        if (result.error) throw result.error;
      }
      await transaction.complete();
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (isPermanentError(code)) {
        // Retrying won't help, and it would hold up every later change.
        console.error('Sync: the server rejected a change, skipping it', current, e);
        await transaction.complete();
      } else {
        // Probably offline or a temporary server problem: PowerSync retries later.
        throw e;
      }
    }
  }
}
