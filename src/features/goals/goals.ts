import { useMutation, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { parseISODate, todayISO } from '@/lib/format';
import { accountMarketValue, type Position } from '@/features/investments/portfolio';
import type { AccountWithBalance, Goal, GoalInput, ISODate } from '@/types';

/**
 * Metas (Fase 7).
 * - Progresso: manual = valor guardado informado; account = saldo da conta (conta de investimento pelo valor de
 *   mercado; nunca negativo); investment = valor de mercado da aplicação.
 * - Aporte mensal sugerido = falta ÷ meses até o prazo (o mês do prazo conta; mínimo 1). Sem prazo, não há sugestão.
 */

export const GOAL_KIND_LABELS: Record<Goal['kind'], string> = {
  manual: 'Valor guardado à mão',
  account: 'Saldo de uma conta',
  investment: 'Valor de uma aplicação',
};

export interface GoalStatus {
  goal: Goal;
  current: number;
  /** 0 a 1 (limitado a 1). */
  ratio: number;
  remaining: number;
  reached: boolean;
  /** Meses até o prazo, contando o mês do prazo; 0 se o prazo passou; null sem prazo. */
  monthsLeft: number | null;
  /** Quanto guardar por mês para chegar no prazo; null sem prazo ou já alcançada. */
  monthlyNeeded: number | null;
  /** Prazo passou e a meta não foi alcançada. */
  late: boolean;
  /** Conta ou aplicação ligada foi excluída. */
  linkMissing: boolean;
}

export function goalStatus(
  goal: Goal,
  ctx: { accounts: AccountWithBalance[]; positions: Position[] },
  today: ISODate = todayISO(),
): GoalStatus {
  let current = 0;
  let linkMissing = false;
  if (goal.kind === 'manual') {
    current = goal.saved_cents;
  } else if (goal.kind === 'account') {
    const acc = goal.account_id ? ctx.accounts.find((a) => a.id === goal.account_id) : undefined;
    if (!acc) linkMissing = true;
    else current = acc.type === 'investment' ? accountMarketValue(acc.id, acc.balance_cents, ctx.positions) : acc.balance_cents;
  } else {
    const pos = goal.investment_id ? ctx.positions.find((p) => p.investment.id === goal.investment_id) : undefined;
    if (!pos) linkMissing = true;
    else current = pos.value;
  }
  current = Math.max(0, current);
  const remaining = Math.max(0, goal.target_cents - current);
  const reached = remaining === 0;

  let monthsLeft: number | null = null;
  if (goal.target_date) {
    monthsLeft = goal.target_date < today ? 0 : differenceInCalendarMonths(parseISODate(goal.target_date), parseISODate(today)) + 1;
  }
  const monthlyNeeded = !reached && monthsLeft !== null && monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : null;

  return {
    goal,
    current,
    ratio: Math.min(1, current / goal.target_cents),
    remaining,
    reached,
    monthsLeft,
    monthlyNeeded,
    late: !reached && monthsLeft === 0,
    linkMissing,
  };
}

function useInvalidateGoals() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['goals'] });
}

/** Cria (sem id) ou atualiza (com id) uma meta. */
export function useSaveGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: GoalInput }): Promise<Goal> => {
      const query = id ? supabase.from('goals').update(input).eq('id', id) : supabase.from('goals').insert(input);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as Goal;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Meta manual: soma (ou, com valor negativo, tira) do valor guardado. Nunca fica abaixo de zero. */
export function useAdjustGoalSaved() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async ({ goal, deltaCents }: { goal: Goal; deltaCents: number }): Promise<void> => {
      const { error } = await supabase
        .from('goals')
        .update({ saved_cents: Math.max(0, goal.saved_cents + deltaCents) })
        .eq('id', goal.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}
