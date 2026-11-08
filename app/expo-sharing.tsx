import { router } from 'expo-router';
import { clearSharedPayloads, getSharedPayloads, type SharePayload } from 'expo-sharing';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/Themed';
import { readSharedText } from '@/src/core/sharedText';

/**
 * Android opens this screen when a page or some text is shared to the app
 * (Share > Nacho Cookbook in Chrome, for example). It hands what was shared to
 * the import screen: a page address is read straight away, and recipe text is
 * put in the "Paste text" box.
 */
export default function SharedIntoApp() {
  const c = useTheme();

  useEffect(() => {
    let payloads: SharePayload[] = [];
    if (Platform.OS !== 'web') {
      try {
        payloads = getSharedPayloads();
        clearSharedPayloads();
      } catch {
        payloads = [];
      }
    }
    const value = payloads.find((p) => p.shareType === 'url' || p.shareType === 'text')?.value;
    const shared = readSharedText(value);

    if (!shared) {
      router.replace('/');
    } else if (shared.kind === 'url') {
      router.replace({ pathname: '/import-recipe', params: { url: shared.url } });
    } else {
      router.replace({
        pathname: '/import-recipe',
        params: { mode: 'text', text: shared.text, ...(shared.sourceUrl ? { source: shared.sourceUrl } : {}) },
      });
    }
  }, []);

  return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <ActivityIndicator color={c.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
