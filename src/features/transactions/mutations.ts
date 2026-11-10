import { useMutation } from '@tanstack/react-query';
import { addMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { parseISODate, toISODate } from '@/lib/format';
import { splitInstallments } from '@/lib/rules';
import { useInvalidateFinance } from '@/hooks/queries';
import { attachmentPathsFor, removeAttachmentFiles } from '@/features/attachments/attachments';
import type { Transaction, TransactionInput } from '@/types';

function normalize(tx: Transaction): Transaction {
  return { ...tx, amount_cents: Number(tx.amount_cents) };
}

/** Cria (sem id) ou atualiza (com id) um lançamento. */
export function useSaveTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TransactionInput }): Promise<Transaction> => {
      if (id) {
        const { data, error } = await supabase.from('transactions').update(input).eq('id', id).select().single();
        if (error) throw error;
        return normalize(data as Transaction);
      }
      const { data, error } = await supabase.from('transactions').insert(input).select().single();
      if (error) throw error;
      return normalize(data as Transaction);
    },
    onSuccess: () => invalidate(),
  });
}

/**
 * Compra parcelada: cria `count` lançamentos ligados pelo mesmo installment_group_id,
 * um por mês a partir de input.date. O total é dividido e os centavos que sobram vão na 1ª parcela.
 */
export function useCreateInstallments() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ input, count }: { input: TransactionInput; count: number }): Promise<Transaction[]> => {
      if (count < 2 || count > 72) throw new Error('Escolha entre 2 e 72 parcelas.');
      const groupId = crypto.randomUUID();
      const amounts = splitInstallments(input.amount_cents, count);
      const first = parseISODate(input.date);
      const rows: TransactionInput[] = amounts.map((amount, i) => ({
        ...input,
        amount_cents: amount,
        date: toISODate(addMonths(first, i)),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: count,
      }));
      const { data, error } = await supabase.from('transactions').insert(rows).select();
      if (error) throw error;
      return (data as Transaction[]).map(normalize);
    },
    onSuccess: () => invalidate(),
  });
}

export type DeleteScope = 'one' | 'this-and-next' | 'all-installments';

/**
 * Exclui um lançamento. Para parcelas, `scope` permite excluir esta e as próximas ou todas.
 * Retorna as linhas excluídas (para oferecer "Desfazer").
 */
export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ tx, scope = 'one' }: { tx: Transaction; scope?: DeleteScope }): Promise<Transaction[]> => {
      // Os arquivos dos comprovantes saem pelo app (o banco só apaga as linhas dos anexos).
      let ids = [tx.id];
      if (scope !== 'one' && tx.installment_group_id) {
        let idQuery = supabase.from('transactions').select('id').eq('installment_group_id', tx.installment_group_id);
        if (scope === 'this-and-next') idQuery = idQuery.gte('installment_number', tx.installment_number ?? 1);
        const { data: idRows, error: idError } = await idQuery;
        if (idError) throw idError;
        ids = (idRows as Array<{ id: string }>).map((r) => r.id);
      }
      const paths = await attachmentPathsFor(ids);
      let query = supabase.from('transactions').delete();
      if (scope !== 'one' && tx.installment_group_id) {
        query = query.eq('installment_group_id', tx.installment_group_id);
        if (scope === 'this-and-next') query = query.gte('installment_number', tx.installment_number ?? 1);
      } else {
        query = query.eq('id', tx.id);
      }
      const { data, error } = await query.select();
      if (error) throw error;
      await removeAttachmentFiles(paths);
      return (data as Transaction[]).map(normalize);
    },
    onSuccess: () => invalidate(),
  });
}

/** Desfaz uma exclusão (os comprovantes não voltam: os arquivos já foram apagados) recriando as linhas (mesmos dados, novos ids). */
export function useRestoreTransactions() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (rows: Transaction[]) => {
      const inputs: TransactionInput[] = rows.map((t) => ({
        group_id: t.group_id,
        type: t.type,
        status: t.status,
        amount_cents: t.amount_cents,
        date: t.date,
        description: t.description,
        notes: t.notes,
        account_id: t.account_id,
        to_account_id: t.to_account_id,
        category_id: t.category_id,
        recurrence_id: t.recurrence_id,
        investment_id: t.investment_id,
        tags: t.tags,
        installment_group_id: t.installment_group_id,
        installment_number: t.installment_number,
        installment_total: t.installment_total,
      }));
      const { error } = await supabase.from('transactions').insert(inputs);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/**
 * Confirma um lançamento previsto (ex.: o aluguel caiu na conta): vira 'posted'.
 * Opcionalmente ajusta valor e data reais.
 */
export function useConfirmTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ id, amount_cents, date }: { id: string; amount_cents?: number; date?: string }) => {
      const patch: Partial<TransactionInput> = { status: 'posted' };
      if (amount_cents) patch.amount_cents = amount_cents;
      if (date) patch.date = date;
      const { error } = await supabase.from('transactions').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}
