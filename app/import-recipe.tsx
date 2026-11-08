import * as ImagePicker from 'expo-image-picker';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import InstagramCaptionReader from '@/components/InstagramCaptionReader';

import { Button, Card, Text, TextInput, useTheme } from '@/components/Themed';
import { captionFromEmbedHtml, instagramPost, type InstagramPost } from '@/src/core/instagram';
import { importRecipe, ImportError } from '@/src/import/importRecipe';
import { NoRecipeTextError, parseRecipeText } from '@/src/core/recipeText';
import { checkUrl } from '@/src/import/pageFetch';
import { PhotoTextError, readPhotoText } from '@/src/import/photoText';
import { setPendingImport } from '@/src/state/pendingImport';
import { draftFromImport } from '@/src/state/recipeDraft';
import { useStore } from '@/src/state/store';

type Mode = 'url' | 'photo' | 'text';

/**
 * Paste a recipe's web address, take a photo of a cookbook page, or paste the
 * recipe itself for sites that won't let the app read their pages. Photos are
 * read into the paste box first, so misread words can be fixed. Every way, the
 * recipe opens in the editor to check before saving. Pages and text shared
 * from other apps arrive here too, as the url, or text and source, params.
 *
 * Instagram posts are different: the recipe is usually in the caption, which
 * the Instagram app won't let you copy. On Android the caption is read from
 * the post's public embed page into the paste box. The web app can't read it,
 * so it offers that page for copying the caption by hand.
 */
