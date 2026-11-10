import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clearOfflineData } from '@/lib/offline';
import type { Session, User } from '@supabase/supabase-js';
import { appUrl, storedSession, supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true enquanto a sessão inicial é carregada. */
  loading: boolean;
  /** true depois que o usuário abriu o link de recuperação de senha. */
  recoveryMode: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Retorna needsConfirmation = true quando o Supabase exige confirmar o e-mail. */
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  updateProfile(fullName: string): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const user = session?.user ?? null;

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  // O navigate do HashRouter muda a cada rota; guardamos numa ref para assinar a sessão uma vez só.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      // Sem internet, o login expirado não renova; usa a sessão guardada para mostrar os dados salvos.
      // Quando a conexão volta, o supabase-js renova ou encerra a sessão (onAuthStateChange).
      setSession(data.session ?? (navigator.onLine ? null : storedSession()));
      setLoading(false);
      // Links de e-mail voltam com ?code=... (PKCE) e, na redefinição de senha, ?reset=1.
      const url = new URL(window.location.href);
      const isReset = url.searchParams.has('reset');
      if (isReset || url.searchParams.has('code')) {
        url.searchParams.delete('reset');
        url.searchParams.delete('code');
        window.history.replaceState(window.history.state, '', url.toString());
      }
      if (data.session && isReset) {
        setRecoveryMode(true);
        navigateRef.current('/redefinir-senha', { replace: true });
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        navigateRef.current('/redefinir-senha', { replace: true });
      }
      if (event === 'SIGNED_OUT') {
        // Aparelho compartilhado: nada do usuário anterior fica salvo.
        void clearOfflineData(queryClientRef.current);
        setProfile(null);
        setRecoveryMode(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user?.id) void loadProfile(user.id);
    else setProfile(null);
  }, [user?.id, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: appUrl() },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await clearOfflineData(queryClient);
    navigate('/entrar', { replace: true });
  }, [navigate, queryClient]);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appUrl()}?reset=1`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  const updateProfile = useCallback(
    async (fullName: string) => {
      if (!user) return;
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', user.id);
      if (error) throw error;
      await loadProfile(user.id);
    },
    [user, loadProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id);
  }, [user?.id, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      recoveryMode,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      updateProfile,
      refreshProfile,
    }),
    [session, user, profile, loading, recoveryMode, signIn, signUp, signOut, sendPasswordReset, updatePassword, updateProfile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
