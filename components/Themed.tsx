import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text as DefaultText,
  TextInput as DefaultTextInput,
  View as DefaultView,
  type ColorValue,
  type PressableProps,
  type StyleProp,
  type TextProps as RNTextProps,
  type ViewProps,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors, { Fonts, RecipeTones, type ThemeColors } from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

export function useTheme(): ThemeColors {
  return Colors[useColorScheme()];
}

type TextProps = RNTextProps & {
  variant?: 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'muted' | 'label';
};

export function Text({ style, variant = 'body', ...rest }: TextProps) {
  const c = useTheme();
  const variantStyle = {
    display: { fontFamily: Fonts.title, fontSize: 34, lineHeight: 38, color: c.text, letterSpacing: -0.3 },
    title: { fontFamily: Fonts.title, fontSize: 30, lineHeight: 34, color: c.text, letterSpacing: -0.2 },
    heading: { fontFamily: Fonts.title, fontSize: 22, lineHeight: 28, color: c.text },
    subheading: { fontFamily: Fonts.title, fontSize: 17, lineHeight: 22, color: c.text },
    body: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 22, color: c.text },
    muted: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20, color: c.textMuted },
    label: { fontFamily: Fonts.bodyBold, fontSize: 12, lineHeight: 16, color: c.textMuted, letterSpacing: 0.6 },
  }[variant];
  return <DefaultText style={[variantStyle, style]} {...rest} />;
}

export function View({ style, ...rest }: ViewProps) {
  return <DefaultView style={[{ backgroundColor: useTheme().background }, style]} {...rest} />;
}

/** A raised surface. `tone="ink"` is the dark highlight card, `"accent"` the soft sage note. */
export function Card({ style, tone = 'plain', ...rest }: ViewProps & { tone?: 'plain' | 'ink' | 'accent' | 'sunken' }) {
  const c = useTheme();
  const look =
    tone === 'ink'
      ? { backgroundColor: c.ink, borderColor: c.ink }
      : tone === 'accent'
        ? { backgroundColor: c.accentSoft, borderColor: c.accentSoft }
        : tone === 'sunken'
          ? { backgroundColor: c.sunken, borderColor: c.sunken }
          : { backgroundColor: c.card, borderColor: c.border };
  return <DefaultView style={[styles.card, look, style]} {...rest} />;
}

// ---- Icons ----

/** Material names for Android and web, SF Symbols for iOS. */
const ICONS = {
  recipes: { ios: 'book', android: 'menu_book' },
  planner: { ios: 'calendar', android: 'calendar_month' },
  shopping: { ios: 'basket', android: 'shopping_basket' },
  settings: { ios: 'slider.horizontal.3', android: 'tune' },
  search: { ios: 'magnifyingglass', android: 'search' },
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'minus', android: 'remove' },
  link: { ios: 'link', android: 'link' },
  back: { ios: 'chevron.left', android: 'chevron_left' },
  forward: { ios: 'chevron.right', android: 'chevron_right' },
  close: { ios: 'xmark', android: 'close' },
  edit: { ios: 'pencil', android: 'edit' },
  check: { ios: 'checkmark', android: 'check' },
  share: { ios: 'square.and.arrow.up', android: 'ios_share' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  price: { ios: 'tag', android: 'sell' },
  camera: { ios: 'camera', android: 'photo_camera' },
  image: { ios: 'photo', android: 'image' },
  paste: { ios: 'doc.on.clipboard', android: 'content_paste' },
  delete: { ios: 'trash', android: 'delete' },
  up: { ios: 'arrow.up', android: 'arrow_upward' },
  down: { ios: 'arrow.down', android: 'arrow_downward' },
  people: { ios: 'person.2', android: 'group' },
  home: { ios: 'house', android: 'home' },
  pantry: { ios: 'cabinet', android: 'kitchen' },
  measure: { ios: 'ruler', android: 'straighten' },
  update: { ios: 'arrow.down.circle', android: 'system_update' },
  show: { ios: 'eye', android: 'visibility' },
  hide: { ios: 'eye.slash', android: 'visibility_off' },
  breakfast: { ios: 'sun.horizon', android: 'breakfast_dining' },
  dinner: { ios: 'fork.knife', android: 'dinner_dining' },
  dessert: { ios: 'birthday.cake', android: 'cake' },
  soup: { ios: 'cup.and.saucer', android: 'ramen_dining' },
  lunch: { ios: 'takeoutbag.and.cup.and.straw', android: 'lunch_dining' },
  drink: { ios: 'mug', android: 'local_cafe' },
  bowl: { ios: 'leaf', android: 'rice_bowl' },
  bakery: { ios: 'birthday.cake', android: 'bakery_dining' },
  meal: { ios: 'fork.knife', android: 'restaurant' },
} as const satisfies Record<string, { ios: string; android: string }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const c = useTheme();
  const n = ICONS[name];
  return (
    <SymbolView
      name={{ ios: n.ios, android: n.android, web: n.android } as SymbolViewProps['name']}
      tintColor={color ?? c.text}
      size={size}
    />
  );
}

