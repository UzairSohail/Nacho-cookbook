import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RecipePhoto } from '@/components/RecipePhoto';
import { Button, Icon, Text, useTheme } from '@/components/Themed';
import { Fonts } from '@/constants/Colors';
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

  const buttons = busy ? (
    <View style={styles.row}>
      <ActivityIndicator color={c.tint} />
      <Text variant="muted">Adding photo…</Text>
    </View>
  ) : (
    <View style={[styles.row, !path && size === 'cover' && { justifyContent: 'center' }]}>
      <Button small icon="camera" title={path ? 'New photo' : 'Take photo'} kind={path ? 'secondary' : 'ink'} onPress={() => pick('camera')} />
      <Button small icon="image" title={path ? 'Choose another' : 'Choose photo'} kind="secondary" onPress={() => pick('library')} />
      {path ? <Button small icon="delete" title="Remove" kind="secondary" onPress={() => onChange(undefined)} /> : null}
    </View>
  );

  return (
    <View style={styles.gap}>
      {path ? (
        <>
          <RecipePhoto path={path} style={size === 'cover' ? styles.cover : styles.step} label={label} />
          {buttons}
        </>
      ) : size === 'cover' ? (
        <View style={[styles.drop, { borderColor: c.borderStrong, backgroundColor: c.sunken }]}>
          <View style={[styles.dropIcon, { backgroundColor: c.card }]}>
            <Icon name="camera" size={24} />
          </View>
          <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 15 }}>Add a photo of the dish</Text>
          {buttons}
        </View>
      ) : (
        buttons
      )}
      {error ? <Text style={{ color: c.tint }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  cover: { width: '100%', aspectRatio: 4 / 3, maxHeight: 360, borderRadius: 22 },
  step: { width: 160, height: 120, borderRadius: 14 },
  drop: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 24, paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center', gap: 12 },
  dropIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