export default function ImportRecipeScreen() {
  const params = useLocalSearchParams<{ mode?: string; url?: string; text?: string; source?: string }>();
  const { state } = useStore();
  const c = useTheme();
  const [mode, setMode] = useState<Mode>(params.mode === 'text' || params.mode === 'photo' ? params.mode : 'url');
  const [url, setUrl] = useState(params.url ?? '');
  const [text, setText] = useState(params.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address that couldn't be read, kept as the pasted recipe's source. */
  const [failedUrl, setFailedUrl] = useState<string | null>(params.source || null);
  /** How many photos have been read into the text box. */
  const [photoPages, setPhotoPages] = useState(0);
  /** The Instagram post whose caption is being read on Android. */
  const [reading, setReading] = useState<InstagramPost | null>(null);
  /** An Instagram post whose caption the app couldn't read, for the copy-it-yourself help. */
  const [instagramHelp, setInstagramHelp] = useState<InstagramPost | null>(null);
  /** The paste box holds an Instagram caption. */
  const [fromInstagram, setFromInstagram] = useState(false);

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

  const go = async (address: string = url) => {
    if (!address.trim() || busy) return;
    setError(null);
    setInstagramHelp(null);
    const post = instagramPost(address);
    if (post) {
      setFailedUrl(post.url);
      if (Platform.OS === 'web') setInstagramHelp(post);
      else {
        setBusy(true);
        setReading(post);
      }
      return;
    }
    setBusy(true);
    try {
      const recipe = await importRecipe(address);
      setPendingImport(draftFromImport(recipe, state.settings.householdSize));
      router.replace({ pathname: '/edit-recipe', params: { imported: '1' } });
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading that page. Try again, or add it by hand.');
      try {
        setFailedUrl(checkUrl(address).toString());
      } catch {
        setFailedUrl(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const captionRead = (html: string | null) => {
    const post = reading;
    setReading(null);
    setBusy(false);
    const caption = html ? captionFromEmbedHtml(html) : null;
    if (caption) {
      setText(caption);
      setFromInstagram(true);
      setPhotoPages(0);
      setMode('text');
    } else if (post) {
      setInstagramHelp(post);
    }
  };

  // A page shared from another app is read straight away, unless it's already
  // saved: then the warning below shows and importing again is left to the user.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !params.url) return;
    autoStarted.current = true;
    if (!existing) go(params.url);
  }, [params.url]);

  const sortText = () => {
    if (!text.trim()) return;
    try {
      const recipe = parseRecipeText(text, failedUrl ?? '');
      setPendingImport(draftFromImport(recipe, state.settings.householdSize));
      router.replace({ pathname: '/edit-recipe', params: { imported: photoPages > 0 ? 'photo' : 'text' } });
    } catch (e) {
      setError(
        e instanceof NoRecipeTextError
          ? "Couldn't find any ingredients in that. Include the ingredient list, ideally under an \"Ingredients\" heading."
          : 'Something went wrong reading that text. Try again, or add it by hand.',
      );
    }
  };

  const readPhotos = async (source: 'camera' | 'library') => {
    if (busy) return;
    setError(null);
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Camera access is off for Nacho Cookbook. Turn it on in your phone’s settings, or choose a photo instead.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 4, orderedSelection: true });
      const assets = result.canceled ? [] : (result.assets ?? []);
      if (!assets.length) return;
      setBusy(true);
      const pages: string[] = [];
      for (const asset of assets) {
        const read = (await readPhotoText(asset.uri)).trim();
        if (read) pages.push(read);
      }
      if (!pages.length) {
        setError('Couldn’t find any writing in that picture. Try a sharper, well-lit photo taken straight on.');
        return;
      }
      setText((t) => [t.trim(), ...pages].filter(Boolean).join('\n\n'));
      setPhotoPages((n) => n + pages.length);
      setFromInstagram(false);
      setMode('text');
    } catch (e) {
      setError(e instanceof PhotoTextError ? e.message : 'Something went wrong reading that picture. Try again, or add it by hand.');
    } finally {
      setBusy(false);
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
              ['url', 'Website'],
              ['photo', 'Photo'],
              ['text', 'Paste text'],
            ] as const
          ).map(([m, label]) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => switchTo(m)}
              style={[styles.tab, mode === m && { backgroundColor: c.tint }]}>
              <Text numberOfLines={1} style={{ color: mode === m ? c.onTint : c.text, textAlign: 'center', fontSize: 15 }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </RNView>

        {mode === 'url' ? (
          <>
            <Text variant="muted">
              Paste the address of a recipe page or an Instagram post. The app finds the recipe among the story and ads, and
              opens it for you to check before saving.
            </Text>
            <TextInput
              value={url}
              onChangeText={(t) => {
                setUrl(t);
                setError(null);
                setInstagramHelp(null);
              }}
              placeholder="https://www.example.com/best-lasagne"
              accessibilityLabel="Recipe web address"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={() => go()}
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
            {reading ? <InstagramCaptionReader embedUrl={reading.embedUrl} onDone={captionRead} /> : null}
            {instagramHelp ? (
              <Card style={styles.gap}>
                <Text style={{ color: c.tint }}>
                  {Platform.OS === 'web'
                    ? 'Instagram doesn’t let websites read its posts, so copy the caption yourself.'
                    : 'Couldn’t read that post’s caption. It may be private or deleted, or the recipe may be in the video rather than the caption.'}
                </Text>
                <Text variant="muted">
                  Open the caption page, select the whole caption, copy it, and paste it here. You can also take a screenshot of
                  the caption in Instagram and use the Photo tab.
                </Text>
                <RNView style={styles.row}>
                  <Button title="Open the caption page" onPress={() => Linking.openURL(instagramHelp.embedUrl).catch(() => {})} />
                  <Button title="Paste the caption" kind="secondary" onPress={() => switchTo('text')} />
                  {Platform.OS !== 'web' ? (
                    <Button title="Use a screenshot" kind="secondary" onPress={() => switchTo('photo')} />
                  ) : null}
                </RNView>
              </Card>
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
                title={busy ? (reading ? 'Reading the caption…' : 'Finding the recipe…') : 'Find recipe'}
                onPress={() => go()}
                disabled={busy || !url.trim()}
                style={busy || !url.trim() ? { opacity: 0.5 } : undefined}
              />
              {busy ? <ActivityIndicator color={c.tint} /> : null}
            </RNView>
          </>
        ) : mode === 'photo' ? (
          <>
            <Text variant="muted">
              Take a photo of a cookbook page or recipe card, or choose a screenshot. The app reads the writing into a text box
              for you to check, then sorts it into the editor.
            </Text>
            <Text variant="muted">
              For the best result, lay the page flat in good light and take the photo straight on. A recipe over two pages can
              be two photos.
            </Text>
            {error ? (
              <Card style={styles.gap}>
                <Text style={{ color: c.tint }}>{error}</Text>
              </Card>
            ) : null}
            <RNView style={styles.row}>
              <Button
                title="Take a photo"
                onPress={() => readPhotos('camera')}
                disabled={busy}
                style={busy ? { opacity: 0.5 } : undefined}
              />
              <Button
                title={Platform.OS === 'web' ? 'Choose a picture' : 'Choose from photos'}
                kind="secondary"
                onPress={() => readPhotos('library')}
                disabled={busy}
                style={busy ? { opacity: 0.5 } : undefined}
              />
            </RNView>
            {busy ? (
              <RNView style={styles.row}>
                <ActivityIndicator color={c.tint} />
                <Text variant="muted">
                  {Platform.OS === 'web' && photoPages === 0
                    ? 'Reading the recipe… The first time takes a little longer while the reader loads.'
                    : 'Reading the recipe…'}
                </Text>
              </RNView>
            ) : null}
          </>
        ) : (
          <>
            {photoPages > 0 ? (
              <Card style={styles.gap}>
                <Text>
                  Read from your {photoPages === 1 ? 'photo' : `${photoPages} photos`}. Check the text below, especially amounts and
                  fractions, then sort it into a recipe.
                </Text>
                <RNView style={styles.row}>
                  <Button title="Add another page" kind="secondary" onPress={() => switchTo('photo')} />
                </RNView>
              </Card>
            ) : null}
            {fromInstagram ? (
              <Card style={styles.gap}>
                <Text>
                  Read from the Instagram caption. Check the text below, then sort it into a recipe. If the ingredients and
                  steps get mixed up, add &quot;Ingredients&quot; and &quot;Method&quot; lines above them.
                </Text>
              </Card>
            ) : null}
            {photoPages === 0 && !fromInstagram ? (
              <Text variant="muted">
                Copy the whole recipe from the website, a message or your notes, and paste it below: name, ingredients, method
                and notes. The app sorts it into the editor for you to check before saving.
              </Text>
            ) : null}
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
  tab: { flex: 1, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 999 },
  paste: { minHeight: 260, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
});
