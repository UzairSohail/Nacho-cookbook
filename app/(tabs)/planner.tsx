import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { router } from 'expo-router';

import { RecipeBrowser } from '@/components/RecipeBrowser';
import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Card, Chip, Stepper, Text, TextInput, useTheme } from '@/components/Themed';
import { addDays, formatFraction, periodRange, plannedRecipes, searchRecipes, today, type Recipe } from '@/src/core';
import { periodName, setPlanPeriod, usePlanPeriod } from '@/src/state/planPeriod';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function PlannerScreen() {
  const { state, dispatch } = useStore();
  const recipes = useRecipeMap();
  const catalog = useCatalog();
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
  const [browsing, setBrowsing] = useState(false);
  const q = filter.trim();
  const ingredientName = useCallback((id: string) => catalog.get(id)?.name, [catalog]);
  const suggestions = useMemo(
    () => searchRecipes(q, state.recipes, ingredientName, 6),
    [q, state.recipes, ingredientName],
  );
  const toggle = (recipe: Recipe, isPlanned: boolean) =>
    dispatch(
      isPlanned
        ? { type: 'unplanRecipe', range, recipeId: recipe.id }
        : { type: 'planRecipe', range, recipeId: recipe.id },
    );

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
          <>
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="Type a recipe name"
              accessibilityLabel="Type a recipe name to add it"
              returnKeyType="done"
              autoCorrect={false}
              onSubmitEditing={() => {
                const first = suggestions[0];
                if (first && !plannedIds.has(first.id)) toggle(first, false);
                setFilter('');
              }}
            />
            {q ? (
              suggestions.length === 0 ? (
                <Text variant="muted">No recipes match “{filter.trim()}”.</Text>
              ) : (
                <RNView accessibilityRole="list" style={[styles.suggestions, { borderColor: c.border }]}>
                  {suggestions.map((r, i) => {
                    const added = plannedIds.has(r.id);
                    return (
                      <Pressable
                        key={r.id}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: added }}
                        accessibilityLabel={added ? `${r.title}, added. Tap to take it off` : `Add ${r.title}`}
                        onPress={() => {
                          toggle(r, added);
                          if (!added) setFilter('');
                        }}
                        style={({ pressed }) => [
                          styles.suggestion,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                          { opacity: pressed ? 0.7 : 1 },
                        ]}>
                        <RecipePhoto path={r.photoUrls?.[0]} fallbackLetter={r.title[0]} style={styles.thumb} />
                        <Text style={{ flex: 1 }} numberOfLines={2}>
                          {r.title}
                        </Text>
                        <Text style={{ color: added ? c.accent : c.tint, fontSize: 14, fontWeight: '600' }}>
                          {added ? '✓ Added' : '+ Add'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </RNView>
              )
            ) : null}
            <Button
              title={`Browse all ${state.recipes.length} recipes`}
              kind="secondary"
              onPress={() => setBrowsing(true)}
            />
            <Text variant="muted">Added recipes are made for {state.settings.householdSize} servings. You can change that above.</Text>
          </>
        )}
      </Card>

      <RecipeBrowser
        visible={browsing}
        recipes={state.recipes}
        plannedIds={plannedIds}
        ingredientName={ingredientName}
        onToggle={toggle}
        onClose={() => setBrowsing(false)}
      />
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
  suggestions: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8, minHeight: 56 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  plannedTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
});
