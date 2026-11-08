/**
 * Sign-in state and the household the signed-in person belongs to.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
}

interface AuthValue {
  /** False until the saved session (if any) has been loaded. */
  ready: boolean;
  /** True when no backend is configured: the app runs on local sample data. */
  demoMode: boolean;
  session: Session | null;
  household: Household | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  createHousehold: (name: string) => Promise<string | null>;
  joinHousehold: (code: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);

  const loadHousehold = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setHousehold(null);
      return;
    }
    const { data } = await supabase
      .from('household_members')
      .select('households (id, name, invite_code)')
      .eq('user_id', s.user.id)
      .limit(1)
      .maybeSingle();
    const h = (data?.households ?? null) as unknown as { id: string; name: string; invite_code: string } | null;
    setHousehold(h ? { id: h.id, name: h.name, inviteCode: h.invite_code } : null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadHousehold(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadHousehold(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadHousehold]);

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      demoMode: !supabase,
      session,
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
        await supabase?.auth.signOut();
      },
      async createHousehold(name) {
        if (!supabase) return 'Not connected.';
        const { error } = await supabase.rpc('create_household', { name: name.trim() || 'Our kitchen' });
        if (error) return friendlyError(error.message);
        await loadHousehold(session);
        return null;
      },
      async joinHousehold(code) {
        if (!supabase) return 'Not connected.';
        const { error } = await supabase.rpc('join_household', { code: code.trim().toLowerCase() });
        if (error) return friendlyError(error.message);
        await loadHousehold(session);
        return null;
      },
    }),
    [ready, session, household, loadHousehold],
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
  return message;
}
