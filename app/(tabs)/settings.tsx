import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Stepper, Text, useTheme } from '@/components/Themed';
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
        <Pressable
          key={key}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === key }}
          onPress={() => onChange(key)}
          style={[styles.chip, { borderColor: c.tint, backgroundColor: value === key ? c.tint : 'transparent' }]}>
          <Text style={{ color: value === key ? c.onTint : c.tint, fontSize: 14 }}>{label}</Text>
        </Pressable>
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
  const ingredients = [...state.ingredients].sort((a, b) => a.name.localeCompare(b.name));

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
        <Text variant="muted">Ticked items are always in the house, so they're left off the shopping list.</Text>
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
  chip: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  staple: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
