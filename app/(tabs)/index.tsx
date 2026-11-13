import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View as RNView } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  ScreenHeader,
  SearchField,
  TAB_BAR_SPACE,
  Tag,
  Text,
  View,
  useTheme,
} from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { periodRange, plannedRecipes, today, type Recipe } from '@/src/core';
import { usePlanPeriod } from '@/src/state/planPeriod';
import { useCatalog, useStore } from '@/src/state/store';

const PADDING = 20;
const GAP = 14;
const MAX_WIDTH = 760;
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The tags used most across the recipes, for quick filters. */
function topTags(recipes: readonly Recipe[], max = 6): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const r of recipes)
    for (const t of r.tags ?? []) {
      const key = t.trim().toLowerCase();
      if (!key) continue;
      const hit = counts.get(key);
      if (hit) hit.n++;
      else counts.set(key, { label: t.trim(), n: 1 });
    }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, max)
    .map((t) => t.label);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RecipesScreen() {
  const { state, dispatch, sync } = useStore();
  const catalog = useCatalog();
  const c = useTheme();
  const period = usePlanPeriod();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const inner = Math.min(width, MAX_WIDTH) - PADDING * 2;
  const columns = inner >= 600 ? 3 : 2;
  const tileWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  const tags = useMemo(() => topTags(state.recipes), [state.recipes]);
  const recipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.recipes.filter(
      (r) =>
        (!tag || r.tags?.some((t) => t.trim().toLowerCase() === tag.toLowerCase())) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q)) ||
          r.ingredients.some((i) => catalog.get(i.ingredientId)?.name.toLowerCase().includes(q))),
    );
  }, [query, tag, state.recipes, catalog]);

  const range = periodRange(today(), period);
  const plannedCount = plannedRecipes(state.plan, range).filter((p) => state.recipes.some((r) => r.id === p.recipeId)).length;
  const filtering = !!query.trim() || !!tag;
  // The "add a recipe" tile ends the grid when nothing is filtered.
  const data: Array<Recipe | 'add'> = recipes.length && !filtering ? [...recipes, 'add'] : recipes;

  const header = (
    <RNView style={{ gap: 16, paddingBottom: 4 }}>
      <ScreenHeader
        eyebrow="Nacho Cookbook"
        title="Recipes"
        right={
          <>
            <Button
              title="Import"
              kind="secondary"
              icon="link"
              small
              style={{ backgroundColor: c.card, borderColor: c.border, minHeight: 44 }}
              accessibilityLabel="Import a recipe from a website, a photo or pasted text"
              onPress={() => router.push('/import-recipe')}
            />
            <IconButton icon="add" tone="tint" label="Add a recipe" onPress={() => router.push('/edit-recipe')} />
          </>
        }
      />
      {state.recipes.length ? (
        <RNView style={styles.pad}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, tag or ingredient"
            accessibilityLabel="Search recipes"
          />
        </RNView>
      ) : null}
      {tags.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip role="radio" label="All" selected={!tag} onPress={() => setTag(null)} />
          {tags.map((t) => (
            <Chip
              key={t}
              role="radio"
              label={capitalise(t)}
              selected={tag?.toLowerCase() === t.toLowerCase()}
              onPress={() => setTag(tag?.toLowerCase() === t.toLowerCase() ? null : t)}
            />
          ))}
        </ScrollView>
      ) : null}
      {plannedCount && !filtering ? (
        <RNView style={styles.pad}>
          <Pressable accessibilityRole="link" onPress={() => router.navigate('/planner')}>
            {({ pressed }) => (
              <Card tone="accent" style={[styles.planCard, { opacity: pressed ? 0.8 : 1 }]}>
                <RNView style={[styles.planIcon, { backgroundColor: c.background }]}>
                  <Icon name="planner" size={22} color={c.onAccentSoft} />
                </RNView>
                <RNView style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 15, color: c.onAccentSoft }}>
                    {plannedCount} {plannedCount === 1 ? 'recipe' : 'recipes'} planned
                  </Text>
                  <Text style={{ fontSize: 13, color: c.onAccentSoft }}>
                    {dayFormat.format(new Date(range.start))} – {dayFormat.format(new Date(range.end))}
                  </Text>
                </RNView>
                <Icon name="forward" size={20} color={c.onAccentSoft} />
              </Card>
            )}
          </Pressable>
        </RNView>
      ) : null}
      {state.recipes.length ? (
        <RNView style={[styles.pad, styles.listTitle]}>
          <Text variant="heading">{filtering ? 'Matching recipes' : 'All recipes'}</Text>
          <Text variant="muted" style={{ fontSize: 13 }}>
            {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
          </Text>
        </RNView>
      ) : null}
    </RNView>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={data}
        numColumns={columns}
        keyExtractor={(r) => (r === 'add' ? 'add' : r.id)}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: PADDING }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <RNView style={styles.pad}>
            {filtering ? (
              <Text variant="muted">No recipes match{query.trim() ? ` “${query.trim()}”` : ''}{tag ? ` in ${tag}` : ''}.</Text>
            ) : sync.mode === 'synced' && sync.connected && !sync.hasSynced ? (
              <Text variant="muted">Loading your household’s recipes…</Text>
            ) : (
              <Card style={{ gap: 12 }}>
                <Text variant="heading">No recipes yet</Text>
                <Text variant="muted">
                  Import one from a website or a cookbook photo, add your own, or start with a few sample recipes to try the
                  planner and shopping list.
                </Text>
                <Button title="Import from a website" icon="link" onPress={() => router.push('/import-recipe')} />
                <Button
                  title="From a cookbook photo"
                  icon="camera"
                  kind="secondary"
                  onPress={() => router.push({ pathname: '/import-recipe', params: { mode: 'photo' } })}
                />
                <Button
                  title="Paste a recipe"
                  icon="paste"
                  kind="secondary"
                  onPress={() => router.push({ pathname: '/import-recipe', params: { mode: 'text' } })}
                />
                <Button title="Add a recipe" icon="edit" kind="secondary" onPress={() => router.push('/edit-recipe')} />
                <Button title="Add sample recipes" kind="quiet" onPress={() => dispatch({ type: 'addSampleRecipes' })} />
              </Card>
            )}
          </RNView>
        }
        renderItem={({ item }) =>
          item === 'add' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/edit-recipe')}
              style={({ pressed }) => [
                styles.addTile,
                { width: tileWidth, borderColor: c.borderStrong, opacity: pressed ? 0.7 : 1 },
              ]}>
              <RNView style={[styles.addIcon, { backgroundColor: c.sunken }]}>
                <Icon name="add" size={22} />
              </RNView>
              <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14 }}>Add a recipe</Text>
              <Text variant="muted" style={{ fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
                Type one in, or import a link or photo
              </Text>
            </Pressable>
          ) : (
            <RecipeCard recipe={item} width={tileWidth} />
          )
        }
      />
    </View>
  );
}

