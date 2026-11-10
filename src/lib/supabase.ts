import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  console.error('Confin: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja .env.example).');
}

// PKCE: os links de e-mail voltam com ?code=... na URL, o que não briga com o HashRouter.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Sessão que o supabase-js guardou neste aparelho (mesma chave padrão dele), ou null. */
export function storedSession(): Session | null {
  try {
    const ref = new URL(url ?? 'http://localhost').hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed?.user ? parsed : null;
  } catch {
    return null;
  }
}

/** URL pública do app (raiz, sem hash), usada nos links de e-mail e de convite. */
export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

/** Link de convite para um código. */
export function inviteUrl(code: string): string {
  return `${appUrl()}#/convite/${encodeURIComponent(code)}`;
}
