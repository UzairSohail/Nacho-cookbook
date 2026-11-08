import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Stepper, Text, TextInput, View, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  formatAmount,
  formatFraction,
  limitingFactor,
  parseQuantity,
  scaleIngredients,
  type ScaledIngredient,
} from '@/src/core';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeMap().get(id);
  const catalog = useCatalog();
  const { state } = useStore();
  const c = useTheme();
  const { system, standard } = state.settings;

  const [factor, setFactor] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [haveText, setHaveText] = useState('');
  const [haveUnit, setHaveUnit] = useState('');
  const [limitNote, setLimitNote] = useState<string | null>(null);

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text>Recipe not found.</Text>
      </View>
    );
  }

  const servings = recipe.servings * factor;
  const scaled = scaleIngredients(recipe, factor);

  const startLimit = (index: number) => {
    const item = recipe.ingredients[index];
    if (!item.scalable || item.quantity == null) return;
    setEditing(index);
    setHaveText('');
    setHaveUnit(item.unit ?? '');
  };

  const applyLimit = () => {
    if (editing == null) return;
    const qty = parseQuantity(haveText);
    if (qty == null || qty <= 0) return;
    const result = limitingFactor(recipe, [{ index: editing, quantity: qty, unit: haveUnit || null }], catalog, {
      standard,
    });
    if (!result) {
      setLimitNote("Couldn't compare those units. Try the same unit as the recipe.");
      return;
    }
    const name = catalog.get(recipe.ingredients[editing].ingredientId)?.name ?? 'that';
    setFactor(result.factor);
    setLimitNote(`Scaled to the ${name} you have: ${formatFraction(result.factor)}× the recipe.`);
    setEditing(null);
  };

  const amountText = (item: ScaledIngredient) => {
    if (item.scaledQuantity == null) return '';
    const a = formatAmount(item.scaledQuantity, item.unit, system, {
      standard,
      sourceStandard: recipe.measureStandard,
    });
    return `${a.quantity}${a.unit ? ` ${a.unit}` : ''}`;
  };

  let lastGroup: string | undefined;
  const editRecipe = () => router.push({ pathname: '/edit-recipe', params: { id: recipe.id } });
  const facts = [
    recipe.prepMinutes ? `Prep ${recipe.prepMinutes} min` : '',
    recipe.cookMinutes ? `Cook ${recipe.cookMinutes} min` : '',
    recipe.tags?.length ? recipe.tags.join(', ') : '',
  ].filter(Boolean);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: recipe.title,
          headerRight: () => (
            <Pressable onPress={editRecipe} accessibilityRole="button" accessibilityLabel="Edit recipe" hitSlop={12} style={{ marginRight: Platform.OS === 'web' ? 16 : 0 }}>
              <Text style={{ color: c.tint, fontFamily: Fonts.bodyBold }}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <Text variant="title">{recipe.title}</Text>
      {recipe.description ? <Text variant="muted">{recipe.description}</Text> : null}
      {facts.length ? <Text variant="muted">{facts.join(' · ')}</Text> : null}
      {recipe.measureStandard && recipe.measureStandard !== standard ? (
        <Text variant="muted" style={{ color: c.accent }}>
          Written with {recipe.measureStandard === 'us' ? 'US' : recipe.measureStandard === 'au' ? 'Australian' : 'metric'}{' '}
          cups and spoons. Spoons are converted to yours; cups are labelled.
        </Text>
      ) : null}

      <Card style={styles.gap}>
        <Text variant="label">SERVINGS</Text>
        <Stepper
          value={Math.round(servings * 100) / 100}
          label="servings"
          min={1}
          onChange={(v) => {
            setFactor(v / recipe.servings);
            setLimitNote(null);
          }}
        />
        {limitNote ? <Text variant="muted">{limitNote}</Text> : null}
        {factor !== 1 ? (
          <Button
            title="Reset to recipe"
            kind="secondary"
            onPress={() => {
              setFactor(1);
              setLimitNote(null);
            }}
          />
        ) : null}
      </Card>

      <RNView style={styles.gap}>
        <Text variant="heading">Ingredients</Text>
        <Text variant="muted">Tap an ingredient to scale the recipe to what you have.</Text>
        {scaled.map((item, index) => {
          const name = catalog.get(item.ingredientId)?.name ?? item.ingredientId;
          const header = item.group && item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <RNView key={index}>
              {header ? <Text variant="label" style={{ marginTop: 8 }}>{header.toUpperCase()}</Text> : null}
              <Pressable
                onPress={() => startLimit(index)}
                accessibilityHint="Enter how much you have"
                style={[styles.ingredient, { borderBottomColor: c.border }]}>
                <Text style={styles.amount}>{amountText(item)}</Text>
                <RNView style={{ flex: 1 }}>
                  <Text>
                    {name}
                    {item.note ? <Text variant="muted">, {item.note}</Text> : null}
                    {item.optional ? <Text variant="muted"> (optional)</Text> : null}
                  </Text>
                  {item.partialCount ? (
                    <Text variant="muted">
                      Round to {Math.floor(item.scaledQuantity!)} or {Math.ceil(item.scaledQuantity!)}
                    </Text>
                  ) : null}
                </RNView>
              </Pressable>
              {editing === index ? (
                <Card style={styles.haveRow}>
                  <Text variant="label">HOW MUCH {name.toUpperCase()} DO YOU HAVE?</Text>
                  <RNView style={styles.row}>
                    <TextInput
                      value={haveText}
                      onChangeText={setHaveText}
                      placeholder="e.g. 3/4"
                      accessibilityLabel="Amount you have"
                      style={{ flex: 1 }}
                      autoFocus
                      onSubmitEditing={applyLimit}
                    />
                    <TextInput
                      value={haveUnit}
                      onChangeText={setHaveUnit}
                      placeholder="unit"
                      accessibilityLabel="Unit"
                      style={{ width: 96 }}
                    />
                  </RNView>
                  <RNView style={styles.row}>
                    <Button title="Scale recipe" onPress={applyLimit} />
                    <Button title="Cancel" kind="secondary" onPress={() => setEditing(null)} />
                  </RNView>
                </Card>
              ) : null}
            </RNView>
          );
        })}
      </RNView>

      <RNView style={styles.gap}>
        <Text variant="heading">Method</Text>
        {recipe.steps.map((step, i) => (
          <RNView key={i} style={styles.step}>
            <RNView style={[styles.stepNum, { backgroundColor: c.tint }]}>
              <Text style={{ color: c.onTint }}>{i + 1}</Text>
            </RNView>
            <Text style={{ flex: 1 }}>{step.text}</Text>
          </RNView>
        ))}
      </RNView>

      {recipe.notes ? (
        <RNView style={styles.gap}>
          <Text variant="heading">Notes</Text>
          <Text>{recipe.notes}</Text>
        </RNView>
      ) : null}
      {recipe.sourceUrl ? <Text variant="muted">Source: {recipe.sourceUrl}</Text> : null}

      <Button title="Edit recipe" kind="secondary" onPress={editRecipe} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 20, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  ingredient: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  amount: { width: 96, fontWeight: '600' },
  haveRow: { gap: 10, marginVertical: 8 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
