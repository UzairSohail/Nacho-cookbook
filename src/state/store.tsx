/**
 * App state. Screens only use the hooks below, so they don't know where the
 * data lives:
 *
 * - Signed in with sync set up: the offline database on this device, kept in
 *   step with the household through PowerSync. Works with no connection.
 * - Otherwise (demo mode, or sync not set up yet): sample data in memory.
 */
import type { CommonPowerSyncDatabase } from '@powersync/common';
import { PowerSyncContext, useQuery, useStatus } from '@powersync/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';

import { fortnightDates } from '@/src/core';
import { useAuth } from '@/src/backend/auth';
import { SupabaseConnector } from '@/src/backend/sync/connector';
import { getDatabase } from '@/src/backend/sync/database';
import { isAuthRejection } from '@/src/backend/sync/upload';
import { reducer, planEntryId, type Action, type State } from './reducer';
import { diffState, rowsToState, type Row, type Rows, type TableName } from './rows';
import { toSql } from './sql';
import { samplePantry, samplePlan, sampleIngredients, sampleRecipes } from './sampleData';

export type { Action, Settings, State } from './reducer';

export type SyncInfo =
  | { mode: 'demo' }
  | { mode: 'local' } // signed in, but sync isn't set up yet
  | {
      mode: 'synced';
      connected: boolean;
      uploading: boolean;
      downloading: boolean;
      hasSynced: boolean;
      lastSyncedAt?: Date;
      /** The sync server refused this device's sign-in (a setup problem, not being offline). */
      authRejected: boolean;
    };

interface StoreValue {
  state: State;
  dispatch: (a: Action) => void;
  sync: SyncInfo;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const db = getDatabase();
  const householdId = auth.household?.id;
  if (db && householdId && !auth.demoMode) {
    return (
      <PowerSyncContext.Provider value={db}>
        <SyncedStore key={householdId} db={db} householdId={householdId}>
          {children}
        </SyncedStore>
      </PowerSyncContext.Provider>
    );
  }
  return <MemoryStore mode={auth.demoMode ? 'demo' : 'local'}>{children}</MemoryStore>;
}

// ---- in memory ------------------------------------------------------------

function demoState(): State {
  const householdId = 'demo';
  const settings = { householdSize: 2, system: 'metric' as const, standard: 'au' as const };
  const today = new Date().toISOString().slice(0, 10);
  return {
    householdId,
    settings,
    recipes: sampleRecipes,
    ingredients: sampleIngredients,
    plan: samplePlan(fortnightDates(today), settings.householdSize).map((e) => ({
      ...e,
      id: planEntryId(householdId, e.date, e.slot),
    })),
    pantry: samplePantry,
    list: [],
    dismissedKeys: [],
  };
}

function MemoryStore({ mode, children }: { mode: 'demo' | 'local'; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, demoState);
  const value = useMemo<StoreValue>(() => ({ state, dispatch, sync: { mode } }), [state, mode]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// ---- synced ---------------------------------------------------------------

function useTable(table: TableName, householdId: string) {
  const column = table === 'households' ? 'id' : 'household_id';
  // Table names are fixed in this file, never from user input.
  return useQuery<Row & { id: string }>(`SELECT * FROM ${table} WHERE ${column} = ? ORDER BY id`, [householdId]).data;
}

function SyncedStore({ db, householdId, children }: { db: CommonPowerSyncDatabase; householdId: string; children: ReactNode }) {
  const households = useTable('households', householdId);
  const ingredients = useTable('ingredients', householdId);
  const recipes = useTable('recipes', householdId);
  const recipeIngredients = useTable('recipe_ingredients', householdId);
  const recipeSteps = useTable('recipe_steps', householdId);
  const plan = useTable('plan_entries', householdId);
  const pantry = useTable('pantry_staples', householdId);
  const items = useTable('shopping_items', householdId);
  const dismissed = useTable('shopping_dismissed', householdId);
  const status = useStatus();

  const state = useMemo(() => {
    const rows: Rows = {
      households, ingredients, recipes, recipe_ingredients: recipeIngredients, recipe_steps: recipeSteps,
      plan_entries: plan, pantry_staples: pantry, shopping_items: items, shopping_dismissed: dismissed,
    };
    return rowsToState(rows, householdId);
  }, [households, ingredients, recipes, recipeIngredients, recipeSteps, plan, pantry, items, dismissed, householdId]);

  // Latest state including changes not yet echoed back by the watched queries,
  // so two quick taps build on each other.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    db.connect(new SupabaseConnector()).catch((e) => console.warn('Sync: could not connect', e));
    return () => {
      db.disconnect().catch(() => {});
    };
  }, [db]);

  const dispatch = useCallback(
    (action: Action) => {
      const before = latest.current;
      const after = reducer(before, action);
      latest.current = after;
      const writes = diffState(before, after);
      if (!writes.length) return;
      db.writeTransaction(async (tx) => {
        for (const w of writes) {
          const { sql, params } = toSql(w);
          await tx.execute(sql, params);
        }
      }).catch((e) => console.error('Could not save change', action.type, e));
    },
    [db],
  );

  const sync = useMemo<SyncInfo>(
    () => ({
      mode: 'synced',
      connected: status.connected,
      uploading: status.dataFlowStatus.uploading,
      downloading: status.dataFlowStatus.downloading,
      hasSynced: status.hasSynced ?? false,
      lastSyncedAt: status.lastSyncedAt,
      authRejected: isAuthRejection(status.dataFlowStatus.downloadError),
    }),
    [status],
  );

  const value = useMemo<StoreValue>(() => ({ state, dispatch, sync }), [state, dispatch, sync]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// ---- hooks ----------------------------------------------------------------

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function useCatalog() {
  const { state } = useStore();
  return useMemo(() => new Map(state.ingredients.map((i) => [i.id, i])), [state.ingredients]);
}

export function useRecipeMap() {
  const { state } = useStore();
  return useMemo(() => new Map(state.recipes.map((r) => [r.id, r])), [state.recipes]);
}
