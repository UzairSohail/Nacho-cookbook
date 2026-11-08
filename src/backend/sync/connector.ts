/**
 * How PowerSync talks to our backend: it signs in with the Supabase session and
 * sends queued local changes to Supabase. Row level security on the server
 * checks every change.
 */
import type { CommonPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/common';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../supabase';
import { isPermanentError, planUpload, type QueuedChange, type UploadStep } from './upload';

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

    for (const step of planUpload(transaction.crud as unknown as QueuedChange[])) {
      const error = await send(supabase, step);
      if (!error) continue;
      if (!isPermanentError(error.code)) {
        // Probably offline or a temporary server problem: PowerSync retries later.
        throw error;
      }
      if (step.kind === 'upsert' && step.rows.length > 1) {
        // One bad row fails the whole batch: send them one by one so only it is skipped.
        for (let i = 0; i < step.rows.length; i++) {
          const one: UploadStep = { kind: 'upsert', table: step.table, rows: [step.rows[i]], changes: [step.changes[i]] };
          const rowError = await send(supabase, one);
          if (!rowError) continue;
          if (!isPermanentError(rowError.code)) throw rowError;
          skipped(step.changes[i], rowError);
        }
      } else {
        skipped(step.kind === 'upsert' ? step.changes[0] : step.change, error);
      }
    }
    await transaction.complete();
  }
}

async function send(client: SupabaseClient, step: UploadStep): Promise<PostgrestError | null> {
  const table = client.from(step.table);
  const result =
    step.kind === 'upsert'
      ? await table.upsert(step.rows)
      : step.kind === 'update'
        ? await table.update(step.values).eq('id', step.id)
        : await table.delete().eq('id', step.id);
  return result.error;
}

/** Retrying won't help, and it would hold up every later change. */
function skipped(change: QueuedChange, error: PostgrestError) {
  console.error('Sync: the server rejected a change, skipping it', change, error);
}
