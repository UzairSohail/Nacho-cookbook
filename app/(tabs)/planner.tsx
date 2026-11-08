import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { router } from 'expo-router';

import { Button, Card, Stepper, Text, TextInput, useTheme } from '@/components/Themed';
import { addDays, buildBatches, today, entryRoles, fortnightDates, formatFraction, MEAL_SLOTS, type MealSlot } from '@/src/core';
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
  const todayIso = today();
  const [anchor, setAnchor] = useState(todayIso);
  const [open, setOpen] = useState<string | null>(null); // "date|slot"
  const [filter, setFilter] = useState('');

  const days = fortnightDates(anchor);
  const showingToday = days.includes(todayIso);
  const q = filter.trim().toLowerCase();
  const choices = q ? state.recipes.filter((r) => r.title.toLowerCase().includes(q)) : state.recipes;
  const roles = useMemo(() => entryRoles(buildBatches(state.plan, recipes)), [state.plan, recipes]);
  const entryAt = (date: string, slot: MealSlot) => state.plan.find((e) => e.date === date && e.slot === slot);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <RNView style={styles.nav}>
        <Button
          title="‹"
          kind="secondary"
          accessibilityLabel="Previous fortnight"
          style={styles.navButton}
          onPress={() => setAnchor(addDays(days[0], -14))}
        />
        <RNView style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            {dayFormat.format(new Date(days[0]))} – {dayFormat.format(new Date(days[13]))}
          </Text>
          {showingToday ? null : (
            <Pressable accessibilityRole="button" onPress={() => setAnchor(todayIso)} hitSlop={8}>
              <Text style={{ color: c.tint, fontSize: 14 }}>Back to this fortnight</Text>
            </Pressable>
          )}
        </RNView>
        <Button
          title="›"
          kind="secondary"
          accessibilityLabel="Next fortnight"
          style={styles.navButton}
          onPress={() => setAnchor(addDays(days[0], 14))}
        />
      </RNView>

      {days.map((date) => (
        <Card key={date} style={[styles.day, date === todayIso ? { borderColor: c.tint, borderWidth: 1.5 } : null]}>
          <RNView style={styles.dayTitle}>
            <Text variant="heading">{dayFormat.format(new Date(date))}</Text>
            {date === todayIso ? <Text style={{ color: c.tint, fontSize: 14 }}>Today</Text> : null}
          </RNView>
          {MEAL_SLOTS.map((slot) => {
            const entry = entryAt(date, slot);
            const recipe = entry?.recipeId ? recipes.get(entry.recipeId) : undefined;
            const role = entry ? roles.get(entry.id) : undefined;
            const key = `${date}|${slot}`;
            const isOpen = open === key;
            return (
              <RNView key={slot}>
                <Pressable
                  onPress={() => {
                    setOpen(isOpen ? null : key);
                    setFilter('');
                  }}
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
                    {state.recipes.length === 0 ? (
                      <RNView style={{ gap: 8 }}>
                        <Text variant="muted">You don’t have any recipes yet.</Text>
                        <Button title="Add a recipe" kind="secondary" onPress={() => router.navigate('/')} />
                      </RNView>
                    ) : null}
                    {state.recipes.length > 8 ? (
                      <TextInput
                        value={filter}
                        onChangeText={setFilter}
                        placeholder="Find a recipe"
                        accessibilityLabel="Find a recipe"
                      />
                    ) : null}
                    {q && choices.length === 0 ? <Text variant="muted">No recipes match “{filter}”.</Text> : null}
                    <RNView style={styles.chips}>
                      {choices.map((r) => {
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
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navButton: { width: 48, paddingHorizontal: 0 },
  day: { gap: 4 },
  dayTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  slot: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  slotLabel: { width: 88, paddingTop: 3 },
  picker: { gap: 12, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
});

