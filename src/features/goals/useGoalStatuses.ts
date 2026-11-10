import { useMemo } from 'react';
import { useAccounts, useGoals, useInvestmentFlows, useInvestments, useInvestmentValues } from '@/hooks/queries';
import { portfolio } from '@/features/investments/portfolio';
import { goalStatus, type GoalStatus } from './goals';

/** Metas com o progresso calculado (contas e aplicações carregadas junto). */
export function useGoalStatuses() {
  const goalsQ = useGoals();
  const accountsQ = useAccounts();
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();

  const statuses = useMemo<GoalStatus[]>(() => {
    const accounts = accountsQ.data ?? [];
    const { positions } = portfolio(invQ.data ?? [], valuesQ.data ?? [], flowsQ.data ?? [], accounts);
    return (goalsQ.data ?? []).map((g) => goalStatus(g, { accounts, positions }));
  }, [goalsQ.data, accountsQ.data, invQ.data, valuesQ.data, flowsQ.data]);

  const queries = [goalsQ, accountsQ, invQ, valuesQ, flowsQ];
  return {
    statuses,
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error ?? null,
  };
}
