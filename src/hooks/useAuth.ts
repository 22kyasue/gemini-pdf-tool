import { useState, useEffect } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setSupabaseSession } from '../utils/llmParser';
import { setShareSession } from '../utils/shareImport';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAnonymous: boolean;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get the initial session — if none exists, sign in anonymously
    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (existing) {
        setSession(existing);
        setUser(existing.user);
        setSupabaseSession(existing);
        setShareSession(existing);
      } else {
        // Auto-create an anonymous session for "try before sign up"
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!error && data.session) {
          setSession(data.session);
          setUser(data.session.user);
          setSupabaseSession(data.session);
          setShareSession(data.session);
        }
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setSupabaseSession(session);
      setShareSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const appUrl = window.location.origin + import.meta.env.BASE_URL;

  const signInWithGoogleIdToken = async (idToken: string) => {
    // If there's an anonymous session, sign out first so the real user is created
    if (user?.is_anonymous) {
      await supabase.auth.signOut();
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: appUrl },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isAnonymous = user?.is_anonymous ?? false;

  return { user, session, loading, isAnonymous, signInWithGoogleIdToken, signInWithEmail, signUp, signOut };
}
