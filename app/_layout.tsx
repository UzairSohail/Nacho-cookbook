import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import Colors, { Fonts } from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/src/backend/auth';
import { startPhotoSync } from '@/src/photos/photoStore';
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

  // Photos taken offline upload once there's a connection.
  useEffect(() => startPhotoSync(), []);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <StoreProvider>
        <RootLayoutNav />
      </StoreProvider>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme();
  const auth = useAuth();
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.card, text: c.text, border: c.border },
  };

  if (!auth.ready) return null;
  // Demo mode (no backend configured) skips sign-in and runs on sample data.
  const signedIn = auth.demoMode || auth.account != null;
  const inHousehold = auth.demoMode || auth.household != null;
  // Opened from a password reset email: choose the new password before anything else.
  const resetting = !auth.demoMode && auth.resettingPassword;

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: Fonts.title }, headerTintColor: c.tint }}>
        <Stack.Protected guard={resetting}>
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!resetting && !signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!resetting && signedIn && !inHousehold}>
          <Stack.Screen name="household" options={{ title: 'Your household' }} />
        </Stack.Protected>
        <Stack.Protected guard={!resetting && signedIn && inHousehold}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
          <Stack.Screen name="edit-recipe" options={{ title: 'New recipe' }} />
          <Stack.Screen name="import-recipe" options={{ title: 'Import a recipe' }} />
          <Stack.Screen name="expo-sharing" options={{ title: 'Import a recipe' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
