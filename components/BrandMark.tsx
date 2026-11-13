import { StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme, type IconName } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { RecipeTones } from '@/constants/Colors';

/** A little fan of recipe tiles over the app's name, for the sign-in screens. */
const FAN: Array<{ icon: IconName; tone: number; lift: number; turn: string }> = [
  { icon: 'breakfast', tone: 0, lift: 0, turn: '-8deg' },
  { icon: 'bowl', tone: 1, lift: -6, turn: '4deg' },
  { icon: 'soup', tone: -1, lift: -12, turn: '0deg' },
  { icon: 'dinner', tone: 3, lift: -6, turn: '-4deg' },
  { icon: 'dessert', tone: 2, lift: 0, turn: '8deg' },
];

export function BrandMark({ tagline }: { tagline?: string }) {
  const c = useTheme();
  const tones = RecipeTones[useColorScheme()];
  return (
    <View style={styles.wrap}>
      <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {FAN.map(({ icon, tone, lift, turn }) => {
          const centre = tone < 0;
          const t = centre ? { bg: c.tint, fg: c.onTint } : tones[tone];
          const size = centre ? 56 : 44;
          return (
            <View
              key={icon}
              style={[
                styles.tile,
                {
                  width: size,
                  height: size,
                  borderRadius: centre ? 18 : 14,
                  backgroundColor: t.bg,
                  transform: [{ translateY: lift }, { rotate: turn }],
                },
              ]}>
              <Icon name={icon} size={centre ? 28 : 22} color={t.fg} />
            </View>
          );
        })}
      </View>
      <Text variant="display" style={styles.name} accessibilityRole="header">
        Nacho Cookbook
      </Text>
      {tagline ? (
        <Text variant="muted" style={styles.tagline}>
          {tagline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  fan: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 64 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 40, lineHeight: 44, textAlign: 'center', marginTop: 4 },
  tagline: { textAlign: 'center', fontSize: 15, lineHeight: 22, maxWidth: 300 },
});
