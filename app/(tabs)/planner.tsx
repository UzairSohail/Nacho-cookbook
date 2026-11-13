import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { router } from 'expo-router';

import { RecipeBrowser } from '@/components/RecipeBrowser';
import { RecipePhoto } from '@/components/RecipePhoto';
import {
  Button,
  Card,
  Icon,
  IconButton,
  ScreenHeader,
  SearchField,
  Segmented,
  Stepper,
  TAB_BAR_SPACE,
  Tag,
  Text,
  useTheme,
} from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
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

  const totalServings = planned.reduce((n, p) => n + p.servings, 0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        eyebrow="What we’re eating"
        title="Planner"
        right={
          <Segmented
            accessibilityLabel="Plan length"
            options={[['7', 'Week'], ['14', 'Fortnight']] as const}
            value={String(period) as '7' | '14'}
            onChange={(v) => setPlanPeriod(Number(v) as 7 | 14)}
            style={{ width: 196 }}
          />
        }
      />

      <RNView style={styles.body}>
        <Card style={styles.nav}>
          <IconButton icon="back" tone="sunken" label={`Previous ${name}`} onPress={() => setAnchor(addDays(range.start, -period))} />
          <RNView style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text variant="subheading" style={{ fontSize: 18, textAlign: 'center' }}>
              {dayFormat.format(new Date(range.start))} – {dayFormat.format(new Date(range.end))}
            </Text>
            {showingToday ? (
              <Text variant="muted" style={{ fontSize: 12 }}>This {name}</Text>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setAnchor(todayIso)} hitSlop={8}>
                <Text style={{ color: c.tint, fontSize: 13, fontFamily: Fonts.bodyBold }}>Back to this {name}</Text>
              </Pressable>
            )}
          </RNView>
          <IconButton icon="forward" tone="sunken" label={`Next ${name}`} onPress={() => setAnchor(addDays(range.start, period))} />
        </Card>

        {planned.length ? (
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/list')}>
            {({ pressed }) => (
              <Card tone="accent" style={[styles.summary, { opacity: pressed ? 0.8 : 1 }]}>
                <Icon name="check" size={22} color={c.onAccentSoft} />
                <RNView style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 15, color: c.onAccentSoft }}>
                    {planned.length} {planned.length === 1 ? 'recipe' : 'recipes'} · {totalServings} servings
                  </Text>
                  <Text style={{ fontSize: 13, color: c.onAccentSoft }}>The shopping list is up to date</Text>
                </RNView>
                <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14, color: c.onAccentSoft }}>Open list</Text>
                <Icon name="forward" size={18} color={c.onAccentSoft} />
              </Card>
            )}
          </Pressable>
        ) : null}

        <Text variant="heading" accessibilityRole="header" style={{ marginTop: 10 }}>
          On the menu
        </Text>
        {planned.length === 0 ? (
          <Card style={{ gap: 4 }}>
            <Text variant="subheading">Nothing planned yet</Text>
            <Text variant="muted">Add recipes below and their ingredients go on the shopping list.</Text>
          </Card>
        ) : (
          planned.map((p) => {
            const recipe = recipes.get(p.recipeId)!;
            const factor = recipe.servings > 0 ? p.servings / recipe.servings : 1;
            return (
              <Card key={p.recipeId} style={styles.planned}>
                <RNView style={styles.plannedTitle}>
                  <RecipePhoto path={recipe.photoUrls?.[0]} recipe={recipe} iconSize={28} style={styles.plannedThumb} />
                  <Pressable
                    style={{ flex: 1, gap: 2 }}
                    accessibilityRole="link"
                    onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}>
                    <Text variant="subheading">{recipe.title}</Text>
                    <Text style={{ fontSize: 13, fontFamily: Fonts.bodyMedium, color: factor === 1 ? c.textMuted : c.tint }}>
                      {factor === 1 ? 'As written' : `Make ${formatFraction(factor)}× the recipe`}
                    </Text>
                  </Pressable>
                  <IconButton
                    icon="close"
                    tone="clear"
                    iconSize={18}
                    label={`Remove ${recipe.title}`}
                    onPress={() => dispatch({ type: 'unplanRecipe', range, recipeId: p.recipeId })}
                  />
                </RNView>
                <RNView style={[styles.servingsRow, { borderTopColor: c.sunken }]}>
                  <Text variant="muted">Servings</Text>
                  <Stepper
                    compact
                    value={p.servings}
                    label="servings"
                    onChange={(v) => dispatch({ type: 'setPlannedServings', range, recipeId: p.recipeId, servings: v })}
                  />
                </RNView>
              </Card>
            );
          })
        )}

        <RNView style={[styles.add, { borderColor: c.borderStrong }]}>
          <Text variant="subheading" style={{ fontSize: 18 }}>Add a recipe</Text>
          {state.recipes.length === 0 ? (
            <RNView style={{ gap: 8 }}>
              <Text variant="muted">You don’t have any recipes yet.</Text>
              <Button title="Add a recipe" kind="secondary" onPress={() => router.navigate('/')} />
            </RNView>
          ) : (
            <>
              <SearchField
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
                  <Card accessibilityRole="list" style={styles.suggestions}>
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
                            i > 0 && { borderTopWidth: 1, borderTopColor: c.sunken },
                            { opacity: pressed ? 0.7 : 1 },
                          ]}>
                          <RecipePhoto path={r.photoUrls?.[0]} recipe={r} iconSize={20} style={styles.thumb} />
                          <Text style={{ flex: 1 }} numberOfLines={2}>
                            {r.title}
                          </Text>
                          <Tag label={added ? 'Added' : '+ Add'} tone={added ? 'accent' : 'tint'} />
                        </Pressable>
                      );
                    })}
                  </Card>
                )
              ) : null}
              <Button title={`Browse all ${state.recipes.length} recipes`} kind="ink" onPress={() => setBrowsing(true)} />
              <Text variant="muted" style={{ fontSize: 13 }}>
                New additions are made for {state.settings.householdSize} servings. Change it above.
              </Text>
            </>
          )}
        </RNView>
      </RNView>

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
  content: { paddingBottom: TAB_BAR_SPACE + 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20 },
  planned: { gap: 10, padding: 12 },
  plannedTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  plannedThumb: { width: 56, height: 56 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10 },
  add: { marginTop: 4, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 22, padding: 16, gap: 12 },
  suggestions: { padding: 0, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8, minHeight: 56 },
  thumb: { width: 40, height: 40, borderRadius: 10 },
});
