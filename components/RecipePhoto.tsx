import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text, useTheme } from '@/components/Themed';
import { isWebPhoto } from '@/src/photos/paths';
import { photoUri } from '@/src/photos/photoStore';

/** Where to load a photo from, once known. Undefined while looking it up, null if there's nothing to show. */
export function usePhotoUri(path: string | undefined | null): string | null | undefined {
  const [uri, setUri] = useState<string | null | undefined>(() => (!path ? null : isWebPhoto(path) ? path : undefined));
  useEffect(() => {
    if (!path) {
      setUri(null);
      return;
    }
    let live = true;
    if (!isWebPhoto(path)) setUri(undefined);
    photoUri(path)
      .then((u) => live && setUri(u))
      .catch(() => live && setUri(null));
    return () => {
      live = false;
    };
  }, [path]);
  return uri;
}

/**
 * A recipe or step photo. Shows `fallback` (or a plain tile) when there's no
 * photo, it hasn't reached this device yet, or it can't be loaded.
 */
export function RecipePhoto({
  path,
  style,
  fallbackLetter,
  label,
}: {
  path: string | undefined | null;
  style?: StyleProp<ViewStyle>;
  /** Shown big on a blank tile when there's no photo, e.g. the recipe's first letter. */
  fallbackLetter?: string;
  label?: string;
}) {
  const c = useTheme();
  const uri = usePhotoUri(path);
  const [failed, setFailed] = useState<string | null>(null);
  const show = uri && failed !== uri;
  return (
    <View style={[styles.tile, { backgroundColor: c.border }, style]} accessible={!!label} accessibilityLabel={label}>
      {show ? (
        <Image
          // Phones cache by photo path, so a new signed link still finds the cached copy offline.
          source={{ uri, cacheKey: path && !isWebPhoto(path) ? path : undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onError={() => setFailed(uri)}
        />
      ) : fallbackLetter ? (
        <Text style={styles.letter}>{fallbackLetter}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  letter: { fontSize: 28, opacity: 0.5 },
});
