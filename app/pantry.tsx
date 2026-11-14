import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Card, Check, Icon, IconButton, SearchField, SectionTitle, Text, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import { AISLE_LABELS, AISLE_ORDER, guessAisle, lineIngredientId, type Ingredient } from '@/src/core';
import { useStore } from '@/src/state/store';

/**
 * The household pantry: things you keep at home. When the plan needs one, it
 * moves to "Already at home" on the shopping list instead of being bought.
 */
export default function PantryScreen() {
  const { state, dispatch } = useStore();
  const c = useTheme();
  const [find, setFind] = useState('');
  const inPantry = new Set(state.pantry);
  const q = find.trim().toLowerCase();

  const add = (name: string) => {
    if (!name.trim()) return;
    dispatch({ type: 'addToPantry', name });
    setFind('');
  };

  // Suggestions while typing: known ingredients not in the pantry yet.
  const matches = q
    ? state.ingredients
        .filter((i) => !inPantry.has(i.id) && i.name.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, 8)
    : [];
  const exact = state.ingredients.some((i) => i.name.trim().toLowerCase() === q);

  // What the current list needs that isn't in the pantry, to tick off in one go.
  const byId = new Map(state.ingredients.map((i) => [i.id, i]));
  const onList: Ingredient[] = [];
  const seen = new Set<string>();
  for (const item of state.list) {
    const id = lineIngredientId(item);
    if (!id || seen.has(id) || inPantry.has(id) || item.checked) continue;
    seen.add(id);
    const ing = byId.get(id);
    if (ing) onList.push(ing);
  }
  onList.sort((a, b) => a.name.localeCompare(b.name));

  const have = state.pantry.map((id) => byId.get(id)).filter((i): i is Ingredient => !!i);
  const aisleOf = (i: Ingredient) => (AISLE_ORDER.includes(i.aisle) ? i.aisle : 'other');
  const aisles = AISLE_ORDER.filter((a) => have.some((i) => aisleOf(i) === a));

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="muted" style={{ lineHeight: 20 }}>
        Things you keep at home. When a planned recipe needs one, it goes under “Already at home” at the bottom of the
        shopping list instead of on it. Shared with your household.
      </Text>

      <Card style={styles.gap}>
        <SectionTitle icon="add" tone={3} title="Add to the pantry" hint="Type anything, even if no recipe uses it yet" />
        <RNView style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SearchField
            value={find}
            onChangeText={setFind}
            placeholder="e.g. rice, baby corn, olive oil"
            accessibilityLabel="Add to the pantry"
            returnKeyType="done"
            onSubmitEditing={() => add(find)}
            style={{ flex: 1 }}
          />
          <IconButton icon="add" tone="ink" size={50} label="Add to the pantry" disabled={!q} onPress={() => add(find)} />
        </RNView>
        {q ? (
          <RNView>
            {!exact && !state.pantry.some((id) => byId.get(id)?.name.trim().toLowerCase() === q) ? (
              <Result
                label={`Add “${find.trim()}”`}
                hint={AISLE_LABELS[guessAisle(find)]}
                onPress={() => add(find)}
                last={matches.length === 0}
              />
            ) : null}
            {matches.map((i, n) => (
              <Result key={i.id} label={i.name} hint={AISLE_LABELS[aisleOf(i)]} onPress={() => add(i.name)} last={n === matches.length - 1} />
            ))}
            {exact && matches.length === 0 ? <Text variant="muted">“{find.trim()}” is already in the pantry.</Text> : null}
          </RNView>
        ) : null}
      </Card>

      {onList.length ? (
        <Card style={styles.gap}>
          <SectionTitle icon="shopping" tone={1} title="On your shopping list" hint="Tick what you already have and it comes off the list" />
          <RNView>
            {onList.map((i, n) => (
              <Pressable
                key={i.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                onPress={() => dispatch({ type: 'togglePantry', ingredientId: i.id })}
                style={[styles.result, n < onList.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.sunken }]}>
                <Check checked={false} size={24} />
                <Text style={{ flex: 1 }}>{i.name}</Text>
              </Pressable>
            ))}
          </RNView>
        </Card>
      ) : null}

      <Card style={styles.gap}>
        <SectionTitle icon="pantry" tone={2} title={`In the pantry${have.length ? ` · ${have.length}` : ''}`} hint="Ran out? Take it out and it goes back on the list" />
        {have.length === 0 ? (
          <Text variant="muted">Nothing yet. Add things above, or tick them off from your shopping list.</Text>
        ) : (
          aisles.map((aisle) => (
            <RNView key={aisle} style={{ gap: 8 }}>
              <Text variant="label">{AISLE_LABELS[aisle].toUpperCase()}</Text>
              <RNView style={styles.chips}>
                {have
                  .filter((i) => aisleOf(i) === aisle)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((i) => (
                    <RNView key={i.id} style={[styles.chip, { backgroundColor: c.accentSoft }]}>
                      <Text style={{ fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.onAccentSoft }}>{i.name}</Text>
                      <IconButton
                        icon="close"
                        size={28}
                        iconSize={14}
                        tone="clear"
                        label={`Take ${i.name} out of the pantry`}
                        onPress={() => dispatch({ type: 'togglePantry', ingredientId: i.id })}
                      />
                    </RNView>
                  ))}
              </RNView>
            </RNView>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Result({ label, hint, onPress, last }: { label: string; hint?: string; onPress: () => void; last: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.result, !last && { borderBottomWidth: 1, borderBottomColor: c.sunken }]}>
      <Icon name="add" size={18} color={c.tint} />
      <Text style={{ flex: 1 }}>{label}</Text>
      {hint ? <Text variant="muted" style={{ fontSize: 12 }}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 18, paddingLeft: 14, paddingRight: 4, minHeight: 36 },
  result: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
});
