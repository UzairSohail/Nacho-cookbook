import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View as RNView } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Card, Text, TextInput, View } from '@/components/Themed';
import { useCatalog, useStore } from '@/src/state/store';

export default function RecipesScreen() {
  const { state, dispatch, sync } = useStore();
  const catalog = useCatalog();
  const [query, setQuery] = useState('');

  const recipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.recipes;
    return state.recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags?.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => catalog.get(i.ingredientId)?.name.toLowerCase().includes(q)),
    );
  }, [query, state.recipes, catalog]);

  return (
    <View style={styles.screen}>
      <RNView style={styles.top}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, tag or ingredient"
          accessibilityLabel="Search recipes"
          style={styles.search}
        />
        <Button title="Import" kind="secondary" accessibilityLabel="Import a recipe from a website" onPress={() => router.push('/import-recipe')} />
        <Button title="+ Add" accessibilityLabel="Add a recipe" onPress={() => router.push('/edit-recipe')} />
      </RNView>
      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          query ? (
            <Text variant="muted">No recipes match “{query}”.</Text>
          ) : sync.mode === 'synced' && sync.connected && !sync.hasSynced ? (
            <Text variant="muted">Loading your household’s recipes…</Text>
          ) : (
            <Card style={{ gap: 12 }}>
              <Text variant="heading">No recipes yet</Text>
              <Text variant="muted">Import one from a website, add your own, or start with a few sample recipes to try the planner and shopping list.</Text>
              <Button title="Import from a website" onPress={() => router.push('/import-recipe')} />
              <Button title="Add a recipe" kind="secondary" onPress={() => router.push('/edit-recipe')} />
              <Button title="Add sample recipes" kind="secondary" onPress={() => dispatch({ type: 'addSampleRecipes' })} />
            </Card>
          )
        }
        renderItem={({ item }) => {
          const minutes = (item.prepMinutes ?? 0) + (item.cookMinutes ?? 0);
          return (
            <Link href={{ pathname: '/recipe/[id]', params: { id: item.id } }} asChild>
              <Pressable>
                <Card style={styles.card}>
                  <RecipePhoto path={item.photoUrls?.[0]} fallbackLetter={item.title[0]} style={styles.photo} />
                  <RNView style={{ flex: 1, gap: 4 }}>
                    <Text variant="heading">{item.title}</Text>
                    <Text variant="muted">
                      Serves {item.servings}
                      {minutes ? ` · ${minutes} min` : ''}
                      {item.tags?.length ? ` · ${item.tags.join(', ')}` : ''}
                    </Text>
                  </RNView>
                </Card>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', gap: 8, margin: 16, marginBottom: 8, alignItems: 'center' },
  search: { flex: 1 },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 64, height: 64 },
});
