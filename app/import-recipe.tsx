import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { importRecipe, ImportError } from '@/src/import/importRecipe';
import { NoRecipeTextError, parseRecipeText } from '@/src/core/recipeText';
import { checkUrl } from '@/src/import/pageFetch';
import { setPendingImport } from '@/src/state/pendingImport';
import { draftFromImport } from '@/src/state/recipeDraft';
import { useStore } from '@/src/state/store';

type Mode = 'url' | 'text';

/**
 * Paste a recipe's web address, or the recipe itself for sites that won't let
 * the app read their pages. Either way the recipe opens in the editor to check
 * before saving.
 */
export default function ImportRecipeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { state } = useStore();
  const c = useTheme();
  const [mode, setMode] = useState<Mode>(params.mode === 'text' ? 'text' : 'url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address that couldn't be read, kept as the pasted recipe's source. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // Already saved from this page? Compare without the trailing slash or query.
  const sameAddress = (a: string) => {
    try {
      const u = checkUrl(a);
      return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return null;
    }
  };
  const target = url.trim() ? sameAddress(url) : null;
  const existing = target ? state.recipes.find((r) => r.sourceUrl && sameAddress(r.sourceUrl) === target) : undefined;

  const go = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const recipe = await importRecipe(url);
      setPendingImport(draftFromImport(recipe, state.settings.householdSize));
      router.replace({ pathname: '/edit-recipe', params: { imported: '1' } });
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading that page. Try again, or add it by hand.');
      try {
        setFailedUrl(checkUrl(url).toString());
      } catch {
        setFailedUrl(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const sortText = () => {
    if (!text.trim()) return;
    try {
      const recipe = parseRecipeText(text, failedUrl ?? '');
      setPendingImport(draftFromImport(recipe, state.settings.householdSize));
      router.replace({ pathname: '/edit-recipe', params: { imported: 'text' } });
    } catch (e) {
      setError(
        e instanceof NoRecipeTextError
          ? "Couldn't find any ingredients in that. Include the ingredient list, ideally under an \"Ingredients\" heading."
          : 'Something went wrong reading that text. Try again, or add it by hand.',
      );
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Import a recipe' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <RNView style={[styles.tabs, { borderColor: c.border }]} accessibilityRole="tablist">
          {(
            [
              ['url', 'From a website'],
              ['text', 'Paste the recipe'],
            ] as const
          ).map(([m, label]) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => switchTo(m)}
              style={[styles.tab, mode === m && { backgroundColor: c.tint }]}>
              <Text style={{ color: mode === m ? '#fff' : c.text, textAlign: 'center' }}>{label}</Text>
            </Pressable>
          ))}
        </RNView>

        {mode === 'url' ? (
          <>
            <Text variant="muted">
              Paste the address of a recipe page. The app finds the recipe among the story and ads, and opens it for you to
              check before saving.
            </Text>
            <TextInput
              value={url}
              onChangeText={(t) => {
                setUrl(t);
                setError(null);
              }}
              placeholder="https://www.example.com/best-lasagne"
              accessibilityLabel="Recipe web address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={go}
              editable={!busy}
            />
            {existing ? (
              <Text variant="muted">
                You already have{' '}
                <Link href={{ pathname: '/recipe/[id]', params: { id: existing.id } }} style={{ color: c.tint }}>
                  {existing.title}
                </Link>{' '}
                from this page. Importing again adds a second copy.
              </Text>
            ) : null}
            {error ? (
              <Card style={styles.gap}>
                <Text style={{ color: c.tint }}>{error}</Text>
                <Text variant="muted">
                  Some sites block apps from reading their pages. Open the recipe in your browser, select and copy the whole
                  recipe, and paste it here instead.
                </Text>
                <RNView style={styles.row}>
                  <Button title="Paste the recipe instead" onPress={() => switchTo('text')} />
                  <Button title="Add by hand" kind="secondary" onPress={() => router.replace('/edit-recipe')} />
                </RNView>
              </Card>
            ) : null}
            <RNView style={styles.row}>
              <Button
                title={busy ? 'Finding the recipe…' : 'Find recipe'}
                onPress={go}
                disabled={busy || !url.trim()}
                style={busy || !url.trim() ? { opacity: 0.5 } : undefined}
              />
              {busy ? <ActivityIndicator color={c.tint} /> : null}
            </RNView>
          </>
        ) : (
          <>
            <Text variant="muted">
              Copy the whole recipe from the website, a message or your notes, and paste it below: name, ingredients, method
              and notes. The app sorts it into the editor for you to check before saving.
            </Text>
            {failedUrl ? (
              <Text variant="muted">The recipe will be linked to {failedUrl}.</Text>
            ) : null}
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setError(null);
              }}
              placeholder={
                'Lemon slice\nServes 12\n\nIngredients\n250 g Marie biscuits, crushed\n1/2 cup condensed milk\n\nMethod\n1. Mix the biscuits and condensed milk.\n2. Press into a tin and chill.'
              }
              accessibilityLabel="Recipe text"
              multiline
              autoFocus
              style={styles.paste}
            />
            {error ? (
              <Card style={styles.gap}>
                <Text style={{ color: c.tint }}>{error}</Text>
              </Card>
            ) : null}
            <RNView style={styles.row}>
              <Button
                title="Sort into a recipe"
                onPress={sortText}
                disabled={!text.trim()}
                style={!text.trim() ? { opacity: 0.5 } : undefined}
              />
            </RNView>
            <Text variant="muted">
              Tip: headings like Ingredients, Method and Notes help. Lines ending in a colon, such as &quot;For the sauce:&quot;,
              become sections.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  paste: { minHeight: 260, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
});
