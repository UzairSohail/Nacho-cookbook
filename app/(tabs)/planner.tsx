import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { router } from 'expo-router';

import { Button, Card, Chip, Stepper, Text, TextInput, useTheme } from '@/components/Themed';
import { addDays, formatFraction, periodRange, plannedRecipes, today } from '@/src/core';
import { periodName, setPlanPeriod, usePlanPeriod } from '@/src/state/planPeriod';
import { useRecipeMap, useStore } from '@/src/state/store';

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function PlannerScreen() {
  const { state, dispatch } = useStore();
  const recipes = useRecipeMap();
  const c = useTheme();
  const period = usePlanPeriod();
  const name = periodName(period);
  const todayIso = today();
  const [anchor, setAnchor] = useState(todayIso);
  const [filter, setFilter] = useState('');

  const range = periodRange(anchor, period);
  const showingToday = todayIso >= range.start && todayIso <= range.end;
  const planned = plannedRecipes(state.plan, range).filter((p) => recipes.has(p.recipeId));
  const plannedIds = new Set(planned.map((p) => p.recipeId));
  const q = filter.trim().toLowerCase();
  const choices = (q ? state.recipes.filter((r) => r.title.toLowerCase().includes(q)) : state.recipes)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <RNView style={styles.row}>
        {([7, 14] as const).map((p) => (
          <Chip
            key={p}
            role="radio"
            label={p === 7 ? 'Week' : 'Fortnight'}
            selected={period === p}
            onPress={() => setPlanPeriod(p)}
          />
        ))}
      </RNView>

      <RNView style={styles.nav}>
        <Button
          title="‹"
          kind="secondary"
          accessibilityLabel={`Previous ${name}`}
          style={styles.navButton}
          onPress={() => setAnchor(addDays(range.start, -period))}
        />
        <RNView style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            {dayFormat.format(new Date(range.start))} – {dayFormat.format(new Date(range.end))}
          </Text>
          {showingToday ? null : (
            <Pressable accessibilityRole="button" onPress={() => setAnchor(todayIso)} hitSlop={8}>
              <Text style={{ color: c.tint, fontSize: 14 }}>Back to this {name}</Text>
            </Pressable>
          )}
        </RNView>
        <Button
          title="›"
          kind="secondary"
          accessibilityLabel={`Next ${name}`}
          style={styles.navButton}
          onPress={() => setAnchor(addDays(range.start, period))}
        />
      </RNView>

      <Card style={styles.gap}>
        <Text variant="label">{`RECIPES THIS ${name.toUpperCase()}`}</Text>
        {planned.length === 0 ? (
          <Text variant="muted">Nothing planned yet. Add recipes below and their ingredients go on the shopping list.</Text>
        ) : (
          planned.map((p) => {
            const recipe = recipes.get(p.recipeId)!;
            const factor = recipe.servings > 0 ? p.servings / recipe.servings : 1;
            return (
              <RNView key={p.recipeId} style={[styles.planned, { borderTopColor: c.border }]}>
                <RNView style={styles.plannedTitle}>
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityRole="link"
                    onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}>
                    <Text variant="heading">{recipe.title}</Text>
                    <Text variant="muted" style={{ color: c.tint }}>
                      Make {formatFraction(factor)}× the recipe
                    </Text>
                  </Pressable>
                  <Button
                    title="Remove"
                    kind="secondary"
                    accessibilityLabel={`Remove ${recipe.title}`}
                    onPress={() => dispatch({ type: 'unplanRecipe', range, recipeId: p.recipeId })}
                  />
                </RNView>
                <Stepper
                  value={p.servings}
                  label="servings"
                  onChange={(v) => dispatch({ type: 'setPlannedServings', range, recipeId: p.recipeId, servings: v })}
                />
              </RNView>
            );
          })
        )}
        {planned.length ? (
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/list')} hitSlop={8}>
            <Text style={{ color: c.tint }}>The shopping list is up to date. Open it ›</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card style={styles.gap}>
        <Text variant="label">ADD A RECIPE</Text>
        {state.recipes.length === 0 ? (
          <RNView style={{ gap: 8 }}>
            <Text variant="muted">You don’t have any recipes yet.</Text>
            <Button title="Add a recipe" kind="secondary" onPress={() => router.navigate('/')} />
          </RNView>
        ) : (
          <Text variant="muted">Tap a recipe to add it for {state.settings.householdSize} servings. Tap again to take it off.</Text>
        )}
        {state.recipes.length > 8 ? (
          <TextInput value={filter} onChangeText={setFilter} placeholder="Find a recipe" accessibilityLabel="Find a recipe" />
        ) : null}
        {q && choices.length === 0 ? <Text variant="muted">No recipes match “{filter}”.</Text> : null}
        <RNView style={styles.row}>
          {choices.map((r) => {
            const selected = plannedIds.has(r.id);
            return (
              <Chip
                key={r.id}
                role="switch"
                label={selected ? `✓ ${r.title}` : r.title}
                selected={selected}
                onPress={() =>
                  dispatch(
                    selected
                      ? { type: 'unplanRecipe', range, recipeId: r.id }
                      : { type: 'planRecipe', range, recipeId: r.id },
                  )
                }
              />
            );
          })}
        </RNView>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navButton: { width: 48, paddingHorizontal: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  planned: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  plannedTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
