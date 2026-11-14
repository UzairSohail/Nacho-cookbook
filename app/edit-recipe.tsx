import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { PhotoField } from '@/components/PhotoField';
import { Button, Card, Chip, IconButton, Segmented, Text, TextInput, View, useTheme } from '@/components/Themed';
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
import { recipePhotos, unusedPhotos } from '@/src/photos/paths';
import { discardPhotos } from '@/src/photos/photoStore';
import { findPhotoFor, type AutoPhoto } from '@/src/import/autoPhoto';
import { clearPendingImport, peekPendingImport } from '@/src/state/pendingImport';
import { useCatalog, useRecipeMap, useStore } from '@/src/state/store';

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'the web';
  }
};

/** Add a recipe (no id) or edit one (?id=...). */
export default function EditRecipeScreen() {
  const { id, imported, sortedBy, aiNote } = useLocalSearchParams<{ id?: string; imported?: string; sortedBy?: string; aiNote?: string }>();
  const { state, dispatch } = useStore();
  const existing = useRecipeMap().get(id ?? '');
  const catalog = useCatalog();
  const c = useTheme();
  // Servings/prep/cook/keeps: two per row on a phone, all four on one row on a wide screen.
  const statStyle = [styles.stat, { flexBasis: useWindowDimensions().width < 560 ? '40%' : '20%' }];

  const fromImport = !existing && imported ? peekPendingImport() : null;
  const fromPhoto = !!fromImport && imported === 'photo';
  const pasted = !!fromImport && (imported === 'text' || fromPhoto);
  const [draft, setDraft] = useState<RecipeDraft>(
    () => (existing ? draftFromRecipe(existing, catalog) : fromImport) ?? emptyDraft(state.settings.householdSize),
  );
  const [errors, setErrors] = useState<DraftErrors | null>(null);
  // An imported recipe without a photo gets one picked by AI from free photo
  // libraries. It only fills an empty photo the person hasn't touched.
  const [autoPhoto, setAutoPhoto] = useState<AutoPhoto | 'looking' | null>(null);
  const photoTouched = useRef(false);
  useEffect(() => {
    if (!fromImport || fromImport.photoUrls.length) return;
    let cancelled = false;
    const ingredients = fromImport.lines.flatMap((l) => (l.kind === 'ingredient' && l.name ? [l.name] : []));
    setAutoPhoto('looking');
    void findPhotoFor(fromImport.title, ingredients).then((photo) => {
      if (cancelled) return;
      if (!photo || photoTouched.current) return setAutoPhoto(null);
      setDraft((d) => (d.photoUrls.length ? d : { ...d, photoUrls: [photo.url] }));
      setAutoPhoto(photo);
    });
    return () => {
      cancelled = true;
    };
    // Once, when the imported recipe opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Photos taken in this visit. Left unsaved, they're deleted when the editor closes.
  const added = useRef(new Set<string>());
  const saved = useRef(false);
  useEffect(
    () => () => {
      if (!saved.current) void discardPhotos([...added.current]);
    },
    [],
  );

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
  const setStep = (key: string, patch: Partial<StepLine>) =>
    set({ steps: draft.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const photoAdded = (path: string | undefined) => {
    if (path) added.current.add(path);
  };
  const setCover = (path: string | undefined) => {
    photoAdded(path);
    photoTouched.current = true;
    // The first photo is the cover; any others (none yet) stay behind it.
    set({ photoUrls: path ? [path, ...draft.photoUrls.slice(1)] : draft.photoUrls.slice(1) });
  };

  const save = () => {
    const e = validateDraft(draft);
    if (hasErrors(e)) {
      setErrors(e);
      return;
    }
    const recipe = draftToRecipe(draft, existing);
    dispatch({ type: 'saveRecipe', recipe });
    saved.current = true;
    void discardPhotos(unusedPhotos([...recipePhotos(existing), ...added.current], recipePhotos(recipe)));
    if (fromImport) clearPendingImport();
    if (existing) router.back();
    else router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  };

  const remove = () => {
    if (!existing) return;
    dispatch({ type: 'deleteRecipe', id: existing.id });
    saved.current = true;
    void discardPhotos([...recipePhotos(existing), ...added.current]);
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit recipe' : fromImport ? (fromPhoto ? 'Check photo recipe' : pasted ? 'Check pasted recipe' : 'Check imported recipe') : 'New recipe',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.background },
          headerTitleStyle: { fontFamily: Fonts.title, fontSize: 19, color: c.text },
          headerRight: () => (
            <Button title="Save" small onPress={save} style={{ marginRight: Platform.OS === 'web' ? 16 : 0, minHeight: 38 }} />
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: c.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {fromImport ? (
          <Card tone="accent" style={styles.gap}>
            <Text variant="heading">{fromPhoto ? 'Sorted from your photo' : pasted ? 'Sorted from your pasted text' : `Imported from ${hostOf(draft.sourceUrl)}`}</Text>
            <Text variant="muted">
              {pasted
                ? 'Check each line landed in the right place: ingredients, steps and notes. '
                : 'Check the ingredients and steps. '}
              Pick US cups and spoons below if it's an American recipe. Nothing is saved until you press Save.
            </Text>
            {sortedBy ? (
              <Text variant="muted">
                {sortedBy === 'ai'
                  ? 'Sorted by AI (Gemini).'
                  : `${pasted ? 'Sorted by the app’s built-in rules' : 'Read from the page’s recipe card'}. AI wasn’t used: ${aiNote || 'not available.'}`}
              </Text>
            ) : null}
          </Card>
        ) : null}
        <Field label="">
          <PhotoField
            path={draft.photoUrls[0]}
            householdId={state.householdId}
            onChange={setCover}
            label="Recipe photo"
          />
          {autoPhoto === 'looking' && !draft.photoUrls.length ? (
            <RNView style={styles.row}>
              <ActivityIndicator color={c.tint} />
              <Text variant="muted">Finding a photo for this recipe…</Text>
            </RNView>
          ) : autoPhoto && autoPhoto !== 'looking' && draft.photoUrls[0] === autoPhoto.url ? (
            <Text variant="muted">
              Photo picked by AI (Gemini){autoPhoto.credit ? `: ${autoPhoto.credit}` : ''}. Change or remove it if it’s not right.
            </Text>
          ) : null}
        </Field>
        <Field label="" error={errors?.title}>
          <TextInput
            value={draft.title}
            onChangeText={(title) => set({ title })}
            placeholder="Recipe name"
            accessibilityLabel="Recipe name"
            autoFocus={!existing && !fromImport}
            style={[styles.titleInput, { borderBottomColor: errors?.title ? c.tint : c.borderStrong }]}
          />
          <TextInput
            value={draft.description}
            onChangeText={(description) => set({ description })}
            placeholder="A line about it (optional)"
            accessibilityLabel="Description"
            multiline
            style={styles.plainInput}
          />
        </Field>

        {/* Labels are kept to one line so the boxes line up. */}
        <RNView style={styles.stats}>
          <Field label="Serves" error={errors?.servings} style={statStyle} card>
            <TextInput
              value={draft.servings}
              onChangeText={(servings) => set({ servings })}
              keyboardType="numeric"
              accessibilityLabel="Servings"
              placeholderTextColor={c.textFaint}
              style={styles.statInput}
            />
          </Field>
          <Field label="Prep (min)" error={errors?.prepMinutes} style={statStyle} card>
            <TextInput
              value={draft.prepMinutes}
              onChangeText={(prepMinutes) => set({ prepMinutes })}
              keyboardType="number-pad"
              placeholder="—"
              accessibilityLabel="Prep time in minutes"
              placeholderTextColor={c.textFaint}
              style={styles.statInput}
            />
          </Field>
          <Field label="Cook (min)" error={errors?.cookMinutes} style={statStyle} card>
            <TextInput
              value={draft.cookMinutes}
              onChangeText={(cookMinutes) => set({ cookMinutes })}
              keyboardType="number-pad"
              placeholder="—"
              accessibilityLabel="Cook time in minutes"
              placeholderTextColor={c.textFaint}
              style={styles.statInput}
            />
          </Field>
          <Field label="Keeps (days)" error={errors?.keepsForDays} style={statStyle} card>
            <TextInput
              value={draft.keepsForDays}
              onChangeText={(keepsForDays) => set({ keepsForDays })}
              keyboardType="number-pad"
              placeholder="3"
              accessibilityLabel="Days leftovers keep"
              placeholderTextColor={c.textFaint}
              style={styles.statInput}
            />
          </Field>
        </RNView>

        <IngredientsEditor draft={draft} errors={errors} set={set} setLine={setLine} />
        <StepsEditor
          steps={draft.steps}
          set={set}
          setStep={setStep}
          householdId={state.householdId}
          photoAdded={photoAdded}
        />

        <Text variant="heading" accessibilityRole="header">Extras</Text>
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
        <RNView style={[styles.row, { flexWrap: 'nowrap' }]}>
          <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
          <Button title={existing ? 'Save changes' : 'Save recipe'} style={{ flex: 1 }} onPress={save} />
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
              <Button title="Delete recipe" kind="quiet" icon="delete" onPress={() => setConfirmDelete(true)} />
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
      <RNView style={{ gap: 2 }}>
        <Text variant="heading" accessibilityRole="header">Ingredients</Text>
        <Text variant="muted" style={{ fontSize: 13 }}>Leave the amount empty for things like “salt, to taste”.</Text>
      </RNView>
      {lines.map((l, i) => (
        <Card key={l.key} style={styles.lineCard}>
          {l.kind === 'heading' ? (
            <TextInput
              value={l.text}
              onChangeText={(text) => setLine(l.key, { text })}
              placeholder="Section, e.g. For the sauce (blank ends it)"
              accessibilityLabel="Section heading"
              tone="sunken"
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
                  tone="sunken"
                  style={[styles.amount, { fontFamily: Fonts.bodyBold }]}
                />
                <TextInput
                  value={l.unit}
                  onChangeText={(unit) => setLine(l.key, { unit })}
                  placeholder="cups"
                  accessibilityLabel="Unit"
                  autoCapitalize="none"
                  tone="sunken"
                  style={styles.unit}
                />
                <TextInput
                  value={l.name}
                  onChangeText={(name) => setLine(l.key, { name })}
                  placeholder="Ingredient"
                  accessibilityLabel="Ingredient"
                  tone="sunken"
                  style={styles.name}
                />
              </RNView>
              <TextInput
                value={l.note}
                onChangeText={(note) => setLine(l.key, { note })}
                placeholder="Note, e.g. finely chopped"
                accessibilityLabel="Note"
                style={styles.plainInput}
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
              <Chip
                role="switch"
                tone="accent"
                label="Optional"
                selected={l.optional}
                onPress={() => setLine(l.key, { optional: !l.optional })}
                small
              />
            ) : null}
          </RowTools>
        </Card>
      ))}
      <RNView style={styles.row}>
        <Button title="Ingredient" icon="add" kind="ink" small onPress={() => set({ lines: [...lines, blankIngredient()] })} />
        <Button title="Section" icon="add" kind="secondary" small onPress={() => set({ lines: [...lines, blankHeading()] })} />
        <Button title="Paste a list" icon="paste" kind="secondary" small onPress={() => setPasting((p) => !p)} />
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
  householdId,
  photoAdded,
}: {
  steps: StepLine[];
  set: (p: Partial<RecipeDraft>) => void;
  setStep: (key: string, patch: Partial<StepLine>) => void;
  householdId: string;
  photoAdded: (path: string | undefined) => void;
}) {
  const c = useTheme();
  // Steps whose photo buttons are open (a step with a photo always shows them).
  const [photoOpen, setPhotoOpen] = useState<Set<string>>(new Set());
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
      <Text variant="heading" accessibilityRole="header">Method</Text>
      {steps.map((s, i) => (
        <Card key={s.key} style={styles.lineCard}>
          <RNView style={[styles.row, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
            <RNView style={[styles.stepNum, { backgroundColor: c.tintSoft }]}>
              <Text style={{ color: c.onTintSoft, fontFamily: Fonts.title }}>{i + 1}</Text>
            </RNView>
            <TextInput
              value={s.text}
              onChangeText={(text) => setStep(s.key, { text })}
              placeholder="What to do"
              accessibilityLabel={`Step ${i + 1}`}
              multiline
              style={[styles.multiline, styles.plainInput, { flex: 1 }]}
            />
          </RNView>
          {s.photo || photoOpen.has(s.key) ? (
            <PhotoField
              path={s.photo}
              householdId={householdId}
              size="step"
              label={`Photo for step ${i + 1}`}
              onChange={(photo) => {
                photoAdded(photo);
                setStep(s.key, { photo });
              }}
            />
          ) : null}
          <RowTools
            index={i}
            count={steps.length}
            move={(to) => set({ steps: move(steps, i, to) })}
            remove={() => set({ steps: steps.filter((x) => x.key !== s.key) })}>
            {!s.photo ? (
              <Chip
                role="switch"
                tone="accent"
                label="Photo"
                selected={photoOpen.has(s.key)}
                small
                onPress={() =>
                  setPhotoOpen((open) => {
                    const next = new Set(open);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  })
                }
              />
            ) : null}
          </RowTools>
        </Card>
      ))}
      <RNView style={styles.row}>
        <Button title="Step" icon="add" kind="ink" small onPress={() => set({ steps: [...steps, blankStep()] })} />
        <Button title="Paste steps" icon="paste" kind="secondary" small onPress={() => setPasting((p) => !p)} />
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
      <IconButton icon="up" tone="clear" size={36} iconSize={18} label="Move up" disabled={index === 0} onPress={() => move(index - 1)} />
      <IconButton icon="down" tone="clear" size={36} iconSize={18} label="Move down" disabled={index === count - 1} onPress={() => move(index + 1)} />
      <IconButton icon="delete" tone="clear" size={36} iconSize={18} label="Remove" onPress={remove} />
    </RNView>
  );
}

function Field({
  label,
  error,
  style,
  card,
  children,
}: {
  label: string;
  error?: string;
  style?: object;
  /** A small card with the label inside, for the number fields. */
  card?: boolean;
  children: ReactNode;
}) {
  const c = useTheme();
  return (
    <RNView
      style={[
        styles.field,
        card && [styles.fieldCard, { backgroundColor: c.card, borderColor: error ? c.tint : c.border }],
        style,
      ]}>
      {label ? (
        <Text variant={card ? 'muted' : 'label'} numberOfLines={1} style={card ? { fontSize: 12, fontFamily: Fonts.bodyBold } : undefined}>
          {label}
        </Text>
      ) : null}
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
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 16 },
  stat: { flexGrow: 1 },
  // Buttons that share a row fill it evenly, so a wrapped one doesn't sit alone on the left.
  grow: { flexGrow: 1 },
  multiline: { minHeight: 72, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  paste: { minHeight: 140, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  lineCard: { gap: 6, padding: 10, borderRadius: 20 },
  amount: { width: 64, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
  unit: { width: 76, minHeight: 44, borderRadius: 12, paddingHorizontal: 10 },
  name: { flex: 1, minWidth: 120, minHeight: 44, borderRadius: 12 },
  stepNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  fieldCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 0 },
  statInput: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0, minHeight: 36, fontFamily: Fonts.title, fontSize: 22 },
  titleInput: {
    borderWidth: 0,
    borderBottomWidth: 1.5,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    minHeight: 56,
    fontFamily: Fonts.title,
    fontSize: 26,
  },
  plainInput: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 2 },
});