/** A round icon-only button. Always give it an accessibility label. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tone = 'plain',
  size = 44,
  iconSize = 20,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'card' | 'sunken' | 'tint' | 'ink' | 'clear';
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const look = {
    plain: { bg: c.card, fg: c.text, border: c.border },
    card: { bg: c.card, fg: c.text, border: c.card },
    sunken: { bg: c.sunken, fg: c.text, border: c.sunken },
    tint: { bg: c.tint, fg: c.onTint, border: c.tint },
    ink: { bg: c.ink, fg: c.onInk, border: c.ink },
    clear: { bg: 'transparent', fg: c.textMuted, border: 'transparent' },
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: look.bg,
          borderColor: look.border,
          opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        },
        style,
      ]}>
      <Icon name={icon} size={iconSize} color={look.fg} />
    </Pressable>
  );
}

// ---- Buttons ----

type ButtonProps = PressableProps & {
  title: string;
  /** primary: paprika. secondary: outlined. ink: dark. quiet: text only. */
  kind?: 'primary' | 'secondary' | 'ink' | 'quiet';
  icon?: IconName;
  small?: boolean;
};

export function Button({ title, kind = 'primary', icon, small, style, disabled, ...rest }: ButtonProps) {
  const c = useTheme();
  const look = {
    primary: { bg: c.tint, fg: c.onTint, border: c.tint },
    secondary: { bg: 'transparent', fg: c.text, border: c.borderStrong },
    ink: { bg: c.ink, fg: c.onInk, border: c.ink },
    quiet: { bg: 'transparent', fg: c.tint, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          opacity: disabled ? 0.45 : state.pressed ? 0.75 : 1,
        },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={look.fg} /> : null}
      <DefaultText style={{ fontFamily: Fonts.bodyBold, fontSize: small ? 14 : 15, color: look.fg }}>{title}</DefaultText>
    </Pressable>
  );
}

export function TextInput({ style, onFocus, onBlur, tone = 'card', ...rest }: TextInputProps & { tone?: 'card' | 'sunken' }) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <DefaultTextInput
      placeholderTextColor={c.textFaint}
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
        {
          color: c.text,
          borderColor: focused ? c.tint : tone === 'sunken' ? c.sunken : c.border,
          backgroundColor: tone === 'sunken' ? c.sunken : c.card,
        },
        // The browser's own black focus ring clashes with the theme; the border shows focus instead.
        Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        style,
      ]}
      {...rest}
    />
  );
}

