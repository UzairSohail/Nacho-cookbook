import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Text, useTheme } from '@/components/Themed';
import { pickPhoto, type PhotoSource } from '@/src/photos/photoStore';

/** Take, choose, replace or remove one photo in the recipe editor. */
export function PhotoField({
  path,
  householdId,
  onChange,
  size = 'cover',
  label,
}: {
  path: string | undefined;
  householdId: string;
  /** A new photo's path, or undefined when removed. */
  onChange: (path: string | undefined) => void;
  size?: 'cover' | 'step';
  label: string;
}) {
  const c = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: PhotoSource) => {
    setError(null);
    setBusy(true);
    try {
      const added = await pickPhoto(source, householdId);
      if (added) onChange(added);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add that photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.gap}>
      {path ? (
        <RecipePhoto path={path} style={size === 'cover' ? styles.cover : styles.step} label={label} />
      ) : null}
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator color={c.tint} />
          <Text variant="muted">Adding photo…</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <Button title={path ? 'New photo' : 'Take photo'} kind="secondary" onPress={() => pick('camera')} />
          <Button title={path ? 'Choose another' : 'Choose photo'} kind="secondary" onPress={() => pick('library')} />
          {path ? <Button title="Remove photo" kind="secondary" onPress={() => onChange(undefined)} /> : null}
        </View>
      )}
      {error ? <Text style={{ color: c.tint }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  cover: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360 },
  step: { width: 160, height: 120 },
});
