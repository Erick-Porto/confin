import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

/**
 * Modo offline (Fase 7), só leitura:
 * - O cache do React Query fica salvo no IndexedDB do aparelho por até 7 dias; sem internet, as telas mostram
 *   o que foi carregado da última vez. Gravações sem internet falham na hora com "Sem conexão".
 * - Ao sair da conta, o cache e a lista de grupos guardada são apagados (aparelho compartilhado).
 */

export const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** Troque quando o formato dos dados em cache mudar, para descartar o cache antigo. */
export const OFFLINE_CACHE_BUSTER = 'fase7';

/** Consultas que não vale guardar (links assinados expiram em minutos). */
const NOT_PERSISTED = new Set(['attachment-thumbs']);

export const offlinePersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'confin.cache',
  throttleTime: 2000,
});

export function shouldPersistQuery(query: { queryKey: readonly unknown[]; state: { status: string } }): boolean {
  return query.state.status === 'success' && !NOT_PERSISTED.has(String(query.queryKey[0]));
}

const MEMBERSHIPS_PREFIX = 'confin.memberships.';

/** Guarda a lista de grupos da pessoa, para abrir o app sem internet. */
export function storeMemberships(userId: string, memberships: unknown): void {
  try {
    localStorage.setItem(MEMBERSHIPS_PREFIX + userId, JSON.stringify(memberships));
  } catch {
    // Sem espaço ou modo privado: segue sem a cópia.
  }
}

export function readMemberships<T>(userId: string): T | null {
  try {
    const raw = localStorage.getItem(MEMBERSHIPS_PREFIX + userId);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Apaga tudo o que o modo offline guardou neste aparelho. */
export async function clearOfflineData(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(MEMBERSHIPS_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Ignora: armazenamento indisponível.
  }
  await offlinePersister.removeClient();
}

/** true quando o navegador diz que há conexão. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Momento da última atualização bem-sucedida de qualquer dado em cache (ms), ou null. */
export function lastSyncedAt(queryClient: QueryClient): number | null {
  let last = 0;
  for (const q of queryClient.getQueryCache().getAll()) {
    if (q.state.dataUpdatedAt > last) last = q.state.dataUpdatedAt;
  }
  return last > 0 ? last : null;
}
