import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Stepper, Text, useTheme } from '@/components/Themed';
import { addDays, buildBatches, entryRoles, fortnightDates, formatFraction, MEAL_SLOTS, type MealSlot } from '@/src/core';
import { useRecipeMap, useStore } from '@/src/state/store';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
};

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function PlannerScreen() {
  const { state, dispatch } = useStore();
  const recipes = useRecipeMap();
  const c = useTheme();
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState<string | null>(null); // "date|slot"

  const days = fortnightDates(anchor);
  const roles = useMemo(() => entryRoles(buildBatches(state.plan, recipes)), [state.plan, recipes]);
  const entryAt = (date: string, slot: MealSlot) => state.plan.find((e) => e.date === date && e.slot === slot);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <RNView style={styles.nav}>
        <Button title="‹ Previous" kind="secondary" onPress={() => setAnchor(addDays(days[0], -14))} />
        <Text variant="muted">
          {dayFormat.format(new Date(days[0]))} – {dayFormat.format(new Date(days[13]))}
        </Text>
        <Button title="Next ›" kind="secondary" onPress={() => setAnchor(addDays(days[0], 14))} />
      </RNView>

      {days.map((date) => (
        <Card key={date} style={styles.day}>
          <Text variant="heading">{dayFormat.format(new Date(date))}</Text>
          {MEAL_SLOTS.map((slot) => {
            const entry = entryAt(date, slot);
            const recipe = entry?.recipeId ? recipes.get(entry.recipeId) : undefined;
            const role = entry ? roles.get(entry.id) : undefined;
            const key = `${date}|${slot}`;
            const isOpen = open === key;
            return (
              <RNView key={slot}>
                <Pressable
                  onPress={() => setOpen(isOpen ? null : key)}
                  style={[styles.slot, { borderTopColor: c.border }]}
                  accessibilityLabel={`${SLOT_LABEL[slot]}: ${recipe?.title ?? 'nothing planned'}`}>
                  <Text variant="label" style={styles.slotLabel}>
                    {SLOT_LABEL[slot].toUpperCase()}
                  </Text>
                  <RNView style={{ flex: 1 }}>
                    <Text style={recipe ? undefined : { color: c.textMuted }}>{recipe?.title ?? 'Add a meal'}</Text>
                    {entry && role ? (
                      <Text variant="muted">
                        {entry.servings} serving{entry.servings === 1 ? '' : 's'} ·{' '}
                        {role.kind === 'cook' ? (
                          <Text style={{ color: c.tint }}>
                            Cook {formatFraction(role.batch.factor)}× ({role.batch.servings} servings)
                          </Text>
                        ) : (
                          <Text style={{ color: c.accent }}>Leftovers</Text>
                        )}
                      </Text>
                    ) : null}
                  </RNView>
                </Pressable>
                {isOpen ? (
                  <RNView style={styles.picker}>
                    {entry ? (
                      <Stepper
                        value={entry.servings}
                        label="servings"
                        onChange={(v) => dispatch({ type: 'setMealServings', entryId: entry.id, servings: v })}
                      />
                    ) : null}
                    <RNView style={styles.chips}>
                      {state.recipes.map((r) => {
                        const selected = r.id === entry?.recipeId;
                        return (
                          <Pressable
                            key={r.id}
                            onPress={() => dispatch({ type: 'setMeal', date, slot, recipeId: r.id, servings: entry?.servings })}
                            style={[
                              styles.chip,
                              { borderColor: c.tint, backgroundColor: selected ? c.tint : 'transparent' },
                            ]}>
                            <Text style={{ color: selected ? c.onTint : c.tint, fontSize: 14 }}>{r.title}</Text>
                          </Pressable>
                        );
                      })}
                    </RNView>
                    {entry ? (
                      <Button
                        title="Clear"
                        kind="secondary"
                        onPress={() => {
                          dispatch({ type: 'setMeal', date, slot, recipeId: null });
                          setOpen(null);
                        }}
                      />
                    ) : null}
                  </RNView>
                ) : null}
              </RNView>
            );
          })}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  day: { gap: 4 },
  slot: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  slotLabel: { width: 88, paddingTop: 3 },
  picker: { gap: 12, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
});