function RecipeCard({ recipe, width }: { recipe: Recipe; width: number }) {
  const c = useTheme();
  const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  const firstTag = recipe.tags?.find((t) => t.trim());
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      style={({ pressed }) => [styles.card, { width, backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}>
        <RNView>
          <RecipePhoto
            path={recipe.photoUrls?.[0]}
            recipe={recipe}
            iconSize={52}
            style={{ width: '100%', height: Math.round(width * 0.86), borderRadius: 0 }}
          />
          {firstTag ? (
            <RNView style={styles.cardTag}>
              <Tag label={capitalise(firstTag.trim())} />
            </RNView>
          ) : null}
        </RNView>
        <RNView style={styles.cardText}>
          <Text variant="subheading" numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text variant="muted" style={{ fontSize: 13 }}>
            {[minutes ? `${minutes} min` : '', `Serves ${recipe.servings}`].filter(Boolean).join(' · ')}
          </Text>
        </RNView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { gap: GAP, paddingBottom: TAB_BAR_SPACE + 16, maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center' },
  pad: { paddingHorizontal: PADDING },
  chips: { gap: 8, paddingHorizontal: PADDING },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20 },
  planIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  listTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  card: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  cardTag: { position: 'absolute', top: 10, left: 10 },
  cardText: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 4 },
  addTile: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    minHeight: 200,
  },
  addIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
