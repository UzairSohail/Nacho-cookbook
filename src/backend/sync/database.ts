/**
 * The offline database. Android and iOS use native SQLite; the web build uses
 * SQLite in the browser (workers copied to public/@powersync by `postinstall`).
 * Metro swaps the unused SDK for an empty module (see metro.config.js).
 */
import '@azure/core-asynciterator-polyfill';

import type { CommonPowerSyncDatabase } from '@powersync/common';
import { Platform } from 'react-native';

import { webPath } from '../supabase';
import { powerSyncUrl } from './connector';
import { AppSchema } from './schema';

const DB_FILE = 'nacho-cookbook.db';

// The SDKs are loaded only when sync is set up, so demo mode still runs in
// Expo Go, which doesn't include PowerSync's native SQLite module.
function open(): CommonPowerSyncDatabase {
  if (Platform.OS !== 'web') {
    const { PowerSyncDatabase: NativeDatabase } =
      require('@powersync/react-native') as typeof import('@powersync/react-native');
    return new NativeDatabase({ schema: AppSchema, database: { dbFilename: DB_FILE } });
  }
  const { PowerSyncDatabase: WebDatabase } = require('@powersync/web') as typeof import('@powersync/web');
  return new WebDatabase({
    schema: AppSchema,
    database: { dbFilename: DB_FILE, worker: webPath('/@powersync/worker.js') },
    sync: { worker: webPath('/@powersync/worker.js') },
  });
}

let db: CommonPowerSyncDatabase | null = null;

/** The shared database, or null when PowerSync isn't configured. */
export function getDatabase(): CommonPowerSyncDatabase | null {
  if (!powerSyncUrl) return null;
  db ??= open();
  return db;
}

export const isSyncConfigured = powerSyncUrl != null;