/** A search box with a magnifying glass. */
export function SearchField({ style, ...rest }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <DefaultView style={[styles.search, { backgroundColor: c.card, borderColor: c.border }, style]}>
      <Icon name="search" size={20} color={c.textMuted} />
      <DefaultTextInput
        placeholderTextColor={c.textFaint}
        style={[
          { flex: 1, minWidth: 0, color: c.text, fontFamily: Fonts.body, fontSize: 15, paddingVertical: 12 },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
        {...rest}
      />
    </DefaultView>
  );
}

/**
 * A pill-shaped choice or toggle: filled dark when selected.
 * `tone="accent"` (sage) is for on/off toggles.
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
  const on = tone === 'accent' ? { bg: c.accentSoft, fg: c.onAccentSoft, border: c.accentSoft } : { bg: c.ink, fg: c.onInk, border: c.ink };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'button' ? { selected } : role === 'radio' ? { selected, checked: selected } : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        {
          borderColor: selected ? on.border : c.border,
          backgroundColor: selected ? on.bg : c.card,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {selected && tone === 'accent' ? <Icon name="check" size={small ? 14 : 16} color={on.fg} /> : null}
      <DefaultText
        style={{
          color: selected ? on.fg : c.text,
          fontFamily: selected ? Fonts.bodyBold : Fonts.bodyMedium,
          fontSize: small ? 13 : 14,
        }}>
        {label}
      </DefaultText>
    </Pressable>
  );
}

/** A small read-only label, e.g. a tag on a recipe card. */
export function Tag({ label, tone = 'card' }: { label: string; tone?: 'card' | 'accent' | 'tint' }) {
  const c = useTheme();
  const look = {
    card: { bg: c.card, fg: c.text },
    accent: { bg: c.accentSoft, fg: c.onAccentSoft },
    tint: { bg: c.tintSoft, fg: c.onTintSoft },
  }[tone];
  return (
    <DefaultView style={[styles.tag, { backgroundColor: look.bg }]}>
      <DefaultText style={{ color: look.fg, fontFamily: Fonts.bodyBold, fontSize: 12 }}>{label}</DefaultText>
    </DefaultView>
  );
}

/**
 * One choice from a few, as a sliding-pill track (Week / Fortnight, Metric / Imperial).
 * On a dark card pass `onInk`.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  onInk,
  role = 'radio',
  accessibilityLabel,
  style,
}: {
  options: ReadonlyArray<readonly [T, string] | readonly [T, string, IconName]>;
  value: T;
  onChange: (v: T) => void;
  onInk?: boolean;
  role?: 'radio' | 'tab';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const track = onInk ? c.inkSunken : c.sunken;
  const activeBg = onInk ? c.onInk : c.ink;
  const activeFg = onInk ? c.ink : c.onInk;
  const idleFg = onInk ? c.inkMuted : c.textMuted;
  return (
    <DefaultView
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: track }, style]}>
      {options.map(([key, label, icon]) => {
        const on = key === value;
        return (
          <Pressable
            key={key}
            accessibilityRole={role}
            accessibilityState={{ selected: on, checked: role === 'radio' ? on : undefined }}
            onPress={() => onChange(key)}
            style={[styles.segment, on && { backgroundColor: activeBg }]}>
            {icon ? <Icon name={icon} size={16} color={on ? activeFg : idleFg} /> : null}
            <DefaultText numberOfLines={1} style={{ color: on ? activeFg : idleFg, fontFamily: Fonts.bodyBold, fontSize: 14 }}>
              {label}
            </DefaultText>
          </Pressable>
        );
      })}
    </DefaultView>
  );
}

/** A minus / value / plus control, e.g. for servings. `onInk` for use on a dark card. */
export function Stepper({
  value,
  onChange,
  min = 1,
  label,
  onInk,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
  onInk?: boolean;
  /** Just the number between the buttons, with the label read out only. */
  compact?: boolean;
}) {
  const c = useTheme();
  const track = onInk ? c.inkSunken : c.sunken;
  const fg = onInk ? c.onInk : c.text;
  const btn = (icon: IconName, next: number, a11y: string, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(Math.max(min, next))}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: onInk ? 'transparent' : c.card, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={18} color={fg} />
    </Pressable>
  );
  return (
    <DefaultView style={[styles.stepper, { backgroundColor: track }]}>
      {btn('remove', value - 1, `Fewer ${label ?? ''}`.trim(), value <= min)}
      <DefaultText
        accessibilityLabel={`${value} ${label ?? ''}`}
        style={[styles.stepValue, { color: fg, minWidth: compact ? 28 : 88 }]}>
        {compact ? value : `${value} ${label ?? ''}`.trim()}
      </DefaultText>
      {btn('add', value + 1, `More ${label ?? ''}`.trim(), false)}
    </DefaultView>
  );
}

/** A round tick box: sage when ticked. */
export function Check({ checked, size = 26 }: { checked: boolean; size?: number }) {
  const c = useTheme();
  return (
    <DefaultView
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: checked ? 0 : 2,
        borderColor: c.borderStrong,
        backgroundColor: checked ? c.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked ? <Icon name="check" size={size * 0.62} color={c.card} /> : null}
    </DefaultView>
  );
}

/** The big title at the top of a tab: a small line above, the title, and actions on the right. */
export function ScreenHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <DefaultView style={[styles.header, { paddingTop: insets.top + 20 }]}>
      <DefaultView style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text variant="muted" style={{ fontSize: 13, fontFamily: Fonts.bodyMedium }}>{eyebrow}</Text> : null}
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
      </DefaultView>
      {right ? <DefaultView style={styles.headerRight}>{right}</DefaultView> : null}
    </DefaultView>
  );
}

/** A settings-style section: an icon tile, a title and a line under it. */
export function SectionTitle({
  icon,
  title,
  hint,
  tone = 0,
  header = true,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  tone?: 0 | 1 | 2 | 3 | 4;
  /** Off when the title sits inside a button. */
  header?: boolean;
}) {
  const c = useTheme();
  const scheme = useColorScheme();
  const tile = RecipeTones[scheme][tone];
  return (
    <DefaultView style={styles.sectionTitle}>
      <DefaultView style={[styles.sectionIcon, { backgroundColor: tile.bg }]}>
        <Icon name={icon} size={20} color={tile.fg} />
      </DefaultView>
      <DefaultView style={{ flex: 1, gap: 1 }}>
        <DefaultText style={{ fontFamily: Fonts.bodyBold, fontSize: 16, color: c.text }} accessibilityRole={header ? 'header' : undefined}>
          {title}
        </DefaultText>
        {hint ? <Text variant="muted" style={{ fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
      </DefaultView>
    </DefaultView>
  );
}
/** Room at the bottom of a tab's scroll so the floating tab bar doesn't cover the last item. */
export const TAB_BAR_SPACE = 112;

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 16 },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, fontFamily: Fonts.body },
  search: { minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 24, padding: 2, alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stepValue: { textAlign: 'center', fontFamily: Fonts.bodyBold, fontSize: 16, paddingHorizontal: 6 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chipSmall: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  tag: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  segmented: { flexDirection: 'row', borderRadius: 24, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
