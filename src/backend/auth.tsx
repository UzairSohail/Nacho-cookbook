/**
 * Sign-in state and the household the signed-in person belongs to.
 *
 * The account and household are remembered on the device, so the app opens
 * straight to your recipes with no connection. Sign-in tokens are refreshed
 * once the device is back online.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Platform } from 'react-native';

import { openedFromResetLink, supabase, WEB_APP_URL } from './supabase';
import { getDatabase } from './sync/database';

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
}

export interface Account {
  id: string;
  email: string | null;
}

interface Remembered {
  account: Account;
  household: Household | null;
}

const REMEMBERED_KEY = 'nacho-cookbook.account';

interface AuthValue {
  /** False until the saved session (if any) has been loaded. */
  ready: boolean;
  /** True when no backend is configured: the app runs on local sample data. */
  demoMode: boolean;
  /** The signed-in person, also while offline. */
  account: Account | null;
  household: Household | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Emails a link for choosing a new password. */
  sendPasswordReset: (email: string) => Promise<string | null>;
  /** True after opening a password reset link, until a new password is saved. */
  resettingPassword: boolean;
  updatePassword: (password: string) => Promise<string | null>;
  cancelPasswordReset: () => void;
  createHousehold: (name: string) => Promise<string | null>;
  joinHousehold: (code: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function readRemembered(): Promise<Remembered | null> {
  try {
    const raw = await AsyncStorage.getItem(REMEMBERED_KEY);
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

async function remember(value: Remembered | null) {
  try {
    if (value) await AsyncStorage.setItem(REMEMBERED_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(REMEMBERED_KEY);
  } catch {
    // Not fatal: the app just needs a connection next time it starts.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [account, setAccount] = useState<Account | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [resettingPassword, setResettingPassword] = useState(openedFromResetLink);

  /** Looks up the household online, falling back to the one remembered on this device. */
  const loadHousehold = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setHousehold(null);
      return;
    }
    const me: Account = { id: s.user.id, email: s.user.email ?? null };
    setAccount(me);
    const { data, error } = await supabase
      .from('household_members')
      .select('households (id, name, invite_code)')
      .eq('user_id', s.user.id)
      .limit(1)
      .maybeSingle();
    if (error) {
      const saved = await readRemembered();
      setHousehold(saved?.account.id === me.id ? saved.household : null);
      return;
    }
    const h = (data?.households ?? null) as unknown as { id: string; name: string; invite_code: string } | null;
    const found = h ? { id: h.id, name: h.name, inviteCode: h.invite_code } : null;
    setHousehold(found);
    await remember({ account: me, household: found });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    (async () => {
      // Open straight away as the person remembered on this device. Checking the
      // session can take half a minute offline while Supabase retries.
      const saved = await readRemembered();
      if (saved) {
        setAccount(saved.account);
        setHousehold(saved.household);
        setReady(true);
      }
      const { data, error } = await client.auth.getSession();
      if (data.session) {
        await loadHousehold(data.session);
      } else if (!(error && isAuthRetryableFetchError(error))) {
        // Really signed out (not just offline).
        setAccount(null);
        setHousehold(null);
        if (saved) {
          await remember(null);
          await getDatabase()?.disconnectAndClear().catch(() => {});
        }
      }
      setReady(true);
    })();
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setResettingPassword(true);
      if (event === 'SIGNED_OUT') {
        setAccount(null);
        setHousehold(null);
      } else if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED')) {
        // Supabase advises not awaiting other Supabase calls inside this callback.
        setTimeout(() => loadHousehold(s), 0);
      } else if (s) {
        setAccount({ id: s.user.id, email: s.user.email ?? null });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadHousehold]);

  const refresh = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    await loadHousehold(data.session);
  }, [loadHousehold]);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      demoMode: !supabase,
      account,
      household,
      async signIn(email, password) {
        if (!supabase) return 'Sign-in is not set up yet.';
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? friendlyError(error.message) : null;
      },
      async signUp(email, password) {
        if (!supabase) return { error: 'Sign-in is not set up yet.', needsConfirmation: false };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        return { error: error ? friendlyError(error.message) : null, needsConfirmation: !error && !data.session };
      },
      async signOut() {
        // Remove the household's data from this device too.
        await getDatabase()?.disconnectAndClear().catch(() => {});
        await remember(null);
        await supabase?.auth.signOut({ scope: 'local' });
        setAccount(null);
        setHousehold(null);
      },
      async sendPasswordReset(email) {
        if (!supabase) return 'Sign-in is not set up yet.';
        if (!email.trim()) return 'Type your email above first.';
        // The web app is where a new password is chosen, also when asked from the Android app.
        const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : WEB_APP_URL;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        return error ? friendlyError(error.message) : null;
      },
      resettingPassword,
      async updatePassword(password) {
        if (!supabase) return 'Sign-in is not set up yet.';
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return friendlyError(error.message);
        setResettingPassword(false);
        return null;
      },
      cancelPasswordReset() {
        setResettingPassword(false);
      },
      async createHousehold(name) {
        if (!supabase) return 'Not connected.';
        const { error } = await supabase.rpc('create_household', { name: name.trim() || 'Our kitchen' });
        if (error) return friendlyError(error.message);
        await refresh();
        return null;
      },
      async joinHousehold(code) {
        if (!supabase) return 'Not connected.';
        const { error } = await supabase.rpc('join_household', { code: code.trim().toLowerCase() });
        if (error) return friendlyError(error.message);
        await refresh();
        return null;
      },
    }),
    [ready, account, household, refresh, resettingPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function friendlyError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first. Check your inbox for the link.';
  if (/invite code not found/i.test(message)) return 'That invite code wasn’t found. Check it and try again.';
  if (/password should be at least/i.test(message)) return 'Use a password of at least 6 characters.';
  if (/auth session missing|token has expired|otp_expired|invalid.*(link|token)/i.test(message))
    return 'This reset link has expired or was already used. Go back and ask for a new one.';
  if (/rate limit/i.test(message)) return 'Too many emails sent for now. Wait a few minutes and try again.';
  if (/should be different from the old password/i.test(message)) return 'Choose a password you haven’t used before.';
  if (/failed to fetch|network request failed/i.test(message)) return 'You’re offline. Connect to the internet and try again.';
  return message;
}
