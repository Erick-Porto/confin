import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { sortAccounts } from '@/lib/accounts';
import { useGroup } from '@/context/GroupContext';
import type {
  Account,
  AccountWithBalance,
  Category,
  Invite,
  Member,
  PlanBlock,
  Recurrence,
  Transaction,
  TransactionFilters,
} from '@/types';

/**
 * Chaves do React Query. Todas começam pelo nome do recurso e o id do grupo, então
 * invalidar ['transactions'] atualiza qualquer lista de lançamentos de qualquer grupo.
 */
export const qk = {
  accounts: (groupId: string) => ['accounts', groupId] as const,
  categories: (groupId: string) => ['categories', groupId] as const,
  members: (groupId: string) => ['members', groupId] as const,
  invites: (groupId: string) => ['invites', groupId] as const,
  transactions: (groupId: string, filters: TransactionFilters) => ['transactions', groupId, filters] as const,
  recurrences: (groupId: string) => ['recurrences', groupId] as const,
  planBlocks: (groupId: string) => ['plan-blocks', groupId] as const,
};

function useCurrentGroupId(): string | null {
  return useGroup().currentGroup?.id ?? null;
}

/** Contas do grupo (inclusive arquivadas) com saldo atual, já ordenadas. */
export function useAccounts() {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.accounts(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<AccountWithBalance[]> => {
      const [accountsRes, balancesRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('group_id', groupId!),
        supabase.from('account_balances').select('account_id, balance_cents').eq('group_id', groupId!),
      ]);
      if (accountsRes.error) throw accountsRes.error;
      if (balancesRes.error) throw balancesRes.error;
      const balances = new Map(
        (balancesRes.data as Array<{ account_id: string; balance_cents: number }>).map((b) => [
          b.account_id,
          Number(b.balance_cents),
        ]),
      );
      const accounts = (accountsRes.data as Account[]).map((a) => ({
        ...a,
        initial_balance_cents: Number(a.initial_balance_cents),
        balance_cents: balances.get(a.id) ?? Number(a.initial_balance_cents),
      }));
      return sortAccounts(accounts);
    },
  });
}

/** Categorias do grupo (inclusive arquivadas). */
export function useCategories() {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.categories(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('group_id', groupId!)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as Category[];
    },
  });
}

/** Blocos do plano financeiro do grupo, na ordem de exibição. Lista vazia = grupo sem plano. */
export function usePlanBlocks() {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.planBlocks(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<PlanBlock[]> => {
      const { data, error } = await supabase
        .from('plan_blocks')
        .select('id, group_id, name, kind, percent, color, sort_order')
        .eq('group_id', groupId!)
        .order('sort_order');
      if (error) throw error;
      return data as PlanBlock[];
    },
  });
}

/** Membros do grupo com perfil (nome). */
export function useMembers() {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.members(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<Member[]> => {
      const { data: rows, error } = await supabase
        .from('group_members')
        .select('group_id, user_id, role, joined_at')
        .eq('group_id', groupId!)
        .order('joined_at');
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id as string);
      const { data: profiles, error: pErr } = ids.length
        ? await supabase.from('profiles').select('*').in('id', ids)
        : { data: [], error: null };
      if (pErr) throw pErr;
      return (rows ?? []).map((r) => ({
        ...(r as Omit<Member, 'profile'>),
        profile: (profiles ?? []).find((p) => p.id === r.user_id) ?? null,
      }));
    },
  });
}

/** Convites ativos do grupo (só o dono consegue ler). */
export function useInvites(enabled = true) {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.invites(groupId ?? ''),
    enabled: !!groupId && enabled,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('group_invites')
        .select('*')
        .eq('group_id', groupId!)
        .is('used_by', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
  });
}

/** Lançamentos do grupo com filtros. Ordem: data desc, depois criação desc. */
export function useTransactions(filters: TransactionFilters = {}, opts: { enabled?: boolean } = {}) {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.transactions(groupId ?? '', filters),
    enabled: !!groupId && (opts.enabled ?? true),
    queryFn: async (): Promise<Transaction[]> => {
      let q = supabase.from('transactions').select('*').eq('group_id', groupId!);
      if (filters.from) q = q.gte('date', filters.from);
      if (filters.to) q = q.lte('date', filters.to);
      if (filters.accountId) q = q.or(`account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`);
      if (filters.categoryIds?.length) q = q.in('category_id', filters.categoryIds);
      if (filters.type) q = q.eq('type', filters.type);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.recurrenceId) q = q.eq('recurrence_id', filters.recurrenceId);
      if (filters.installmentGroupId) q = q.eq('installment_group_id', filters.installmentGroupId);
      if (filters.createdBy) q = q.eq('created_by', filters.createdBy);
      q = q.order('date', { ascending: false }).order('created_at', { ascending: false });
      if (filters.limit) q = q.limit(filters.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Transaction[]).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
    },
  });
}

/** Recorrências do grupo. */
export function useRecurrences() {
  const groupId = useCurrentGroupId();
  return useQuery({
    queryKey: qk.recurrences(groupId ?? ''),
    enabled: !!groupId,
    queryFn: async (): Promise<Recurrence[]> => {
      const { data, error } = await supabase
        .from('recurrences')
        .select('*')
        .eq('group_id', groupId!)
        .order('active', { ascending: false })
        .order('description');
      if (error) throw error;
      return (data as Recurrence[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
    },
  });
}

/**
 * Depois de qualquer escrita em lançamentos, contas ou recorrências, chame a função retornada
 * para atualizar saldos, extrato, painel e relatórios.
 */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['accounts'] }),
      qc.invalidateQueries({ queryKey: ['recurrences'] }),
    ]);
  }, [qc]);
}

/** Gera os lançamentos previstos das recorrências do grupo (até 60 dias à frente). */
export async function generateRecurrences(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc('generate_recurrences', { p_group: groupId, p_horizon_days: 60 });
  if (error) throw error;
  return (data as number | null) ?? 0;
}
