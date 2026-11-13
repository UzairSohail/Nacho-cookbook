import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View as RNView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, SearchField, Text, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { searchRecipes, type Recipe } from '@/src/core';

const GAP = 12;
const PADDING = 16;
const MAX_WIDTH = 760;

/**
 * Every recipe as a photo with its name, to pick from for the plan.
 * Tapping a recipe adds it; tapping it again takes it off.
 */
export function RecipeBrowser({
  visible,
  recipes,
  plannedIds,
  ingredientName,
  onToggle,
  onClose,
}: {
  visible: boolean;
  recipes: readonly Recipe[];
  plannedIds: ReadonlySet<string>;
  ingredientName?: (id: string) => string | undefined;
  onToggle: (recipe: Recipe, planned: boolean) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');

  const inner = Math.min(width, MAX_WIDTH) - PADDING * 2;
  const columns = inner >= 560 ? 4 : inner >= 400 ? 3 : 2;
  const tileWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  const shown = useMemo(
    () =>
      query.trim()
        ? searchRecipes(query, recipes, ingredientName)
        : recipes.slice().sort((a, b) => a.title.localeCompare(b.title)),
    [query, recipes, ingredientName],
  );

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <SafeAreaProvider>
        <SafeAreaView style={[styles.screen, { backgroundColor: c.background }]}>
          <RNView style={styles.header}>
            <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">
              All recipes
            </Text>
            <Button title={plannedIds.size ? `Done (${plannedIds.size})` : 'Done'} kind="ink" small onPress={close} />
          </RNView>
          <RNView style={styles.searchRow}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Filter by name, tag or ingredient"
              accessibilityLabel="Filter recipes"
            />
          </RNView>
          <FlatList
            key={columns}
            data={shown}
            numColumns={columns}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text variant="muted">No recipes match “{query}”.</Text>}
            renderItem={({ item }) => {
              const planned = plannedIds.has(item.id);
              return (
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: planned }}
                  accessibilityLabel={planned ? `${item.title}, added. Tap to take it off` : `Add ${item.title}`}
                  onPress={() => onToggle(item, planned)}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      width: tileWidth,
                      backgroundColor: c.card,
                      borderColor: planned ? c.ink : c.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <RNView>
                    <RecipePhoto
                      path={item.photoUrls?.[0]}
                      recipe={item}
                      iconSize={40}
                      style={[styles.photo, { height: Math.round(tileWidth * 0.75) }]}
                    />
                    <RNView style={[styles.badge, { backgroundColor: planned ? c.ink : c.card }]}>
                      <Text style={{ color: planned ? c.onInk : c.text, fontSize: 13, fontFamily: Fonts.bodyBold }}>
                        {planned ? '✓ Added' : '+ Add'}
                      </Text>
                    </RNView>
                  </RNView>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.title}
                  </Text>
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: PADDING,
    paddingTop: 16,
    paddingBottom: 8,
    maxWidth: MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  searchRow: { paddingHorizontal: PADDING, paddingBottom: 8, maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center' },
  grid: { padding: PADDING, paddingTop: 8, paddingBottom: 32, gap: GAP, maxWidth: MAX_WIDTH, width: '100%', alignSelf: 'center' },
  tile: { borderWidth: 2, borderRadius: 22, overflow: 'hidden' },
  photo: { width: '100%', borderRadius: 0 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  name: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, lineHeight: 21, fontFamily: Fonts.title },
});
