import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Icon, IconButton, Segmented, Tag, Text, TextInput, View, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  formatFraction,
  kitchenAmount,
  limitingFactor,
  looksLikeStepHeading,
  parseQuantity,
  periodRange,
  plannedRecipes,
  scaleIngredients,
  today,
  type MeasureView,
  type ScaledIngredient,
} from '@/src/core';
import { setMeasureView, useMeasureView } from '@/src/state/measureView';
import { periodName, usePlanPeriod } from '@/src/state/planPeriod';
import { recipeNeedsRepair, repairRecipe } from '@/src/state/recipeDraft';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipeMap().get(id);
  const catalog = useCatalog();
  const { state, dispatch } = useStore();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const period = usePlanPeriod();
  const { system, standard } = state.settings;
  const measureView = useMeasureView();

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

  // Rounded to what you can measure: 1 egg not 0.92, 1 3/4 cups + 2 tbsp not 1 7/8 cups.
  const amountFor = (item: ScaledIngredient) => {
    if (item.scaledQuantity == null) return { text: '' };
    const ingredient = catalog.get(item.ingredientId);
    return kitchenAmount(item.scaledQuantity, item.unit, system, {
      standard,
      name: ingredient?.name,
      density: ingredient?.density,
      view: measureView,
    });
  };
  const amountText = (item: ScaledIngredient) => amountFor(item).text;

  const needsRepair = recipeNeedsRepair(recipe, catalog);
  const repair = () => dispatch({ type: 'saveRecipe', recipe: repairRecipe(recipe, catalog) });
  // Without any amounts, a blank amount column would push every name to the middle.
  const showAmounts = scaled.some((item) => amountText(item));
  let stepNumber = 0;

  let lastGroup: string | undefined;
  const editRecipe = () => router.push({ pathname: '/edit-recipe', params: { id: recipe.id } });

  const range = periodRange(today(), period);
  const onPlan = plannedRecipes(state.plan, range).some((p) => p.recipeId === recipe.id);
  const stats = [
    recipe.prepMinutes ? ['Prep', `${recipe.prepMinutes} min`] : null,
    recipe.cookMinutes ? ['Cook', `${recipe.cookMinutes} min`] : null,
    recipe.prepMinutes && recipe.cookMinutes ? ['Total', `${recipe.prepMinutes + recipe.cookMinutes} min`] : null,
    recipe.keepsForDays ? ['Keeps', `${recipe.keepsForDays} ${recipe.keepsForDays === 1 ? 'day' : 'days'}`] : null,
  ].filter((x): x is [string, string] => !!x).slice(0, 3);
  const setServings = (v: number) => {
    setFactor(Math.max(1, v) / recipe.servings);
    setLimitNote(null);
  };
  const shownServings = Math.round(servings * 100) / 100;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: recipe.title, headerShown: false }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.scroll}>
        <RNView style={styles.hero}>
          <RecipePhoto
            path={recipe.photoUrls?.[0]}
            recipe={recipe}
            iconSize={112}
            style={StyleSheet.absoluteFill}
            label={recipe.photoUrls?.[0] ? `Photo of ${recipe.title}` : undefined}
          />
          <RNView style={[styles.heroButtons, { top: insets.top + 12 }]}>
            <IconButton
              icon="back"
              tone="card"
              label="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
            <IconButton icon="edit" tone="card" label="Edit recipe" onPress={editRecipe} />
          </RNView>
        </RNView>

        <RNView style={[styles.sheet, { backgroundColor: c.background }]}>
          {recipe.tags?.length ? (
            <RNView style={styles.row}>
              {recipe.tags.map((t, i) => (
                <Tag key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} tone={i === 0 ? 'tint' : 'accent'} />
              ))}
            </RNView>
          ) : null}
          <RNView style={{ gap: 8 }}>
            <Text variant="display">{recipe.title}</Text>
            {recipe.description ? <Text variant="muted" style={{ fontSize: 15, lineHeight: 22 }}>{recipe.description}</Text> : null}
          </RNView>

          {stats.length ? (
            <RNView style={styles.stats}>
              {stats.map(([label, value]) => (
                <Card key={label} style={styles.stat}>
                  <Text variant="muted" style={{ fontSize: 12, lineHeight: 16 }}>{label}</Text>
                  <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 17 }}>{value}</Text>
                </Card>
              ))}
            </RNView>
          ) : null}

          <Card tone="ink" style={styles.servings}>
            <RNView style={styles.servingsRow}>
              <RNView style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, color: c.inkMuted }}>Servings</Text>
                <Text variant="heading" style={{ color: c.onInk }} accessibilityLiveRegion="polite">
                  {shownServings} {shownServings === 1 ? 'serving' : 'servings'}
                </Text>
              </RNView>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer servings"
                disabled={shownServings <= 1}
                onPress={() => setServings(Math.ceil(shownServings) - 1)}
                style={({ pressed }) => [styles.inkBtn, { borderColor: c.inkSunken, opacity: shownServings <= 1 ? 0.35 : pressed ? 0.6 : 1 }]}>
                <Icon name="remove" size={18} color={c.onInk} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More servings"
                onPress={() => setServings(Math.floor(shownServings) + 1)}
                style={({ pressed }) => [styles.inkBtn, { backgroundColor: c.onInk, borderColor: c.onInk, opacity: pressed ? 0.7 : 1 }]}>
                <Icon name="add" size={18} color={c.ink} />
              </Pressable>
            </RNView>
            {limitNote ? <Text style={{ fontSize: 14, color: c.inkMuted }}>{limitNote}</Text> : null}
            {factor !== 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setFactor(1);
                  setLimitNote(null);
                }}
                hitSlop={8}>
                <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 14, color: c.onInk, textDecorationLine: 'underline' }}>
                  Back to {recipe.servings} servings
                </Text>
              </Pressable>
            ) : null}
          </Card>

          <RNView style={styles.section}>
            <RNView style={styles.spread}>
              <Text variant="heading" accessibilityRole="header">Ingredients</Text>
              <Text variant="muted" style={{ fontSize: 13 }}>
                {scaled.length} {scaled.length === 1 ? 'item' : 'items'}
              </Text>
            </RNView>
            <Segmented<MeasureView>
              accessibilityLabel="Show amounts"
              options={[
                ['written', 'As written'],
                ['cups', 'Cups'],
                ['metric', 'Metric'],
              ]}
              value={measureView}
              onChange={setMeasureView}
            />
            <Text variant="muted" style={{ fontSize: 13 }}>Tap one to scale the recipe to what you have.</Text>
            {needsRepair ? (
              <Card style={styles.haveRow}>
                <Text>Some amounts were saved as notes, so those ingredients can’t be scaled.</Text>
                <Button title="Fix amounts" onPress={repair} />
              </Card>
            ) : null}
            <Card style={styles.ingredients}>
              {scaled.map((item, index) => {
                const name = catalog.get(item.ingredientId)?.name ?? item.ingredientId;
                const header = item.group && item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                const last = index === scaled.length - 1;
                return (
                  <RNView key={index}>
                    {header ? (
                      <Text variant="label" style={{ marginTop: 14, marginBottom: 2 }}>
                        {header.toUpperCase()}
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => startLimit(index)}
                      accessibilityHint="Enter how much you have"
                      style={({ pressed }) => [
                        styles.ingredient,
                        { borderBottomColor: c.sunken, borderBottomWidth: last && editing !== index ? 0 : 1, opacity: pressed ? 0.6 : 1 },
                      ]}>
                      {showAmounts ? (
                        <Text style={[styles.amount, !amountText(item) && { color: c.textMuted }]}>{amountText(item)}</Text>
                      ) : null}
                      <RNView style={{ flex: 1 }}>
                        <Text>
                          {name}
                          {item.note ? <Text variant="muted" style={{ fontSize: 15 }}> · {item.note}</Text> : null}
                          {item.optional ? <Text variant="muted" style={{ fontSize: 15 }}> (optional)</Text> : null}
                        </Text>
                        {amountFor(item).note ? <Text variant="muted">{amountFor(item).note}</Text> : null}
                      </RNView>
                    </Pressable>
                    {noAmount === index ? (
                      <Text variant="muted" style={{ marginVertical: 8 }}>
                        {name} has no amount, so it can’t set the scale. Add one with Edit to use it.
                      </Text>
                    ) : null}
                    {editing === index ? (
                      <RNView style={[styles.haveRow, { borderBottomColor: c.sunken, borderBottomWidth: last ? 0 : 1 }]}>
                        <Text variant="label">HOW MUCH {name.toUpperCase()} DO YOU HAVE?</Text>
                        <RNView style={styles.row}>
                          <TextInput
                            value={haveText}
                            onChangeText={setHaveText}
                            placeholder="e.g. 3/4"
                            accessibilityLabel="Amount you have"
                            tone="sunken"
                            style={{ flex: 1 }}
                            autoFocus
                            onSubmitEditing={applyLimit}
                          />
                          <TextInput
                            value={haveUnit}
                            onChangeText={setHaveUnit}
                            placeholder="unit"
                            accessibilityLabel="Unit"
                            tone="sunken"
                            style={{ width: 96 }}
                          />
                        </RNView>
                        <RNView style={styles.row}>
                          <Button title="Scale recipe" small onPress={applyLimit} />
                          <Button title="Cancel" small kind="secondary" onPress={() => setEditing(null)} />
                        </RNView>
                      </RNView>
                    ) : null}
                  </RNView>
                );
              })}
            </Card>
          </RNView>

          <RNView style={styles.section}>
            <Text variant="heading" accessibilityRole="header">Method</Text>
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
                <Card key={i} style={styles.step}>
                  <RNView style={[styles.stepNum, { backgroundColor: c.tintSoft }]}>
                    <Text style={{ fontFamily: Fonts.title, fontSize: 16, color: c.onTintSoft }}>{n}</Text>
                  </RNView>
                  <RNView style={{ flex: 1, gap: 10, paddingTop: 4 }}>
                    {step.text ? <Text style={{ fontSize: 15, lineHeight: 23 }}>{step.text}</Text> : null}
                    {step.photoUrl ? (
                      <RecipePhoto path={step.photoUrl} style={styles.stepPhoto} label={`Photo for step ${n}`} />
                    ) : null}
                  </RNView>
                </Card>
              );
            })}
          </RNView>

          {recipe.notes ? (
            <RNView style={styles.section}>
              <Text variant="heading" accessibilityRole="header">Notes</Text>
              <Card>
                <Text style={{ fontSize: 15, lineHeight: 23 }}>{recipe.notes}</Text>
              </Card>
            </RNView>
          ) : null}
          {recipe.sourceUrl ? (
            <Text variant="muted" numberOfLines={1}>
              Source:{' '}
              <Text
                accessibilityRole="link"
                style={{ color: c.tint, fontSize: 14, fontFamily: Fonts.bodyBold }}
                onPress={() => Linking.openURL(recipe.sourceUrl!).catch(() => {})}>
                {siteName(recipe.sourceUrl)}
              </Text>
            </Text>
          ) : null}
        </RNView>
      </ScrollView>

      <RNView style={[styles.footer, { backgroundColor: c.background, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Button title="Edit" kind="secondary" onPress={editRecipe} />
        {onPlan ? (
          <Button
            title={`On this ${periodName(period)}'s plan`}
            kind="ink"
            icon="check"
            style={{ flex: 1 }}
            onPress={() => router.navigate('/planner')}
          />
        ) : (
          <Button
            title="Add to planner"
            icon="planner"
            style={{ flex: 1 }}
            onPress={() => dispatch({ type: 'planRecipe', range, recipeId: recipe.id })}
          />
        )}
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  scroll: { paddingBottom: 32 },
  hero: { height: 320, width: '100%' },
  heroButtons: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  sheet: {
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 18, gap: 2 },
  servings: { borderRadius: 20, paddingVertical: 14, paddingLeft: 18, paddingRight: 14, gap: 8 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inkBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 16 },
  section: { gap: 10 },
  ingredients: { paddingVertical: 4, paddingHorizontal: 16 },
  ingredient: { flexDirection: 'row', gap: 14, paddingVertical: 15, alignItems: 'flex-start' },
  amount: { width: 104, fontFamily: Fonts.bodyBold },
  haveRow: { gap: 10, paddingVertical: 12 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderRadius: 20 },
  stepNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepPhoto: { width: '100%', maxWidth: 420, aspectRatio: 4 / 3 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1 },
});

/** "recipetineats.com" from a full address, for a short source link. */
function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
