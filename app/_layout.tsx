import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import Colors, { Fonts } from '@/constants/Colors';
import { StoreProvider } from '@/src/state/store';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { anchor: '(tabs)' };

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <StoreProvider>
      <RootLayoutNav />
    </StoreProvider>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.card, text: c.text, border: c.border },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: Fonts.title }, headerTintColor: c.tint }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
      </Stack>
    </ThemeProvider>
  );
}
