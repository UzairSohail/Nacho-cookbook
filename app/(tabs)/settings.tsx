import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { useState } from 'react';

import { Button, Card, Chip, Stepper, Text, TextInput, useTheme } from '@/components/Themed';
import { useAuth } from '@/src/backend/auth';
import type { MeasureStandard, UnitSystem } from '@/src/core';
import { useStore, type SyncInfo } from '@/src/state/store';

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  return (
    <RNView style={styles.row}>
      {options.map(([key, label]) => (
        <Chip key={key} label={label} role="radio" selected={value === key} onPress={() => onChange(key)} />
      ))}
    </RNView>
  );
}

function syncLabel(sync: SyncInfo): string {
  if (sync.mode === 'demo') return '';
  if (sync.mode === 'local') return 'Sync isn’t set up yet: changes stay on this device until the app restarts.';
  if (!sync.connected && sync.authRejected)
    return 'Can’t sync: the sync server didn’t accept your sign-in, so changes from your household won’t show up yet. Your own changes are saved on this device.';
  if (!sync.connected) return 'Offline. Changes are saved on this device and sync when you’re back online.';
  if (sync.uploading || sync.downloading) return 'Syncing…';
  if (!sync.hasSynced) return 'Connecting…';
  return 'Up to date with your household.';
}

export default function SettingsScreen() {
  const { state, dispatch, sync } = useStore();
  const auth = useAuth();
  const c = useTheme();
  const { settings } = state;
  const [find, setFind] = useState('');
  const staples = new Set(state.pantry);
  const q = find.trim().toLowerCase();
  // Staples first so they're easy to review; the rest only once you search, since the list grows with every recipe.
  const ingredients = [...state.ingredients]
    .filter((i) => (q ? i.name.toLowerCase().includes(q) : staples.has(i.id)))
    .sort((a, b) => Number(staples.has(b.id)) - Number(staples.has(a.id)) || a.name.localeCompare(b.name));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Card style={styles.gap}>
        <Text variant="label">HOUSEHOLD</Text>
        {auth.demoMode ? (
          <Text variant="muted">Demo mode: running on sample data on this device only.</Text>
        ) : (
          <>
            <Text variant="heading">{auth.household?.name}</Text>
            <Text variant="muted">Signed in as {auth.account?.email}</Text>
            <Text variant="muted">{syncLabel(sync)}</Text>
            <Text variant="muted">Invite code (share it so others can join):</Text>
            <Text selectable style={{ fontSize: 22, letterSpacing: 2, color: c.tint }}>
              {auth.household?.inviteCode}
            </Text>
            <Button title="Sign out" kind="secondary" onPress={auth.signOut} />
          </>
        )}
      </Card>

      <Card style={styles.gap}>
        <Text variant="label">HOUSEHOLD SIZE</Text>
        <Text variant="muted">New meals in the planner default to this many servings.</Text>
        <Stepper
          value={settings.householdSize}
          label="people"
          onChange={(v) => dispatch({ type: 'settings', patch: { householdSize: v } })}
        />
      </Card>

      <Card style={styles.gap}>
        <Text variant="label">UNITS</Text>
        <Choice<UnitSystem>
          options={[['metric', 'Metric'], ['imperial', 'Imperial']]}
          value={settings.system}
          onChange={(system) => dispatch({ type: 'settings', patch: { system } })}
        />
        <Text variant="label" style={{ marginTop: 8 }}>YOUR CUP AND SPOON SIZES</Text>
        <Text variant="muted">Recipes can be marked as using US measures and are converted to these.</Text>
        <Choice<MeasureStandard>
          options={[['au', 'Australian (20 ml tbsp)'], ['metric', 'Metric (15 ml tbsp)'], ['us', 'US (237 ml cup)']]}
          value={settings.standard}
          onChange={(standard) => dispatch({ type: 'settings', patch: { standard } })}
        />
      </Card>

      <Card style={styles.gap}>
        <Text variant="label">PANTRY STAPLES</Text>
        <Text variant="muted">
          Things you usually keep in the house. They stay on the shopping list, marked so you can check the cupboard
          before you buy more.
        </Text>
        <TextInput value={find} onChangeText={setFind} placeholder="Find an ingredient to add" accessibilityLabel="Find an ingredient" />
        {!q && ingredients.length === 0 ? <Text variant="muted">No staples yet. Search above to add some.</Text> : null}
        {q && ingredients.length === 0 ? <Text variant="muted">No ingredients match “{find}”.</Text> : null}
        {ingredients.map((i) => {
          const on = state.pantry.includes(i.id);
          return (
            <Pressable
              key={i.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => dispatch({ type: 'togglePantry', ingredientId: i.id })}
              style={[styles.staple, { borderBottomColor: c.border }]}>
              <RNView style={[styles.check, { borderColor: c.accent, backgroundColor: on ? c.accent : 'transparent' }]}>
                {on ? <Text style={{ color: c.onTint, fontSize: 14 }}>✓</Text> : null}
              </RNView>
              <Text>{i.name}</Text>
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  staple: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
