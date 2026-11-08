import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text as DefaultText,
  TextInput as DefaultTextInput,
  View as DefaultView,
  type PressableProps,
  type TextProps as RNTextProps,
  type ViewProps,
  type TextInputProps,
} from 'react-native';

import Colors, { Fonts, type ThemeColors } from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

export function useTheme(): ThemeColors {
  return Colors[useColorScheme()];
}

type TextProps = RNTextProps & { variant?: 'title' | 'heading' | 'body' | 'muted' | 'label' };

export function Text({ style, variant = 'body', ...rest }: TextProps) {
  const c = useTheme();
  const variantStyle = {
    title: { fontFamily: Fonts.title, fontSize: 28, color: c.text },
    heading: { fontFamily: Fonts.title, fontSize: 20, color: c.text },
    body: { fontFamily: Fonts.body, fontSize: 16, color: c.text },
    muted: { fontFamily: Fonts.body, fontSize: 14, color: c.textMuted },
    label: { fontFamily: Fonts.bodyBold, fontSize: 13, color: c.textMuted, letterSpacing: 0.5 },
  }[variant];
  return <DefaultText style={[variantStyle, style]} {...rest} />;
}

export function View({ style, ...rest }: ViewProps) {
  return <DefaultView style={[{ backgroundColor: useTheme().background }, style]} {...rest} />;
}

export function Card({ style, ...rest }: ViewProps) {
  const c = useTheme();
  return (
    <DefaultView
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}
      {...rest}
    />
  );
}

type ButtonProps = PressableProps & { title: string; kind?: 'primary' | 'secondary' };

export function Button({ title, kind = 'primary', style, ...rest }: ButtonProps) {
  const c = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      style={(state) => [
        styles.button,
        {
          backgroundColor: primary ? c.tint : 'transparent',
          borderColor: c.tint,
          opacity: state.pressed ? 0.7 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <DefaultText style={{ fontFamily: Fonts.bodyBold, fontSize: 15, color: primary ? c.onTint : c.tint }}>
        {title}
      </DefaultText>
    </Pressable>
  );
}

export function TextInput({ style, onFocus, onBlur, ...rest }: TextInputProps) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <DefaultTextInput
      placeholderTextColor={c.textMuted}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        { color: c.text, borderColor: focused ? c.tint : c.border, backgroundColor: c.card },
        // The browser's own black focus ring clashes with the theme; the border shows focus instead.
        Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        style,
      ]}
      {...rest}
    />
  );
}

/**
 * A pill-shaped choice or toggle. One look everywhere: filled when selected.
 * `tone="accent"` (green) is for on/off toggles; the default tint is for picking one of several.
 */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'tint',
  small,
  role = 'button',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  tone?: 'tint' | 'accent';
  small?: boolean;
  role?: 'button' | 'radio' | 'switch';
}) {
  const c = useTheme();
  const color = tone === 'accent' ? c.accent : c.tint;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { selected } : role === 'radio' ? { selected, checked: selected } : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        {
          borderColor: selected ? color : tone === 'accent' ? c.border : color,
          backgroundColor: selected ? color : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <DefaultText
        style={{
          color: selected ? c.onTint : tone === 'accent' ? c.text : color,
          fontFamily: Fonts.bodyMedium,
          fontSize: small ? 13 : 14,
        }}>
        {label}
      </DefaultText>
    </Pressable>
  );
}

/** A minus / value / plus control, e.g. for servings. */
export function Stepper({
  value,
  onChange,
  min = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
}) {
  const c = useTheme();
  const btn = (text: string, next: number, a11y: string) => (
    <Pressable
      accessibilityLabel={a11y}
      onPress={() => onChange(Math.max(min, next))}
      style={({ pressed }) => [styles.stepBtn, { borderColor: c.tint, opacity: pressed ? 0.6 : 1 }]}>
      <DefaultText style={{ color: c.tint, fontSize: 22, fontFamily: Fonts.bodyBold }}>{text}</DefaultText>
    </Pressable>
  );
  return (
    <DefaultView style={styles.stepper}>
      {btn('−', value - 1, `Fewer ${label ?? ''}`)}
      <Text style={styles.stepValue}>
        {value} {label}
      </Text>
      {btn('+', value + 1, `More ${label ?? ''}`)}
    </DefaultView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSmall: { minHeight: 32, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  stepValue: { minWidth: 96, textAlign: 'center', fontFamily: Fonts.bodyMedium },
});
