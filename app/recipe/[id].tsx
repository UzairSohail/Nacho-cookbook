import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Card, Stepper, Text, TextInput, View, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  formatAmount,
  formatFraction,
  limitingFactor,
  looksLikeStepHeading,
  parseQuantity,
  scaleIngredients,
  type ScaledIngredient,
} from '@/src/core';
import { recipeNeedsRepair, repairRecipe } from '@/src/state/recipeDraft';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeMap().get(id);
  const catalog = useCatalog();
  const { state, dispatch } = useStore();
  const c = useTheme();
  const { system, standard } = state.settings;

  const [factor, setFactor] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [haveText, setHaveText] = useState('');
  const [haveUnit, setHaveUnit] = useState('');
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const [noAmount, setNoAmount] = useState<number | null>(null);

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Recipe' }} />
        <Text variant="heading">This recipe isn’t here</Text>
        <Text variant="muted" style={{ textAlign: 'center' }}>
          It may have been deleted, or it’s still syncing from your household.
        </Text>
        <Button title="Back to recipes" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    );
  }

  const servings = recipe.servings * factor;
  const scaled = scaleIngredients(recipe, factor);

  const startLimit = (index: number) => {
    const item = recipe.ingredients[index];
    if (!item.scalable || item.quantity == null) {
      // Say why nothing opened, rather than ignoring the tap.
      setEditing(null);
      setNoAmount(noAmount === index ? null : index);
      return;
    }
    setNoAmount(null);
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

  const needsRepair = recipeNeedsRepair(recipe, catalog);
  const repair = () => dispatch({ type: 'saveRecipe', recipe: repairRecipe(recipe, catalog) });
  // Without any amounts, a blank amount column would push every name to the middle.
  const showAmounts = scaled.some((item) => amountText(item));
  let stepNumber = 0;

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
      {recipe.photoUrls?.[0] ? (
        <RecipePhoto path={recipe.photoUrls[0]} style={styles.cover} label={`Photo of ${recipe.title}`} />
      ) : null}
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
        {needsRepair ? (
          <Card style={styles.haveRow}>
            <Text>Some amounts were saved as notes, so those ingredients can’t be scaled.</Text>
            <Button title="Fix amounts" onPress={repair} />
          </Card>
        ) : null}
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
                {showAmounts ? <Text style={styles.amount}>{amountText(item)}</Text> : null}
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
              {noAmount === index ? (
                <Text variant="muted" style={{ marginVertical: 8 }}>
                  {name} has no amount, so it can’t set the scale. Add one with Edit to use it.
                </Text>
              ) : null}
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
        {recipe.steps.map((step, i) => {
          // "Garlic Confit" names the steps below it; it isn't a step to number.
          if (!step.photoUrl && i < recipe.steps.length - 1 && looksLikeStepHeading(step.text)) {
            return (
              <Text key={i} variant="label" style={{ marginTop: 8 }}>
                {step.text.replace(/:+$/, '').toUpperCase()}
              </Text>
            );
          }
          const n = ++stepNumber;
          return (
            <RNView key={i} style={styles.step}>
              <RNView style={[styles.stepNum, { backgroundColor: c.tint }]}>
                <Text style={{ color: c.onTint }}>{n}</Text>
              </RNView>
              <RNView style={{ flex: 1, gap: 10 }}>
                {step.text ? <Text>{step.text}</Text> : null}
                {step.photoUrl ? (
                  <RecipePhoto path={step.photoUrl} style={styles.stepPhoto} label={`Photo for step ${n}`} />
                ) : null}
              </RNView>
            </RNView>
          );
        })}
      </RNView>

      {recipe.notes ? (
        <RNView style={styles.gap}>
          <Text variant="heading">Notes</Text>
          <Text>{recipe.notes}</Text>
        </RNView>
      ) : null}
      {recipe.sourceUrl ? (
        <Text variant="muted" numberOfLines={1}>
          Source:{' '}
          <Text
            accessibilityRole="link"
            style={{ color: c.tint, fontSize: 14 }}
            onPress={() => Linking.openURL(recipe.sourceUrl!).catch(() => {})}>
            {siteName(recipe.sourceUrl)}
          </Text>
        </Text>
      ) : null}

      <Button title="Edit recipe" kind="secondary" onPress={editRecipe} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { padding: 16, gap: 20, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  ingredient: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  amount: { width: 110, fontWeight: '600' },
  haveRow: { gap: 10, marginVertical: 8 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', aspectRatio: 4 / 3, maxHeight: 420, borderRadius: 16 },
  stepPhoto: { width: '100%', maxWidth: 420, aspectRatio: 4 / 3 },
});

/** "recipetineats.com" from a full address, for a short source link. */
function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
