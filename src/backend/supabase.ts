/**
 * Supabase client. The URL and anon key come from EXPO_PUBLIC_ environment
 * variables (see .env.example); both are public by design and protected by the
 * row level security rules in supabase/schema.sql.
 *
 * Without them the app runs in local demo mode on sample data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/** Where password reset emails send people to choose a new password. */
export const WEB_APP_URL = 'https://nachocookbook.netlify.app';

/**
 * True when the web app was opened from a password reset email. Read before the
 * client is created, since the client takes the sign-in details out of the
 * address (and announces the reset before the app is listening).
 */
export const openedFromResetLink =
  Platform.OS === 'web' && typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash);

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

export const isBackendConfigured = supabase != null;

// Only refresh the session while the app is in the foreground (Supabase's advice for React Native).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
