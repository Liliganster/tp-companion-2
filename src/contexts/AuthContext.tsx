import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { setSentryUser } from "@/lib/sentryClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, fullName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = session?.user?.id ? String(session.user.id) : null;
    setSentryUser(id ? { id } : null);
  }, [session?.user?.id]);

  useEffect(() => {
    let mounted = true;
    if (!supabase) {
      if (mounted) setLoading(false);
      return () => {
        mounted = false;
      };
    }
    const client = supabase;

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(async (email: string, password: string, fullName?: string) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error("[AuthContext] Sign up error:", error);
      throw error;
    }
    console.log("[AuthContext] Sign up successful. Data:", data);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await requireSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      requestPasswordReset,
      signOut,
      getAccessToken,
    }),
    [session, loading, signInWithPassword, signUpWithPassword, signInWithGoogle, requestPasswordReset, signOut, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
