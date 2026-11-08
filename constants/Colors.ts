/** Nacho Cookbook theme: cream, tomato and herb green. See the requirements doc. */
const palette = {
  light: {
    text: '#2B2118',
    textMuted: '#6F6259',
    background: '#FFF8F0',
    card: '#FFFFFF',
    border: '#EADFD3',
    tint: '#D9480F',
    onTint: '#FFFFFF',
    accent: '#2F7D4F',
    tabIconDefault: '#A8998C',
    tabIconSelected: '#D9480F',
  },
  dark: {
    text: '#F5EFE6',
    textMuted: '#B5A99D',
    background: '#1C1917',
    card: '#292524',
    border: '#3D3632',
    tint: '#FF8A4C',
    onTint: '#1C1917',
    accent: '#6CC18E',
    tabIconDefault: '#7A6E66',
    tabIconSelected: '#FF8A4C',
  },
};

export type ThemeColors = typeof palette.light;
export default palette;

export const Fonts = {
  title: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};
