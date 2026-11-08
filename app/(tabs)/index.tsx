import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View as RNView } from 'react-native';

import { Card, Text, TextInput, View, useTheme } from '@/components/Themed';
import { useCatalog, useStore } from '@/src/state/store';

export default function RecipesScreen() {
  const { state } = useStore();
  const catalog = useCatalog();
  const c = useTheme();
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
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, tag or ingredient"
        accessibilityLabel="Search recipes"
        style={styles.search}
      />
      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text variant="muted">No recipes match “{query}”.</Text>}
        renderItem={({ item }) => {
          const minutes = (item.prepMinutes ?? 0) + (item.cookMinutes ?? 0);
          return (
            <Link href={{ pathname: '/recipe/[id]', params: { id: item.id } }} asChild>
              <Pressable>
                <Card style={styles.card}>
                  <RNView style={[styles.photo, { backgroundColor: c.border }]}>
                    <Text style={styles.photoLetter}>{item.title[0]}</Text>
                  </RNView>
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
  search: { margin: 16, marginBottom: 8 },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  photo: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  photoLetter: { fontSize: 28, opacity: 0.5 },
});
