/**
 * Nacho Cookbook theme, "Sunday Kitchen": oat cream, espresso ink, paprika and sage.
 *
 * - `background` is the page, `card` a raised surface, `sunken` a pressed-in track
 *   (search boxes, segmented controls, steppers).
 * - `ink` / `onInk` is the dark surface used for the tab bar, selected segments and
 *   highlight cards. It flips to a light surface in dark mode.
 * - `tint` (paprika) is for the main action and links; `accent` (sage) for reassuring
 *   notes like "up to date" or pantry staples. Each has a soft background pair.
 */
const palette = {
  light: {
    text: '#241A12',
    textMuted: '#6E5F52',
    textFaint: '#8C7D70',
    background: '#F7F1E8',
    card: '#FFFCF7',
    sunken: '#EFE6D8',
    border: '#EDE3D5',
    borderStrong: '#D6C7B3',
    ink: '#241A12',
    onInk: '#F7F1E8',
    inkMuted: '#CDBFAF',
    inkSunken: '#3A2D22',
    tint: '#B4441C',
    onTint: '#FFFFFF',
    tintSoft: '#F6DCCD',
    onTintSoft: '#8E3415',
    accent: '#4F6B4A',
    accentSoft: '#DCE5CF',
    onAccentSoft: '#2F4529',
    tabIconDefault: '#CDBFAF',
    tabIconSelected: '#241A12',
  },
  dark: {
    text: '#F5EFE6',
    textMuted: '#B5A99D',
    textFaint: '#9A8D80',
    background: '#1A1512',
    card: '#26201B',
    sunken: '#322A23',
    border: '#3A312A',
    borderStrong: '#53473C',
    ink: '#F5EFE6',
    onInk: '#1A1512',
    inkMuted: '#5E5248',
    inkSunken: '#DDD3C6',
    tint: '#F08A5D',
    onTint: '#1A1512',
    tintSoft: '#4A2A1C',
    onTintSoft: '#F6C4AA',
    accent: '#9DBB8F',
    accentSoft: '#2C3A27',
    onAccentSoft: '#CFE0C4',
    tabIconDefault: '#5E5248',
    tabIconSelected: '#1A1512',
  },
};

export type ThemeColors = typeof palette.light;
export default palette;

/**
 * Soft tile colours for recipes without a photo. `bg` is the tile, `fg` its icon.
 * Picked per recipe so the grid has some variety.
 */
export const RecipeTones = {
  light: [
    { bg: '#F6E4B4', fg: '#87651C' }, // butter
    { bg: '#EBD2DE', fg: '#874062' }, // berry
    { bg: '#DCE5CF', fg: '#4F6B3E' }, // sage
    { bg: '#F3CDBE', fg: '#A23E1F' }, // tomato
    { bg: '#E2D1C2', fg: '#6B4630' }, // cocoa
  ],
  dark: [
    { bg: '#4A3D1E', fg: '#F2D58A' },
    { bg: '#45293A', fg: '#E8B7CD' },
    { bg: '#2F3D2A', fg: '#B9D2A8' },
    { bg: '#4A2B20', fg: '#F2B49B' },
    { bg: '#3D3027', fg: '#DCC2AA' },
  ],
};

export const Fonts = {
  title: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};
