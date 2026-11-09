import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Investment, InvestmentInput, InvestmentValue } from '@/types';

function useInvalidateInvestments() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['investments'] }),
      qc.invalidateQueries({ queryKey: ['investment-values'] }),
      qc.invalidateQueries({ queryKey: ['investment-flows'] }),
    ]);
}

/** Cria (sem id) ou atualiza (com id) uma aplicação. */
export function useSaveInvestment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: InvestmentInput }): Promise<Investment> => {
      const query = id
        ? supabase.from('investments').update(input).eq('id', id)
        : supabase.from('investments').insert(input);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as Investment;
    },
    onSuccess: () => invalidate(),
  });
}

/** Exclui a aplicação e os valores informados dela. Os lançamentos ficam, só perdem o vínculo. */
export function useDeleteInvestment() {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('investments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export type InvestmentValueInput = Pick<InvestmentValue, 'group_id' | 'investment_id' | 'date' | 'value_cents'>;

/** Grava valores de mercado; se já existe valor da aplicação nessa data, substitui. Aceita vários de uma vez. */
export function useSaveInvestmentValues() {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: async (rows: InvestmentValueInput[]): Promise<void> => {
      if (rows.length === 0) return;
      const { error } = await supabase.from('investment_values').upsert(rows, { onConflict: 'investment_id,date' });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteInvestmentValue() {
  const invalidate = useInvalidateInvestments();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('investment_values').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}
