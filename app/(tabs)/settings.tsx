import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Card, Stepper, Text, useTheme } from '@/components/Themed';
import type { MeasureStandard, UnitSystem } from '@/src/core';
import { useStore } from '@/src/state/store';

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

export default function SettingsScreen() {
  const { state, dispatch } = useStore();
  const c = useTheme();
  const { settings } = state;
  const ingredients = [...state.ingredients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
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
        <Text variant="label" style={{ marginTop: 8 }}>CUP AND SPOON SIZES</Text>
        <Choice<MeasureStandard>
          options={[['metric', 'Metric 250 ml cup'], ['au', 'Australian (20 ml tbsp)'], ['us', 'US 237 ml cup']]}
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
