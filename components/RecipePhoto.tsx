import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { RecipeTones } from '@/constants/Colors';
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

type ArtRecipe = { id: string; title?: string; tags?: readonly string[] };

/** Which icon stands in for a recipe's photo, from its tags. */
const TAG_ICONS: Array<[RegExp, IconName]> = [
  [/breakfast|brunch/i, 'breakfast'],
  [/dessert|sweet|cake|baking|treat/i, 'dessert'],
  [/soup|noodle|ramen|curry/i, 'soup'],
  [/salad|bowl|vegan/i, 'bowl'],
  [/lunch|sandwich|burger|wrap/i, 'lunch'],
  [/bread|bake/i, 'bakery'],
  [/drink|smoothie|coffee/i, 'drink'],
  [/dinner|main|pasta/i, 'dinner'],
];

export function recipeIcon(recipe: ArtRecipe): IconName {
  const words = [...(recipe.tags ?? []), recipe.title ?? ''];
  for (const [re, icon] of TAG_ICONS) if (words.some((w) => re.test(w))) return icon;
  return 'meal';
}

/** A stable colour for a recipe, so each keeps its tile across screens. */
export function recipeToneIndex(id: string): number {
  // FNV-1a: spreads short ids and uuids evenly across the tones.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % RecipeTones.light.length;
}

export function useRecipeTone(id: string) {
  return RecipeTones[useColorScheme()][recipeToneIndex(id)];
}

/**
 * A recipe or step photo. Without one (or before it reaches this device) a recipe
 * shows a soft colour tile with an icon for the kind of dish.
 */
export function RecipePhoto({
  path,
  style,
  recipe,
  iconSize = 32,
  label,
}: {
  path: string | undefined | null;
  style?: StyleProp<ViewStyle>;
  /** Picks the tile colour and icon when there's no photo. */
  recipe?: ArtRecipe;
  iconSize?: number;
  label?: string;
}) {
  const scheme = useColorScheme();
  const uri = usePhotoUri(path);
  const [failed, setFailed] = useState<string | null>(null);
  const show = uri && failed !== uri;
  const tone = recipe ? RecipeTones[scheme][recipeToneIndex(recipe.id)] : null;
  return (
    <View
      style={[styles.tile, { backgroundColor: tone?.bg ?? RecipeTones[scheme][4].bg }, style]}
      accessible={!!label}
      accessibilityLabel={label}>
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
      ) : recipe && tone ? (
        <Icon name={recipeIcon(recipe)} size={iconSize} color={tone.fg} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
});
