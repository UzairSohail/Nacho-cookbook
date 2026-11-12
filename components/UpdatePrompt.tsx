/**
 * Android only: checks for a newer app build when the app opens or comes back
 * to the foreground, asks once per new build whether to install it, and shows
 * a small bar while the update downloads.
 */
import { useEffect, useRef } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useTheme } from '@/components/Themed';
import { formatMb } from '@/src/core/appUpdate';
import { checkForUpdate, installUpdate, updatesSupported, useAppUpdate } from '@/src/updates/appUpdate';

export function UpdatePrompt() {
  const update = useAppUpdate();
  const asked = useRef<number | null>(null);
  const insets = useSafeAreaInsets();
  const c = useTheme();

  useEffect(() => {
    if (!updatesSupported) return;
    checkForUpdate();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkForUpdate();
    });
    return () => sub.remove();
  }, []);

  const latest = update.latest;
  useEffect(() => {
    if (!update.available || !latest || asked.current === latest.build) return;
    asked.current = latest.build;
    const size = formatMb(latest.apkSize);
    Alert.alert(
      'Update available',
      `A new version of Nacho Cookbook is ready${size ? ` (${size})` : ''}. Download it now? Android will then ask you to tap Update.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Update', onPress: () => installUpdate() },
      ],
    );
  }, [update.available, latest]);

  if (update.phase !== 'downloading') return null;
  const pct = update.progress == null ? null : Math.round(update.progress * 100);
  return (
    <View
      pointerEvents="none"
      style={[styles.bar, { top: insets.top + 8, backgroundColor: c.card, borderColor: c.border }]}
      accessibilityLiveRegion="polite">
      <Text variant="muted">Downloading update{pct == null ? '…' : ` ${pct}%`}</Text>
      <View style={[styles.track, { backgroundColor: c.border }]}>
        <View style={[styles.fill, { backgroundColor: c.tint, width: `${pct ?? 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 10,
    gap: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
});
