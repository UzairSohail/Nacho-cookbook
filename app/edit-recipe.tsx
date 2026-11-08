import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, View, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
import {
  blankHeading,
  blankIngredient,
  blankStep,
  draftFromRecipe,
  draftToRecipe,
  emptyDraft,
  hasErrors,
  linesFromText,
  stepsFromText,
  validateDraft,
  type DraftErrors,
  type DraftLine,
  type IngredientLine,
  type RecipeDraft,
  type StepLine,
} from '@/src/state/recipeDraft';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

/** Add a recipe (no id) or edit one (?id=...). */
export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, dispatch } = useStore();
  const existing = useRecipeMap().get(id ?? '');
  const catalog = useCatalog();
  const c = useTheme();

  const [draft, setDraft] = useState<RecipeDraft>(() =>
    existing ? draftFromRecipe(existing, catalog) : emptyDraft(state.settings.householdSize),
  );
  const [errors, setErrors] = useState<DraftErrors | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (id && !existing) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Edit recipe' }} />
        <Text>Recipe not found. It may have been deleted.</Text>
      </View>
    );
  }

  const set = (patch: Partial<RecipeDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Once errors are showing, keep them up to date as fields are fixed.
    if (errors) setErrors(validateDraft(next));
  };
  const setLine = (key: string, patch: Partial<IngredientLine> | { text: string }) =>
    set({ lines: draft.lines.map((l) => (l.key === key ? ({ ...l, ...patch } as DraftLine) : l)) });
  const setStep = (key: string, text: string) =>
    set({ steps: draft.steps.map((s) => (s.key === key ? { ...s, text } : s)) });

  const save = () => {
    const e = validateDraft(draft);
    if (hasErrors(e)) {
      setErrors(e);
      return;
    }
    const recipe = draftToRecipe(draft, existing);
    dispatch({ type: 'saveRecipe', recipe });
    if (existing) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  };

  const remove = () => {
    if (!existing) return;
    dispatch({ type: 'deleteRecipe', id: existing.id });
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit recipe' : 'New recipe',
          headerRight: () => (
            <Pressable onPress={save} accessibilityRole="button" hitSlop={12} style={{ marginRight: Platform.OS === 'web' ? 16 : 0 }}>
              <Text style={{ color: c.tint, fontFamily: Fonts.bodyBold }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Field label="NAME" error={errors?.title}>
          <TextInput
            value={draft.title}
            onChangeText={(title) => set({ title })}
            placeholder="e.g. Chicken curry"
            accessibilityLabel="Recipe name"
            autoFocus={!existing}
          />
        </Field>
        <Field label="DESCRIPTION">
          <TextInput
            value={draft.description}
            onChangeText={(description) => set({ description })}
            placeholder="A line about it (optional)"
            accessibilityLabel="Description"
            multiline
            style={styles.multiline}
          />
        </Field>

        <RNView style={styles.row}>
          <Field label="SERVINGS" error={errors?.servings} style={styles.small}>
            <TextInput
              value={draft.servings}
              onChangeText={(servings) => set({ servings })}
              keyboardType="numeric"
              accessibilityLabel="Servings"
            />
          </Field>
          <Field label="PREP (MIN)" error={errors?.prepMinutes} style={styles.small}>
            <TextInput
              value={draft.prepMinutes}
              onChangeText={(prepMinutes) => set({ prepMinutes })}
              keyboardType="number-pad"
              accessibilityLabel="Prep time in minutes"
            />
          </Field>
          <Field label="COOK (MIN)" error={errors?.cookMinutes} style={styles.small}>
            <TextInput
              value={draft.cookMinutes}
              onChangeText={(cookMinutes) => set({ cookMinutes })}
              keyboardType="number-pad"
              accessibilityLabel="Cook time in minutes"
            />
          </Field>
          <Field label="KEEPS (DAYS)" error={errors?.keepsForDays} style={styles.small}>
            <TextInput
              value={draft.keepsForDays}
              onChangeText={(keepsForDays) => set({ keepsForDays })}
              keyboardType="number-pad"
              placeholder="3"
              accessibilityLabel="Days leftovers keep"
            />
          </Field>
        </RNView>

        <RNView style={styles.gap}>
          <Text variant="label">CUPS AND SPOONS</Text>
          <RNView style={styles.row}>
            <Chip label="Ours" on={!draft.usMeasures} onPress={() => set({ usMeasures: false })} />
            <Chip label="US (American recipe)" on={draft.usMeasures} onPress={() => set({ usMeasures: true })} />
          </RNView>
          <Text variant="muted">
            Pick US for recipes from American sites, so spoons are converted and cups are labelled.
          </Text>
        </RNView>

        <IngredientsEditor draft={draft} errors={errors} set={set} setLine={setLine} />
        <StepsEditor steps={draft.steps} set={set} setStep={setStep} />

        <Field label="TAGS">
          <TextInput
            value={draft.tags}
            onChangeText={(tags) => set({ tags })}
            placeholder="dinner, vegetarian, quick"
            accessibilityLabel="Tags, separated by commas"
            autoCapitalize="none"
          />
        </Field>
        <Field label="NOTES">
          <TextInput
            value={draft.notes}
            onChangeText={(notes) => set({ notes })}
            placeholder="Tips, swaps, what worked"
            accessibilityLabel="Notes"
            multiline
            style={styles.multiline}
          />
        </Field>
        <Field label="SOURCE">
          <TextInput
            value={draft.sourceUrl}
            onChangeText={(sourceUrl) => set({ sourceUrl })}
            placeholder="Website or book (optional)"
            accessibilityLabel="Source"
            autoCapitalize="none"
            keyboardType="url"
          />
        </Field>

        {errors && hasErrors(errors) ? (
          <Text style={{ color: c.tint }}>Check the highlighted fields above.</Text>
        ) : null}
        <RNView style={styles.row}>
          <Button title={existing ? 'Save changes' : 'Save recipe'} onPress={save} />
          <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
        </RNView>

        {existing ? (
          <Card style={[styles.gap, { marginTop: 12 }]}>
            {confirmDelete ? (
              <>
                <Text>Delete “{existing.title}” for everyone in your household? Meals planned with it are removed too.</Text>
                <RNView style={styles.row}>
                  <Button title="Delete recipe" onPress={remove} />
                  <Button title="Keep it" kind="secondary" onPress={() => setConfirmDelete(false)} />
                </RNView>
              </>
            ) : (
              <Button title="Delete recipe" kind="secondary" onPress={() => setConfirmDelete(true)} />
            )}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function IngredientsEditor({
  draft,
  errors,
  set,
  setLine,
}: {
  draft: RecipeDraft;
  errors: DraftErrors | null;
  set: (p: Partial<RecipeDraft>) => void;
  setLine: (key: string, patch: Partial<IngredientLine> | { text: string }) => void;
}) {
  const c = useTheme();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const lines = draft.lines;

  const addPasted = () => {
    const parsed = linesFromText(pasted);
    if (!parsed.length) return;
    // Drop the blank rows a new recipe starts with.
    const kept = lines.filter((l) => l.kind === 'heading' || l.amount || l.unit || l.name || l.note);
    set({ lines: [...kept, ...parsed] });
    setPasted('');
    setPasting(false);
  };

  return (
    <RNView style={styles.gap}>
      <Text variant="heading">Ingredients</Text>
      <Text variant="muted">Leave the amount empty for things like “salt, to taste”.</Text>
      {lines.map((l, i) => (
        <Card key={l.key} style={styles.lineCard}>
          {l.kind === 'heading' ? (
            <TextInput
              value={l.text}
              onChangeText={(text) => setLine(l.key, { text })}
              placeholder="Section, e.g. For the sauce (blank ends it)"
              accessibilityLabel="Section heading"
              style={{ fontFamily: Fonts.bodyBold }}
            />
          ) : (
            <>
              <RNView style={styles.row}>
                <TextInput
                  value={l.amount}
                  onChangeText={(amount) => setLine(l.key, { amount })}
                  placeholder="1 1/2"
                  accessibilityLabel="Amount"
                  style={styles.amount}
                />
                <TextInput
                  value={l.unit}
                  onChangeText={(unit) => setLine(l.key, { unit })}
                  placeholder="cups"
                  accessibilityLabel="Unit"
                  autoCapitalize="none"
                  style={styles.unit}
                />
                <TextInput
                  value={l.name}
                  onChangeText={(name) => setLine(l.key, { name })}
                  placeholder="Ingredient"
                  accessibilityLabel="Ingredient"
                  style={styles.name}
                />
              </RNView>
              <TextInput
                value={l.note}
                onChangeText={(note) => setLine(l.key, { note })}
                placeholder="Note, e.g. finely chopped"
                accessibilityLabel="Note"
              />
              {errors?.lines[l.key] ? <Text style={{ color: c.tint }}>{errors.lines[l.key]}</Text> : null}
            </>
          )}
          <RowTools
            index={i}
            count={lines.length}
            move={(to) => set({ lines: move(lines, i, to) })}
            remove={() => set({ lines: lines.filter((x) => x.key !== l.key) })}>
            {l.kind === 'ingredient' ? (
              <Chip label="Optional" on={l.optional} onPress={() => setLine(l.key, { optional: !l.optional })} small />
            ) : null}
          </RowTools>
        </Card>
      ))}
      <RNView style={styles.row}>
        <Button title="Add ingredient" kind="secondary" onPress={() => set({ lines: [...lines, blankIngredient()] })} />
        <Button title="Add section" kind="secondary" onPress={() => set({ lines: [...lines, blankHeading()] })} />
        <Button title="Paste a list" kind="secondary" onPress={() => setPasting((p) => !p)} />
      </RNView>
      {pasting ? (
        <Card style={styles.gap}>
          <Text variant="muted">One ingredient per line, like “2 cloves garlic, crushed”. A line ending in “:” starts a section.</Text>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            autoFocus
            accessibilityLabel="Ingredients to add, one per line"
            placeholder={'500 g chicken thighs\n1 brown onion, diced\nSalt, to taste'}
            style={styles.paste}
          />
          <RNView style={styles.row}>
            <Button title="Add these" onPress={addPasted} />
            <Button title="Cancel" kind="secondary" onPress={() => setPasting(false)} />
          </RNView>
        </Card>
      ) : null}
    </RNView>
  );
}

function StepsEditor({
  steps,
  set,
  setStep,
}: {
  steps: StepLine[];
  set: (p: Partial<RecipeDraft>) => void;
  setStep: (key: string, text: string) => void;
}) {
  const c = useTheme();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const addPasted = () => {
    const parsed = stepsFromText(pasted);
    if (!parsed.length) return;
    set({ steps: [...steps.filter((s) => s.text.trim()), ...parsed] });
    setPasted('');
    setPasting(false);
  };
  return (
    <RNView style={styles.gap}>
      <Text variant="heading">Method</Text>
      {steps.map((s, i) => (
        <Card key={s.key} style={styles.lineCard}>
          <RNView style={[styles.row, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
            <RNView style={[styles.stepNum, { backgroundColor: c.tint }]}>
              <Text style={{ color: c.onTint }}>{i + 1}</Text>
            </RNView>
            <TextInput
              value={s.text}
              onChangeText={(text) => setStep(s.key, text)}
              placeholder="What to do"
              accessibilityLabel={`Step ${i + 1}`}
              multiline
              style={[styles.multiline, { flex: 1 }]}
            />
          </RNView>
          <RowTools
            index={i}
            count={steps.length}
            move={(to) => set({ steps: move(steps, i, to) })}
            remove={() => set({ steps: steps.filter((x) => x.key !== s.key) })}
          />
        </Card>
      ))}
      <RNView style={styles.row}>
        <Button title="Add step" kind="secondary" onPress={() => set({ steps: [...steps, blankStep()] })} />
        <Button title="Paste steps" kind="secondary" onPress={() => setPasting((p) => !p)} />
      </RNView>
      {pasting ? (
        <Card style={styles.gap}>
          <Text variant="muted">One step per line. Numbers like “1.” are removed.</Text>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            autoFocus
            accessibilityLabel="Steps to add, one per line"
            style={styles.paste}
          />
          <RNView style={styles.row}>
            <Button title="Add these" onPress={addPasted} />
            <Button title="Cancel" kind="secondary" onPress={() => setPasting(false)} />
          </RNView>
        </Card>
      ) : null}
    </RNView>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RowTools({
  index,
  count,
  move,
  remove,
  children,
}: {
  index: number;
  count: number;
  move: (to: number) => void;
  remove: () => void;
  children?: ReactNode;
}) {
  return (
    <RNView style={[styles.row, { alignItems: 'center' }]}>
      {children}
      <RNView style={{ flex: 1 }} />
      <IconButton label="↑" a11y="Move up" disabled={index === 0} onPress={() => move(index - 1)} />
      <IconButton label="↓" a11y="Move down" disabled={index === count - 1} onPress={() => move(index + 1)} />
      <IconButton label="✕" a11y="Remove" onPress={remove} />
    </RNView>
  );
}

function IconButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, { borderColor: c.border, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Text style={{ color: c.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, on, onPress, small }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : 'transparent', opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={{ color: on ? c.onTint : c.text, fontFamily: Fonts.bodyMedium, fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, error, style, children }: { label: string; error?: string; style?: object; children: ReactNode }) {
  const c = useTheme();
  return (
    <RNView style={[styles.field, style]}>
      <Text variant="label">{label}</Text>
      {children}
      {error ? <Text style={{ color: c.tint }}>{error}</Text> : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { padding: 16, gap: 20, paddingBottom: 64, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  field: { gap: 6 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  small: { flexGrow: 1, flexBasis: 72 },
  multiline: { minHeight: 72, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  paste: { minHeight: 140, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  lineCard: { gap: 8, padding: 12 },
  amount: { width: 72 },
  unit: { width: 84 },
  name: { flex: 1, minWidth: 120 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipSmall: { minHeight: 32, paddingHorizontal: 10 },
});
