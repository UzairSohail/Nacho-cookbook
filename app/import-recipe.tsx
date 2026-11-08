import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { importRecipe, ImportError } from '@/src/import/importRecipe';
import { checkUrl } from '@/src/import/pageFetch';
import { setPendingImport } from '@/src/state/pendingImport';
import { draftFromImport } from '@/src/state/recipeDraft';
import { useStore } from '@/src/state/store';

/** Paste a recipe's web address; the recipe is found on the page and opened in the editor to check before saving. */
export default function ImportRecipeScreen() {
  const { state } = useStore();
  const c = useTheme();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Import a recipe' }} />
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="muted">
          Paste the address of a recipe page. The app finds the recipe among the story and ads, and opens it for you to check
          before saving.
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
            <Pressable accessibilityRole="button" onPress={() => router.replace('/edit-recipe')}>
              <Text style={{ color: c.tint, textDecorationLine: 'underline' }}>Add it by hand instead</Text>
            </Pressable>
          </Card>
        ) : null}
        <RNView style={styles.row}>
          <Button title={busy ? 'Finding the recipe…' : 'Find recipe'} onPress={go}
            disabled={busy || !url.trim()}
            style={busy || !url.trim() ? { opacity: 0.5 } : undefined}
          />
          {busy ? <ActivityIndicator color={c.tint} /> : null}
        </RNView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
