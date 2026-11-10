import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { readMemberships, storeMemberships } from '@/lib/offline';
import type { Group, MemberRole, Membership } from '@/types';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'confin.groupId';

interface GroupContextValue {
  /** Grupos de que o usuário participa. */
  memberships: Membership[];
  /** true enquanto a lista de grupos carrega. */
  loading: boolean;
  currentGroup: Group | null;
  role: MemberRole | null;
  isOwner: boolean;
  /** Troca o grupo ativo (persistido no aparelho). */
  setCurrentGroupId(id: string): void;
  /** Recarrega a lista de grupos (depois de criar, entrar, sair ou renomear). */
  refresh(): Promise<Membership[]>;
}

const GroupContext = createContext<GroupContextValue | null>(null);

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // armazenamento indisponível (aba privada): segue sem lembrar o grupo
  }
}

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  // Para qual usuário a lista atual foi carregada. Evita um instante de "sem grupos" logo após o login.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(readStoredId);
  const userId = user?.id ?? null;
  const loading = userId !== null && loadedFor !== userId;

  const refresh = useCallback(async (): Promise<Membership[]> => {
    if (!userId) {
      setMemberships([]);
      setLoadedFor(null);
      return [];
    }
    const { data, error } = await supabase
      .from('group_members')
      .select('role, group:groups(*)')
      .eq('user_id', userId);
    if (error) console.error(error);
    // Sem internet, usa a última lista guardada em vez de achar que a pessoa não tem grupos.
    const source = error ? (readMemberships<Membership[]>(userId) ?? []) : ((data ?? []) as unknown as Membership[]);
    const list = source
      .filter((m) => m.group)
      .sort((a, b) => a.group.name.localeCompare(b.group.name, 'pt-BR'));
    if (!error) storeMemberships(userId, list);
    setMemberships(list);
    setLoadedFor(userId);
    return list;
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Garante que o grupo ativo é um dos grupos do usuário.
  const current = useMemo(() => {
    if (memberships.length === 0) return null;
    return memberships.find((m) => m.group.id === currentId) ?? memberships[0];
  }, [memberships, currentId]);

  useEffect(() => {
    if (current && current.group.id !== currentId) {
      setCurrentId(current.group.id);
      storeId(current.group.id);
    }
  }, [current, currentId]);

  const setCurrentGroupId = useCallback((id: string) => {
    setCurrentId(id);
    storeId(id);
  }, []);

  const value = useMemo<GroupContextValue>(
    () => ({
      memberships,
      loading,
      currentGroup: current?.group ?? null,
      role: current?.role ?? null,
      isOwner: current?.role === 'owner',
      setCurrentGroupId,
      refresh,
    }),
    [memberships, loading, current, setCurrentGroupId, refresh],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup precisa estar dentro de <GroupProvider>');
  return ctx;
}

/** Id do grupo ativo. Use só em telas protegidas (dentro do AppLayout), onde sempre há grupo. */
export function useGroupId(): string {
  const { currentGroup } = useGroup();
  if (!currentGroup) throw new Error('Nenhum grupo ativo');
  return currentGroup.id;
}
